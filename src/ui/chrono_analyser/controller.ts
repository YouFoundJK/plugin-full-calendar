import { App, Notice, TFile, TFolder, SuggestModal, debounce } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import Plotly from './plotly-custom';
import * as yaml from 'js-yaml';

// --- Type Definitions for Clarity ---
interface TimeRecord {
  path: string;
  hierarchy: string;
  project: string;
  subproject: string;
  subprojectFull: string;
  duration: number;
  file: string;
  date: Date | null;
  metadata: FileMetadata; // We defined FileMetadata in the last step
  _effectiveDurationInPeriod?: number;
}

interface ProcessingError {
  file: string;
  path: string;
  reason: string;
}

interface SunburstData {
  // FIX: Explicitly type the arrays to prevent `never[]` inference.
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  recordsByLabel: Map<string, TimeRecord[]>;
}

interface FileMetadata {
  type?: 'recurring' | string;
  startTime?: string | number;
  endTime?: string | number;
  days?: number;
  date?: string | Date;
  startRecur?: string | Date;
  endRecur?: string | Date;
  daysOfWeek?: string | string[];
  [key: string]: any; // Allows for other properties not explicitly defined
}

// --- Folder Suggest Modal for Obsidian API ---
class FolderSuggestModal extends SuggestModal<TFolder> {
  constructor(
    app: App,
    private onChoose: (folder: TFolder) => void
  ) {
    super(app);
    this.setPlaceholder('Select a folder with your time tracking files...');
  }

  getSuggestions(query: string): TFolder[] {
    const queryLower = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter(
        (file): file is TFolder =>
          file instanceof TFolder && file.path.toLowerCase().includes(queryLower)
      );
  }

  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.createEl('div', { text: folder.path });
  }

  onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(folder);
  }
}

// --- The Main Controller Class ---
export class AnalysisController {
  private records: TimeRecord[] = [];
  private processingErrors: ProcessingError[] = [];
  private currentSunburstAggregatedData: SunburstData | null = null;
  private currentPieAggregatedData: {
    hours: Map<string, number>;
    recordsByCategory: Map<string, TimeRecord[]>;
    error: boolean;
  } | null = null;
  private filteredRecordsForCharts: TimeRecord[] = [];
  private allHierarchies: string[] = [];
  private allProjects: string[] = [];
  private flatpickrInstance: FlatpickrInstance | null = null;
  private uiStateKey = 'ChronoAnalyzerUIState_v3';

  constructor(
    private app: App,
    private rootEl: HTMLElement
  ) {}

  public async initialize(): Promise<void> {
    // console.log("[ChronoAnalyzer] Controller Initialized.");
    this.setupEventListeners();
    this.loadUIState();
    this.handleAnalysisTypeChange(); // Ensure correct controls are visible on load
    await this.loadInitialFolder();
  }

  public destroy(): void {
    // console.log("[ChronoAnalyzer] Controller Destroyed.");
    this.flatpickrInstance?.destroy();
    // In a real app, you would remove all event listeners here to prevent memory leaks.
    // For this port, we assume the view's container is destroyed, which handles this.
  }
  private showStatus(
    message: string,
    type: 'info' | 'error' | 'success' | 'warning' = 'info',
    duration: number = 4000
  ) {
    // We can add more complex logic here later if needed (e.g., different styling)
    // For now, we just use Obsidian's Notice.
    new Notice(message, duration);
  }
  private async loadInitialFolder(): Promise<void> {
    const defaultPath = 'Calender';
    const abstractFile = this.app.vault.getAbstractFileByPath(defaultPath);

    if (abstractFile instanceof TFolder) {
      new Notice(`Loading default folder: "${defaultPath}"`, 2000);
      await this.loadAndProcessFolder(abstractFile);
    } else {
      new Notice(`Default folder "${defaultPath}" not found. Please select a folder.`, 5000);
      this.promptForFolder();
    }
  }

  private promptForFolder = () => {
    new FolderSuggestModal(this.app, folder => {
      this.loadAndProcessFolder(folder);
    }).open();
  };

  private async loadAndProcessFolder(folder: TFolder): Promise<void> {
    // Clear any existing filters to ensure we see the full scope of the new folder.
    this.clearAllFilters();
    // -----------------------

    const notice = new Notice(`Scanning folder: "${folder.path}"...`, 2000);
    const filesToProcess: TFile[] = [];

    const findFilesRecursively = (currentFolder: TFolder) => {
      for (const child of currentFolder.children) {
        if (child instanceof TFolder) {
          findFilesRecursively(child);
        } else if (child instanceof TFile && child.extension.toLowerCase() === 'md') {
          filesToProcess.push(child);
        }
      }
    };

    findFilesRecursively(folder);
    notice.hide();

    if (filesToProcess.length === 0) {
      new Notice('No .md files found in the selected folder.', 3000);
      // We should still update the analysis to clear out old data from the view
      this.records = [];
      this.processingErrors = [];
      this.updateAnalysis();
      return;
    }

    await this.processFiles(filesToProcess);
  }

  private async processFiles(files: TFile[]): Promise<void> {
    const notice = new Notice(`Parsing ${files.length} files...`, 10000);
    this.records = [];
    this.processingErrors = [];

    const promises = files.map(file => this.parseFile(file));
    const results = await Promise.allSettled(promises);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        this.records.push(result.value);
      } else if (result.status === 'rejected') {
        this.processingErrors.push({
          file: result.reason.fileName || 'Unknown',
          path: result.reason.filePath || 'N/A',
          reason: result.reason.message || 'Unknown error'
        });
      }
    });

    notice.setMessage(
      `Processed: ${this.records.length} valid files. Issues: ${this.processingErrors.length}.`
    );
    setTimeout(() => notice.hide(), 4000);

    // console.log(`[DEBUG] 1. After Parsing: this.records contains ${this.records.length} records.`);
    // console.log("[DEBUG] First 5 parsed records:", this.records.slice(0, 5));

    this.populateFilterDataSources();
    this.updateAnalysis();
  }

  // Replace the entire parseFile method.

  private async parseFile(file: TFile): Promise<TimeRecord> {
    try {
      const fileContent = await this.app.vault.read(file);
      const pathParts = file.path.split('/');
      const hierarchy =
        pathParts.length > 2
          ? pathParts[1]
          : pathParts.length > 1 && pathParts[0] !== ''
            ? pathParts[0]
            : 'root';

      const filenameRegex =
        /^(?:(\d{4}-\d{2}-\d{2})\s+(.+?)\s+-\s+(.+?)(?:\s+([IVXLCDM\d]+))?|(?:\(([^)]+)\)\s*)(.+?)(?:\s*-\s*(.+?))?(?:\s+([IVXLCDM\d]+))?)\.md$/i;
      const filenameMatch = file.name.match(filenameRegex);
      if (!filenameMatch) throw new Error('Filename pattern mismatch.');

      let dateStr, projectFromFile, subprojectRaw, serialFromFile;
      if (filenameMatch[1]) {
        dateStr = filenameMatch[1];
        projectFromFile = filenameMatch[2];
        subprojectRaw = filenameMatch[3];
        serialFromFile = filenameMatch[4];
      } else {
        projectFromFile = filenameMatch[6];
        subprojectRaw = filenameMatch[7];
        serialFromFile = filenameMatch[8];
      }

      const yamlMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!yamlMatch) throw new Error('No YAML front matter found.');

      const metadata = yaml.load(yamlMatch[1]) as FileMetadata;
      if (!metadata || typeof metadata !== 'object')
        throw new Error('YAML front matter empty or not an object.');

      const eventDuration =
        metadata.type === 'recurring'
          ? metadata.startTime && metadata.endTime
            ? this.calculateDuration(metadata.startTime, metadata.endTime, 1)
            : 0
          : this.calculateDuration(metadata.startTime, metadata.endTime, metadata.days);

      let recordDate: Date | null = null;
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        recordDate = new Date(Date.UTC(year, month - 1, day));
      } else if (metadata.date) {
        const metaDateVal = metadata.date;
        if (metaDateVal instanceof Date && !isNaN(metaDateVal.getTime())) {
          recordDate = new Date(
            Date.UTC(metaDateVal.getFullYear(), metaDateVal.getMonth(), metaDateVal.getDate())
          );
        } else {
          const metaDateStr = String(metaDateVal);
          const datePartsMatch = metaDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (datePartsMatch) {
            const [year, month, day] = datePartsMatch.slice(1, 4).map(Number);
            recordDate = new Date(Date.UTC(year, month - 1, day));
          } else {
            const parsedFallbackDate = new Date(metaDateStr);
            if (!isNaN(parsedFallbackDate.getTime())) {
              recordDate = new Date(
                Date.UTC(
                  parsedFallbackDate.getFullYear(),
                  parsedFallbackDate.getMonth(),
                  parsedFallbackDate.getDate()
                )
              );
            }
          }
        }
      }
      if (recordDate && isNaN(recordDate.getTime()))
        throw new Error(`Invalid date parsed: ${dateStr || metadata.date}`);

      const finalProject = projectFromFile ? projectFromFile.trim() : 'Unknown Project';
      let baseSubproject = 'none',
        fullSubproject = 'none';
      if (subprojectRaw) {
        subprojectRaw = subprojectRaw.trim();
        const subprojectSerialMatch = subprojectRaw.match(/^(.*?)\s+([IVXLCDM\d]+)$/);
        if (subprojectSerialMatch) {
          baseSubproject = subprojectSerialMatch[1].trim();
          serialFromFile = serialFromFile || subprojectSerialMatch[2];
        } else {
          baseSubproject = subprojectRaw;
        }
        fullSubproject = baseSubproject;
        if (serialFromFile) fullSubproject += ` ${serialFromFile.trim()}`;
      }
      if (baseSubproject === '') baseSubproject = 'none';
      fullSubproject = fullSubproject.trim();
      if (fullSubproject === '') fullSubproject = 'none';

      return {
        path: file.path,
        hierarchy,
        project: finalProject,
        subproject: baseSubproject,
        subprojectFull: fullSubproject,
        duration: eventDuration,
        file: file.name,
        date: recordDate,
        metadata
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred during parsing.';
      throw { message: errorMessage, fileName: file.name, filePath: file.path };
    }
  }

  private setupEventListeners = () => {
    // Folder selection button is now Obsidian native
    this.rootEl
      .querySelector('#folderInputButton')
      ?.addEventListener('click', this.promptForFolder);

    // Date Picker
    const datePickerEl = this.rootEl.querySelector<HTMLInputElement>('#dateRangePicker');
    if (datePickerEl) {
      this.flatpickrInstance = flatpickr(datePickerEl, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        onChange: () => this.updateAnalysis()
      });
    }

    // Cache Button (Stubbed)
    this.rootEl
      .querySelector('#clearCacheBtn')
      ?.addEventListener('click', () => new Notice('Cache clearing will be implemented later.'));

    // Other UI elements
    this.rootEl.querySelector('#clearDatesBtn')?.addEventListener('click', this.clearDateFilters);
    this.rootEl
      .querySelector('#setTodayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('today'));
    this.rootEl
      .querySelector('#setYesterdayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('yesterday'));
    this.rootEl
      .querySelector('#setThisWeekBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisWeek'));
    this.rootEl
      .querySelector('#setThisMonthBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisMonth'));
    this.rootEl
      .querySelector('#analysisTypeSelect')
      ?.addEventListener('change', this.handleAnalysisTypeChange);
    this.rootEl.querySelector('#levelSelect_pie')?.addEventListener('change', this.updateAnalysis);
    this.rootEl.querySelector('#levelSelect')?.addEventListener('change', this.updateAnalysis);
    this.rootEl
      .querySelector('#patternInput')
      ?.addEventListener('input', debounce(this.updateAnalysis, 300));
    this.rootEl
      .querySelector('#timeSeriesGranularitySelect')
      ?.addEventListener('change', this.updateAnalysis);
    this.rootEl.querySelector('#timeSeriesTypeSelect')?.addEventListener('change', () => {
      this.handleTimeSeriesTypeVis();
      this.updateAnalysis();
    });
    this.rootEl
      .querySelector('#timeSeriesStackingLevelSelect')
      ?.addEventListener('change', this.updateAnalysis);
    this.rootEl
      .querySelector('#activityPatternTypeSelect')
      ?.addEventListener('change', this.updateAnalysis);
    this.rootEl.querySelector('#popupCloseBtn')?.addEventListener('click', this.hideDetailPopup);
    this.rootEl.querySelector('#detailOverlay')?.addEventListener('click', this.hideDetailPopup);
  };

  // ... all other methods are direct ports ...

  private handleAnalysisTypeChange = () => {
    const analysisType = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value;
    const specificControlContainers = [
      'sunburstBreakdownLevelContainer',
      'pieBreakdownLevelContainer',
      'pieCategoryFilterContainer',
      'timeSeriesGranularityContainer',
      'timeSeriesTypeContainer',
      'timeSeriesStackingLevelContainer',
      'activityPatternTypeContainer'
    ];
    specificControlContainers.forEach(id =>
      this.rootEl.querySelector(`#${id}`)?.classList.add('hidden-controls')
    );

    if (analysisType === 'sunburst') {
      this.rootEl
        .querySelector('#sunburstBreakdownLevelContainer')
        ?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#pieCategoryFilterContainer')?.classList.remove('hidden-controls');
    } else if (analysisType === 'pie') {
      this.rootEl.querySelector('#pieBreakdownLevelContainer')?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#pieCategoryFilterContainer')?.classList.remove('hidden-controls');
    } else if (analysisType === 'time-series') {
      this.rootEl
        .querySelector('#timeSeriesGranularityContainer')
        ?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#timeSeriesTypeContainer')?.classList.remove('hidden-controls');
      this.handleTimeSeriesTypeVis();
    } else if (analysisType === 'activity') {
      this.rootEl
        .querySelector('#activityPatternTypeContainer')
        ?.classList.remove('hidden-controls');
    }
    this.updateAnalysis();
  };

  private handleTimeSeriesTypeVis = () => {
    const timeSeriesType =
      this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value;
    const stackingLevelContainer = this.rootEl.querySelector<HTMLElement>(
      '#timeSeriesStackingLevelContainer'
    );
    if (stackingLevelContainer) {
      if (timeSeriesType === 'stackedArea') {
        stackingLevelContainer.classList.remove('hidden-controls');
      } else {
        stackingLevelContainer.classList.add('hidden-controls');
      }
    }
  };

  private saveUIState = () => {
    const getElValue = (id: string) =>
      this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
    const state: any = {
      analysisTypeSelect: getElValue('analysisTypeSelect'),
      hierarchyFilter: getElValue('hierarchyFilterInput'),
      projectFilter: getElValue('projectFilterInput'),
      levelSelect_pie: getElValue('levelSelect_pie'),
      levelSelect: getElValue('levelSelect'),
      patternInput: getElValue('patternInput'),
      timeSeriesGranularity: getElValue('timeSeriesGranularitySelect'),
      timeSeriesType: getElValue('timeSeriesTypeSelect'),
      timeSeriesStackingLevel: getElValue('timeSeriesStackingLevelSelect'),
      activityPatternType: getElValue('activityPatternTypeSelect')
    };
    if (this.flatpickrInstance && this.flatpickrInstance.selectedDates.length === 2) {
      state.startDate = this._getISODate(this.flatpickrInstance.selectedDates[0]);
      state.endDate = this._getISODate(this.flatpickrInstance.selectedDates[1]);
    } else {
      state.startDate = '';
      state.endDate = '';
    }
    localStorage.setItem(
      this.uiStateKey,
      JSON.stringify(Object.fromEntries(Object.entries(state).filter(([_, v]) => v != null)))
    );
  };

  private loadUIState = () => {
    const savedState = localStorage.getItem(this.uiStateKey);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        const setVal = (id: string, val: string | undefined) => {
          const el = this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
          if (el && val !== undefined) {
            el.value = val;
          }
        };
        setVal('analysisTypeSelect', state.analysisTypeSelect);
        setVal('hierarchyFilterInput', state.hierarchyFilter);
        setVal('projectFilterInput', state.projectFilter);

        if (state.startDate && state.endDate && this.flatpickrInstance) {
          setTimeout(
            () => this.flatpickrInstance?.setDate([state.startDate, state.endDate], false),
            0
          );
        } else {
          setTimeout(() => this.flatpickrInstance?.clear(false), 0);
        }

        setVal('levelSelect_pie', state.levelSelect_pie);
        setVal('levelSelect', state.levelSelect);
        setVal('patternInput', state.patternInput);
        setVal('timeSeriesGranularitySelect', state.timeSeriesGranularity);
        setVal('timeSeriesTypeSelect', state.timeSeriesType);
        setVal('timeSeriesStackingLevelSelect', state.timeSeriesStackingLevel);
        setVal('activityPatternTypeSelect', state.activityPatternType);
      } catch (error) {
        console.error('[ChronoAnalyzer] Error loading UI state:', error);
        localStorage.removeItem(this.uiStateKey);
      }
    }
  };

  private updateAnalysis = () => {
    // We wrap the entire analysis logic in a setTimeout to de-couple it from the
    // event loop and allow the UI to feel more responsive.
    setTimeout(() => {
      // console.log(`[DEBUG] 2. Entering updateAnalysis: Starting with ${this.records.length} total records.`);
      const statsGrid = this.rootEl.querySelector<HTMLElement>('#statsGrid');
      const mainChartContainer = this.rootEl.querySelector<HTMLElement>('#mainChartContainer');
      const errorLogContainer = this.rootEl.querySelector<HTMLElement>('#errorLogContainer');
      const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
      const legendEl = this.rootEl.querySelector<HTMLElement>('#customLegend');

      if (!mainChartEl) return;
      Plotly.purge(mainChartEl);

      const hideUIElements = () => {
        if (statsGrid) statsGrid.style.display = 'none';
        if (mainChartContainer) mainChartContainer.style.display = 'none';
        if (legendEl) legendEl.style.display = 'none';
        if (errorLogContainer && this.processingErrors.length === 0 && this.records.length === 0) {
          errorLogContainer.style.display = 'none';
        }
        const statEl = this.rootEl.querySelector('#currentAnalysisTypeStat') as HTMLElement;
        if (statEl) statEl.textContent = 'N/A';
      };

      if (this.records.length === 0 && this.processingErrors.length === 0) {
        hideUIElements();
        this.saveUIState();
        return;
      }

      const notice = new Notice(`Updating analysis...`, 2000);

      this.renderErrorLog();
      const filteredDataResults = this.getFilteredRecords();
      this.filteredRecordsForCharts = filteredDataResults.records;

      // console.log(`[DEBUG] 5. After Filtering: this.filteredRecordsForCharts now has ${this.filteredRecordsForCharts.length} records.`);

      notice.hide();

      if (this.filteredRecordsForCharts.length === 0 && this.records.length > 0) {
        new Notice('No data matches current filters.', 3000);
      }

      if (this.filteredRecordsForCharts.length === 0) {
        hideUIElements();
        this.saveUIState();
        return;
      }

      if (statsGrid) statsGrid.style.display = '';
      if (mainChartContainer) mainChartContainer.style.display = '';
      if (errorLogContainer) errorLogContainer.style.display = 'block';

      (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent =
        filteredDataResults.totalHours.toFixed(2);
      (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = String(
        filteredDataResults.fileCount
      );

      const analysisTypeEl = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect');
      const analysisType = analysisTypeEl?.value;
      const analysisTypeStatEl = this.rootEl.querySelector(
        '#currentAnalysisTypeStat'
      ) as HTMLElement;
      let analysisName = 'Unknown';

      if (analysisType === 'sunburst') {
        analysisName = 'Category Breakdown';
        if (legendEl) legendEl.style.display = ''; // SHOW legend for sunburst charts
        const levelSelect = document.getElementById('levelSelect') as HTMLSelectElement | null;
        const patternInput = document.getElementById('patternInput') as HTMLInputElement | null;

        const sunburstLevel = levelSelect?.value ?? '';
        const pattern = patternInput?.value ?? '';

        let recordsForSunburst = filteredDataResults.records;

        // Apply category filter to the records before aggregation
        if (pattern?.trim()) {
          try {
            const regex = new RegExp(pattern.trim(), 'i');
            const outerField = sunburstLevel === 'project' ? 'project' : 'subproject';
            recordsForSunburst = filteredDataResults.records.filter(record => {
              const outerValue = record[outerField] || '';
              return regex.test(outerValue);
            });
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            mainChartEl.innerHTML = `<p class="chart-message error">Invalid Regex: ${errorMessage}</p>`;
            this.showStatus(`Invalid Category Filter Regex: ${errorMessage}`, 'error');
            if (legendEl) legendEl.innerHTML = ''; // Clear legend on error
            return;
          }
        }

        this.currentSunburstAggregatedData = this.aggregateForSunburst(
          recordsForSunburst,
          sunburstLevel
        );

        if (
          this.currentSunburstAggregatedData &&
          this.currentSunburstAggregatedData.ids.length > 1
        ) {
          // more than just the root
          this.renderSunburstChartDisplay(this.currentSunburstAggregatedData);
        } else if (pattern?.trim() && recordsForSunburst.length === 0) {
          mainChartEl.innerHTML =
            '<p class="chart-message">No data matches the Category Filter.</p>';
          if (legendEl) legendEl.innerHTML = ''; // Also clear legend content
        } else {
          mainChartEl.innerHTML =
            '<p class="chart-message">No data for Sunburst Chart with current filters.</p>';
          if (legendEl) legendEl.innerHTML = ''; // Also clear legend content
        }
      } else {
        if (legendEl) legendEl.style.display = 'none';

        if (analysisType === 'time-series') {
          analysisName = 'Time-Series Trend';
          this.renderTimeSeriesChart();
        } else if (analysisType === 'activity') {
          analysisName = 'Activity Patterns';
          this.renderActivityPatternChart();
        } else if (analysisType === 'pie') {
          analysisName = 'Category Breakdown';
          const pieLevel =
            this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')?.value || 'hierarchy';
          const piePattern =
            this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value || '';
          this.currentPieAggregatedData = this.aggregateForPieChart(
            filteredDataResults,
            pieLevel as keyof TimeRecord,
            piePattern
          );
          if (
            !this.currentPieAggregatedData.error &&
            this.currentPieAggregatedData.hours.size > 0
          ) {
            this.renderPieChartDisplay(this.currentPieAggregatedData.hours);
          } else {
            mainChartEl.innerHTML =
              '<p class="chart-message">No data for Pie Chart with current filters.</p>';
          }
        }
      }

      if (analysisTypeStatEl) analysisTypeStatEl.textContent = analysisName;
      this.saveUIState();
    }, 50); // The setTimeout now correctly wraps the entire function body
  }; // The closing curly brace for the arrow function itself

  // Placeholders for the full port of every other method from calender.js
  // The implementation would be a direct copy-paste with `document` -> `this.rootEl`
  private _getISODate(date: Date | null): string | null {
    if (!date || isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  private _getWeekStartDate(date: Date): Date | null {
    if (!(date instanceof Date) || isNaN(date.getTime())) return null;
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday
    // This logic sets Monday as the start of the week.
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  }

  private _getMonthStartDate(date: Date): Date | null {
    if (!date || isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private _getHourFromTimeStr(timeStr: any): number | null {
    if (timeStr == null) return null;
    if (typeof timeStr === 'number') {
      const hour = Math.floor(timeStr);
      return hour >= 0 && hour <= 23 ? hour : null;
    }
    const sTimeStr = String(timeStr);
    const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      return hour >= 0 && hour <= 23 ? hour : null;
    }
    try {
      const d = new Date(sTimeStr);
      if (!isNaN(d.getTime())) {
        const hour = d.getUTCHours();
        return hour >= 0 && hour <= 23 ? hour : null;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  private calculateDuration(startTime: any, endTime: any, days = 1): number {
    const parseTime = (timeStr: any): { hours: number; minutes: number } | null => {
      if (timeStr == null) return null;

      if (typeof timeStr === 'number') {
        if (isNaN(timeStr) || !isFinite(timeStr)) return null;
        return {
          hours: Math.floor(timeStr),
          minutes: Math.round((timeStr - Math.floor(timeStr)) * 60)
        };
      }

      const sTimeStr = String(timeStr);
      const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) return { hours: parseInt(timeMatch[1]), minutes: parseInt(timeMatch[2]) };

      try {
        const d = new Date(sTimeStr);
        if (!isNaN(d.getTime())) return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
      } catch (e) {
        /* ignore */
      }

      return null;
    };

    try {
      const start = parseTime(startTime);
      const end = parseTime(endTime);
      if (!start || !end) return 0;

      let startMinutes = start.hours * 60 + start.minutes;
      let endMinutes = end.hours * 60 + end.minutes;
      if (endMinutes < startMinutes) endMinutes += 24 * 60; // Handles overnight tasks

      const durationForOneDay = (endMinutes - startMinutes) / 60;
      const numDays = Number(days) || 0;
      return durationForOneDay * Math.max(0, numDays);
    } catch (err) {
      return 0;
    }
  }
  private calculateRecurringInstancesInDateRange(
    metadata: any,
    filterStartDate: Date | null,
    filterEndDate: Date | null
  ): number {
    const {
      startRecur: metaStartRecurStr,
      endRecur: metaEndRecurStr,
      daysOfWeek: metaDaysOfWeek
    } = metadata;
    if (!metaStartRecurStr || !metaDaysOfWeek) return 0;

    let recurrenceStart: Date | null = null;
    const tempStartDate = new Date(String(metaStartRecurStr));
    if (!isNaN(tempStartDate.getTime())) {
      recurrenceStart = new Date(
        Date.UTC(tempStartDate.getFullYear(), tempStartDate.getMonth(), tempStartDate.getDate())
      );
    }
    if (!recurrenceStart) return 0;

    let recurrenceEnd: Date = new Date(Date.UTC(9999, 11, 31));
    if (metaEndRecurStr) {
      const tempEndDate = new Date(String(metaEndRecurStr));
      if (!isNaN(tempEndDate.getTime())) {
        recurrenceEnd = new Date(
          Date.UTC(tempEndDate.getFullYear(), tempEndDate.getMonth(), tempEndDate.getDate())
        );
      }
    }

    const effectiveStart = new Date(
      Math.max(recurrenceStart.getTime(), filterStartDate?.getTime() || recurrenceStart.getTime())
    );
    const effectiveEnd = new Date(
      Math.min(recurrenceEnd.getTime(), filterEndDate?.getTime() || recurrenceEnd.getTime())
    );

    if (effectiveStart > effectiveEnd) return 0;

    const targetDays = (
      Array.isArray(metaDaysOfWeek)
        ? metaDaysOfWeek
        : String(metaDaysOfWeek)
            .replace(/[\[\]\s]/g, '')
            .split(',')
    )
      .map(d => this.getDayOfWeekNumber(d))
      .filter((d): d is number => d !== undefined);

    if (targetDays.length === 0) return 0;

    let count = 0;
    const currentDate = new Date(effectiveStart.getTime());
    while (currentDate.getTime() <= effectiveEnd.getTime()) {
      if (targetDays.includes(currentDate.getUTCDay())) {
        count++;
      }
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    return count;
  }
  private getDayOfWeekNumber(dayChar: string): number | undefined {
    const mapping: { [key: string]: number } = {
      U: 0,
      M: 1,
      T: 2,
      W: 3,
      R: 4,
      F: 5,
      S: 6
    };
    return mapping[String(dayChar).trim().toUpperCase()];
  }
  private getFilteredRecords(): {
    records: TimeRecord[];
    totalHours: number;
    fileCount: number;
    filterStartDate: Date | null;
    filterEndDate: Date | null;
  } {
    const hierarchyFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#hierarchyFilterInput')
        ?.value.trim()
        .toLowerCase() || '';
    const projectFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#projectFilterInput')
        ?.value.trim()
        .toLowerCase() || '';

    let startDateStr = '';
    let endDateStr = '';
    if (this.flatpickrInstance && this.flatpickrInstance.selectedDates.length === 2) {
      startDateStr = this._getISODate(this.flatpickrInstance.selectedDates[0]) || '';
      endDateStr = this._getISODate(this.flatpickrInstance.selectedDates[1]) || '';
    }

    // console.log("[DEBUG] 3. Inside getFilteredRecords - Current Filters:", {
    //         hierarchy: hierarchyFilter,
    //         project: projectFilter,
    //         startDate: startDateStr,
    //         endDate: endDateStr
    // });
    let filterStartDate: Date | null = startDateStr ? new Date(startDateStr) : null;
    let filterEndDate: Date | null = endDateStr ? new Date(endDateStr) : null;

    const filteredRecs: TimeRecord[] = [];
    let totalHours = 0;
    const uniqueFiles = new Set<string>();

    for (const record of this.records) {
      if (!record) continue;
      if (hierarchyFilter && record.hierarchy && record.hierarchy.toLowerCase() !== hierarchyFilter)
        continue;
      if (projectFilter && record.project && record.project.toLowerCase() !== projectFilter)
        continue;

      let effectiveDuration = 0;
      let includeRecord = false;

      if (record.metadata?.type === 'recurring') {
        if (!record.metadata.startRecur || !record.metadata.daysOfWeek || record.duration === 0) {
          effectiveDuration = 0;
        } else {
          const numInstances = this.calculateRecurringInstancesInDateRange(
            record.metadata,
            filterStartDate,
            filterEndDate
          );
          effectiveDuration = (record.duration || 0) * numInstances;
          if (effectiveDuration > 0) includeRecord = true;
        }
      } else {
        // console.log(`[DEBUG] Date Filter REJECTED record:`, {
        //     fileName: record.file,
        //     recordDate: record.date // This will likely be null or invalid
        // });
        if (this.isWithinDateRange(record.date, startDateStr, endDateStr)) {
          effectiveDuration = record.duration;
          includeRecord = true;
        }
      }

      if (includeRecord && effectiveDuration > 0) {
        filteredRecs.push({
          ...record,
          _effectiveDurationInPeriod: effectiveDuration
        });
        totalHours += effectiveDuration;
        uniqueFiles.add(record.path);
      }
    }
    // console.log(`[DEBUG] 4. Exiting getFilteredRecords: ${filteredRecs.length} records remain after filtering.`);
    return {
      records: filteredRecs,
      totalHours,
      fileCount: uniqueFiles.size,
      filterStartDate,
      filterEndDate
    };
  }

  // Replace the entire isWithinDateRange method with this one.

  private isWithinDateRange(
    recordDateObj: Date | null,
    filterStartDateStr: string,
    filterEndDateStr: string
  ): boolean {
    // If no date filters are set, the record is always within range.
    if (!filterStartDateStr && !filterEndDateStr) {
      return true;
    }

    // If the record itself has no date, it cannot be in any date range.
    if (!recordDateObj || isNaN(recordDateObj.getTime())) {
      return false;
    }

    // --- FIX: Normalize all dates to UTC midnight to ignore timezones ---
    const recordTime = new Date(
      Date.UTC(
        recordDateObj.getUTCFullYear(),
        recordDateObj.getUTCMonth(),
        recordDateObj.getUTCDate()
      )
    ).getTime();

    if (filterStartDateStr) {
      const [y, m, d] = filterStartDateStr.split('-').map(Number);
      const filterStartTime = new Date(Date.UTC(y, m - 1, d)).getTime();
      if (recordTime < filterStartTime) {
        return false; // Record is before the start date
      }
    }

    if (filterEndDateStr) {
      const [y, m, d] = filterEndDateStr.split('-').map(Number);
      const filterEndTime = new Date(Date.UTC(y, m - 1, d)).getTime();
      if (recordTime > filterEndTime) {
        return false; // Record is after the end date
      }
    }

    // If we passed all checks, the record is within the range.
    return true;
  }

  private aggregateForSunburst(filteredRecords: TimeRecord[], level: string): SunburstData {
    // console.log(`[Chrono Analyser] Aggregating for Sunburst level: "${level}"`);

    // FIX: Initialize with explicitly typed empty arrays.
    const data: SunburstData = {
      ids: [],
      labels: [],
      parents: [],
      values: [],
      recordsByLabel: new Map()
    };

    // FIX: Define which keys are valid for dynamic access.
    let innerField: keyof TimeRecord;
    let outerField: keyof TimeRecord;

    if (level === 'project') {
      innerField = 'hierarchy';
      outerField = 'project';
    } else {
      innerField = 'project';
      outerField = 'subproject';
    }

    const uniqueEntries = new Map<
      string,
      {
        duration: number;
        records: TimeRecord[];
        inner: string;
        outer: string;
      }
    >();

    for (const record of filteredRecords) {
      const duration = record._effectiveDurationInPeriod;
      if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) continue;

      // FIX: TypeScript now knows `record[innerField]` is safe.
      const innerVal = String(record[innerField] || `(No ${innerField})`).trim();
      const outerVal = String(record[outerField] || `(No ${outerField})`).trim();
      const leafId = `${innerVal} - ${outerVal}`;

      if (!uniqueEntries.has(leafId)) {
        uniqueEntries.set(leafId, {
          duration: 0,
          records: [],
          inner: innerVal,
          outer: outerVal
        });
      }
      const entry = uniqueEntries.get(leafId)!;
      entry.duration += duration;
      entry.records.push(record);
    }

    const parentTotals = new Map<string, number>();
    let grandTotal = 0;

    for (const { duration, inner } of uniqueEntries.values()) {
      parentTotals.set(inner, (parentTotals.get(inner) || 0) + duration);
    }
    for (const total of parentTotals.values()) {
      grandTotal += total;
    }

    const rootId = 'Total';
    // All .push() calls are now type-safe because the arrays are correctly typed.
    data.ids.push(rootId);
    data.labels.push(rootId);
    data.parents.push('');
    data.values.push(grandTotal);
    data.recordsByLabel.set(rootId, filteredRecords);

    for (const [parent, total] of parentTotals.entries()) {
      data.ids.push(parent);
      data.labels.push(parent);
      data.parents.push(rootId);
      data.values.push(total);
      const parentRecords = filteredRecords.filter(
        r => String(r[innerField] || `(No ${innerField})`).trim() === parent
      );
      data.recordsByLabel.set(parent, parentRecords);
    }

    for (const [leafId, { duration, records, inner, outer }] of uniqueEntries.entries()) {
      data.ids.push(leafId);
      data.labels.push(outer);
      data.parents.push(inner);
      data.values.push(duration);
      data.recordsByLabel.set(leafId, records);
    }

    return data;
  }

  private aggregateForPieChart(
    filteredData: { records: TimeRecord[] },
    level: keyof TimeRecord,
    pattern: string | null = null
  ): {
    hours: Map<string, number>;
    recordsByCategory: Map<string, TimeRecord[]>;
    error: boolean;
  } {
    const { records: filteredRecords } = filteredData;
    const hours = new Map<string, number>();
    const recordsByCategory = new Map<string, TimeRecord[]>();
    let regex: RegExp | null = null;
    let aggregationError = false;

    if (pattern?.trim()) {
      try {
        regex = new RegExp(pattern.trim(), 'i');
      } catch (e) {
        // FIX: Handle 'unknown' error type and use this.showStatus
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.showStatus(`Invalid Pie Regex: ${errorMessage}`, 'error');
        aggregationError = true;
        return { hours, recordsByCategory, error: aggregationError };
      }
    }

    for (const record of filteredRecords) {
      const key = record[level] != null ? String(record[level]) : `(No ${level} defined)`;
      if (regex && !regex.test(key)) continue;
      if ((record._effectiveDurationInPeriod || 0) <= 0) continue;

      hours.set(key, (hours.get(key) || 0) + (record._effectiveDurationInPeriod as number));
      if (!recordsByCategory.has(key)) {
        recordsByCategory.set(key, []);
      }
      recordsByCategory.get(key)!.push(record);
    }
    return { hours, recordsByCategory, error: aggregationError };
  }

  private renderPieChartDisplay(hoursData: Map<string, number>) {
    const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
    if (!mainChartEl) return;

    const levelSelect = this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie');
    const chartTitleText = levelSelect
      ? levelSelect.selectedOptions[0].text.split('(')[0].trim()
      : 'Category';

    const data: Plotly.Data[] = [
      {
        type: 'pie',
        labels: Array.from(hoursData.keys()),
        values: Array.from(hoursData.values()),
        textinfo: 'label+percent',
        textposition: 'outside',
        hoverinfo: 'label+value+percent',
        automargin: true,
        marker: {
            line: {
                color: 'white',
                width: 2
            }
        }
      }
    ];
    const layout: Partial<Plotly.Layout> = {
      title: { text: `Time Distribution by ${chartTitleText}` },
      showlegend: true,
      height: 500
    };

    // FIX: Pass the standard HTMLElement to newPlot.
    Plotly.newPlot(mainChartEl, data, layout, { responsive: true });

    // FIX: Use `any` to attach the event listener and handle the event data.
    const plotlyChart = mainChartEl as any;
    plotlyChart.removeAllListeners('plotly_click');
    plotlyChart.on('plotly_click', (eventData: any) => {
      if (eventData.points && eventData.points.length > 0) {
        const point = eventData.points[0];
        const categoryName = point.label;
        if (this.currentPieAggregatedData?.recordsByCategory.has(categoryName)) {
          this.showDetailPopup(
            categoryName,
            this.currentPieAggregatedData.recordsByCategory.get(categoryName)!,
            { type: 'pie', value: point.value }
          );
        }
      }
    });
  }

  private renderSunburstChartDisplay(sunburstData: SunburstData) {
    const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
    if (!mainChartEl) return;

    // ... Full sunburst rendering logic here ...
    // The key part is the event listener at the end:

    Plotly.newPlot(
      mainChartEl,
      [
        /* ... sunburst data trace ... */
      ],
      {
        /* ... sunburst layout ... */
      }
    );

    const plotlyChart = mainChartEl as any;
    plotlyChart.removeAllListeners('plotly_sunburstclick');
    plotlyChart.on('plotly_sunburstclick', (eventData: any) => {
      if (eventData.points && eventData.points.length > 0) {
        const point = eventData.points[0];
        if (point.id && sunburstData.recordsByLabel.has(point.id)) {
          this.showDetailPopup(point.label, sunburstData.recordsByLabel.get(point.id)!, {
            type: 'sunburst',
            value: point.value
          });
        }
      }
    });
  }

  private renderTimeSeriesChart() {
    const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
    if (!mainChartEl) return;
    Plotly.purge(mainChartEl);

    if (!this.filteredRecordsForCharts || this.filteredRecordsForCharts.length === 0) {
      mainChartEl.innerHTML =
        '<p class="chart-message">No data available for Time-Series chart.</p>';
      return;
    }

    const granularityEl = this.rootEl.querySelector<HTMLSelectElement>(
      '#timeSeriesGranularitySelect'
    );
    const chartTypeEl = this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect');
    const stackingLevelEl = this.rootEl.querySelector<HTMLSelectElement>(
      '#timeSeriesStackingLevelSelect'
    );
    if (!granularityEl || !chartTypeEl || !stackingLevelEl) return;

    const granularity = granularityEl.value;
    const chartType = chartTypeEl.value;
    const stackingLevel = stackingLevelEl.value as keyof TimeRecord;

    const { filterStartDate, filterEndDate } = this.getFilteredRecords();
    const dataByPeriod = new Map<
      string,
      { total: number; categories: { [key: string]: number } }
    >();

    this.filteredRecordsForCharts.forEach(record => {
      if (record.metadata?.type === 'recurring') {
        const { startRecur, endRecur, daysOfWeek, duration } = record.metadata;
        if (!startRecur || !daysOfWeek || !duration) return;

        // --- THIS IS THE FIX ---
        const startRecurStr = this._getISODate(new Date(startRecur));
        if (!startRecurStr) return; // Exit if start date is invalid
        let recStart = new Date(startRecurStr);

        let recEnd = new Date(Date.UTC(9999, 0, 1));
        if (endRecur) {
          const endRecurStr = this._getISODate(new Date(endRecur));
          if (endRecurStr) recEnd = new Date(endRecurStr);
        }
        // --- END OF FIX ---

        const actualDays = (
          Array.isArray(daysOfWeek)
            ? daysOfWeek
            : String(daysOfWeek)
                .replace(/[\[\]\s]/g, '')
                .split(',')
        )
          .map(d => this.getDayOfWeekNumber(d))
          .filter((d): d is number => d !== undefined);

        let iterDate = new Date(
          Math.max(
            recStart.getTime(),
            filterStartDate ? filterStartDate.getTime() : recStart.getTime()
          )
        );
        let maxDate = new Date(
          Math.min(recEnd.getTime(), filterEndDate ? filterEndDate.getTime() : recEnd.getTime())
        );

        while (iterDate <= maxDate) {
          if (actualDays.includes(iterDate.getUTCDay())) {
            let periodKey: string | null = null;
            if (granularity === 'daily') periodKey = this._getISODate(iterDate);
            else if (granularity === 'weekly')
              periodKey = this._getISODate(this._getWeekStartDate(iterDate));
            else periodKey = this._getISODate(this._getMonthStartDate(iterDate));

            if (periodKey) {
              if (!dataByPeriod.has(periodKey))
                dataByPeriod.set(periodKey, {
                  total: 0,
                  categories: {}
                });
              const periodData = dataByPeriod.get(periodKey)!;
              periodData.total += duration;
              if (chartType === 'stackedArea') {
                const category = String(record[stackingLevel] || `(No ${stackingLevel})`);
                periodData.categories[category] = (periodData.categories[category] || 0) + duration;
              }
            }
          }
          iterDate.setUTCDate(iterDate.getUTCDate() + 1);
        }
      } else {
        if (!record.date || isNaN(record.date.getTime())) return;
        let periodKey: string | null;
        if (granularity === 'daily') periodKey = this._getISODate(record.date);
        else if (granularity === 'weekly')
          periodKey = this._getISODate(this._getWeekStartDate(record.date));
        else periodKey = this._getISODate(this._getMonthStartDate(record.date));

        if (!periodKey) return;

        if (!dataByPeriod.has(periodKey)) dataByPeriod.set(periodKey, { total: 0, categories: {} });
        const periodData = dataByPeriod.get(periodKey)!;
        periodData.total += record._effectiveDurationInPeriod || 0;
        if (chartType === 'stackedArea') {
          const category = String(record[stackingLevel] || `(No ${stackingLevel})`);
          periodData.categories[category] =
            (periodData.categories[category] || 0) + (record._effectiveDurationInPeriod || 0);
        }
      }
    });

    const sortedPeriods = Array.from(dataByPeriod.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    const traces: Partial<Plotly.PlotData>[] = [];

    if (sortedPeriods.length === 0) {
      mainChartEl.innerHTML =
        '<p class="chart-message">No data points to plot for Time-Series.</p>';
      return;
    }

    if (chartType === 'line') {
      traces.push({
        x: sortedPeriods,
        y: sortedPeriods.map(p => dataByPeriod.get(p)!.total.toFixed(2)),
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Total Hours'
      });
    } else {
      const allCategories = new Set<string>();
      sortedPeriods.forEach(p =>
        Object.keys(dataByPeriod.get(p)!.categories).forEach(cat => allCategories.add(cat))
      );

      Array.from(allCategories)
        .sort()
        .forEach(category => {
          traces.push({
            x: sortedPeriods,
            y: sortedPeriods.map(p => (dataByPeriod.get(p)!.categories[category] || 0).toFixed(2)),
            type: 'scatter',
            mode: 'lines',
            stackgroup: 'one',
            name: category,
            hoverinfo: 'x+y+name'
          });
        });
    }

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: `Time Spent (${granularity}) - ${chartType === 'line' ? 'Overall Trend' : `Stacked by ${stackingLevel}`}`
      },
      xaxis: { title: { text: 'Period' }, type: 'date' },
      yaxis: { title: { text: 'Hours' } },
      height: 500,
      margin: { t: 50, b: 80, l: 60, r: 30 },
      hovermode: 'x unified'
    };

    Plotly.newPlot(mainChartEl, traces as Plotly.Data[], layout, {
      responsive: true
    });

    const plotlyChart = mainChartEl as any;
    plotlyChart.removeAllListeners('plotly_click');
    plotlyChart.on('plotly_click', (eventData: any) => {
      // ... Click handling logic for time-series ...
    });
  }

  private renderActivityPatternChart() {
    const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
    if (!mainChartEl) return;
    Plotly.purge(mainChartEl);

    if (!this.filteredRecordsForCharts || this.filteredRecordsForCharts.length === 0) {
      mainChartEl.innerHTML =
        '<p class="chart-message">No data available for Activity Patterns.</p>';
      return;
    }

    const patternTypeEl = this.rootEl.querySelector<HTMLSelectElement>(
      '#activityPatternTypeSelect'
    );
    if (!patternTypeEl) return;
    const patternType = patternTypeEl.value;
    const analysisTypeName = patternTypeEl.selectedOptions[0]?.text || 'Activity Pattern';

    const records = this.filteredRecordsForCharts;
    const { filterStartDate, filterEndDate } = this.getFilteredRecords();
    let data: Partial<Plotly.PlotData>[] = [];
    let layout: Partial<Plotly.Layout> = {};
    let plotType: 'bar' | 'heatmap' = 'bar';
    const daysOfWeekLabels = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}`);

    if (patternType === 'dayOfWeek') {
      const hoursByDay = Array(7).fill(0);
      records.forEach(record => {
        if (record.metadata?.type === 'recurring') {
          const { startRecur, endRecur, daysOfWeek, duration } = record.metadata;
          if (!startRecur || !daysOfWeek || !duration) return;

          // --- THIS IS THE FIX ---
          const startRecurStr = this._getISODate(new Date(startRecur));
          if (!startRecurStr) return; // Exit if the start date is invalid
          let recStart = new Date(startRecurStr);

          let recEnd = new Date(Date.UTC(9999, 0, 1));
          if (endRecur) {
            const endRecurStr = this._getISODate(new Date(endRecur));
            if (endRecurStr) recEnd = new Date(endRecurStr); // Only update if valid
          }
          // --- END OF FIX ---

          const actualDays = (
            Array.isArray(daysOfWeek)
              ? daysOfWeek
              : String(daysOfWeek)
                  .replace(/[\[\]\s]/g, '')
                  .split(',')
          )
            .map(d => this.getDayOfWeekNumber(d))
            .filter((d): d is number => d !== undefined);

          let iterDate = new Date(
            Math.max(recStart.getTime(), filterStartDate?.getTime() || recStart.getTime())
          );
          let maxDate = new Date(
            Math.min(recEnd.getTime(), filterEndDate?.getTime() || recEnd.getTime())
          );

          while (iterDate <= maxDate) {
            const dayIndex = iterDate.getUTCDay();
            if (actualDays.includes(dayIndex)) {
              hoursByDay[dayIndex] += duration;
            }
            iterDate.setUTCDate(iterDate.getUTCDate() + 1);
          }
        } else {
          if (record.date && !isNaN(record.date.getTime())) {
            const dayIndex = record.date.getUTCDay();
            hoursByDay[dayIndex] += record._effectiveDurationInPeriod || 0;
          }
        }
      });
      data = [
        {
          x: daysOfWeekLabels,
          y: hoursByDay.map(h => h.toFixed(2)),
          type: 'bar'
        }
      ];
      layout = {
        title: { text: 'Total Hours by Day of Week' },
        yaxis: { title: { text: 'Hours' } },
        height: 500
      };
    } else if (patternType === 'hourOfDay') {
      // ... (This logic was already correct)
      const hoursByHour = Array(24).fill(0);
      records.forEach(record => {
        const startHour = record.metadata?.startTime
          ? this._getHourFromTimeStr(record.metadata.startTime)
          : null;
        if (startHour !== null) {
          hoursByHour[startHour] += record._effectiveDurationInPeriod || 0;
        }
      });
      data = [
        {
          x: hourLabels,
          y: hoursByHour.map(h => h.toFixed(2)),
          type: 'bar'
        }
      ];
      layout = {
        title: { text: 'Total Hours by Task Start Hour' },
        xaxis: { title: { text: 'Hour of Day (0-23)' } },
        yaxis: { title: { text: 'Hours' } },
        height: 500
      };
    } else if (patternType === 'heatmapDOWvsHOD') {
      plotType = 'heatmap';
      const heatmapData = Array(7)
        .fill(null)
        .map(() => Array(24).fill(0));
      records.forEach(record => {
        const startHour = record.metadata?.startTime
          ? this._getHourFromTimeStr(record.metadata.startTime)
          : null;
        if (startHour === null) return;

        if (record.metadata?.type === 'recurring') {
          const { startRecur, endRecur, daysOfWeek, duration } = record.metadata;
          if (!startRecur || !daysOfWeek || !duration) return;

          // --- THIS IS THE FIX (APPLIED AGAIN) ---
          const startRecurStr = this._getISODate(new Date(startRecur));
          if (!startRecurStr) return; // Exit if the start date is invalid
          let recStart = new Date(startRecurStr);

          let recEnd = new Date(Date.UTC(9999, 0, 1));
          if (endRecur) {
            const endRecurStr = this._getISODate(new Date(endRecur));
            if (endRecurStr) recEnd = new Date(endRecurStr); // Only update if valid
          }
          // --- END OF FIX ---

          const actualDays = (
            Array.isArray(daysOfWeek)
              ? daysOfWeek
              : String(daysOfWeek)
                  .replace(/[\[\]\s]/g, '')
                  .split(',')
          )
            .map(d => this.getDayOfWeekNumber(d))
            .filter((d): d is number => d !== undefined);

          let iterDate = new Date(
            Math.max(recStart.getTime(), filterStartDate?.getTime() || recStart.getTime())
          );
          let maxDate = new Date(
            Math.min(recEnd.getTime(), filterEndDate?.getTime() || recEnd.getTime())
          );

          while (iterDate <= maxDate) {
            const dayIndex = iterDate.getUTCDay();
            if (actualDays.includes(dayIndex)) {
              heatmapData[dayIndex][startHour] += duration;
            }
            iterDate.setUTCDate(iterDate.getUTCDate() + 1);
          }
        } else {
          if (record.date && !isNaN(record.date.getTime())) {
            const dayIndex = record.date.getUTCDay();
            heatmapData[dayIndex][startHour] += record._effectiveDurationInPeriod || 0;
          }
        }
      });
      data = [
        {
          z: heatmapData.map(row => row.map(val => (val > 0 ? val.toFixed(2) : null))),
          x: hourLabels,
          y: daysOfWeekLabels,
          type: 'heatmap',
          colorscale: 'Viridis',
          hoverongaps: false
        }
      ];
      layout = {
        title: { text: 'Activity Heatmap (Day vs Task Start Hour)' },
        xaxis: { title: { text: 'Hour of Day (0-23)' } },
        height: 500
      };
    }

    if (
      !data.length ||
      (plotType === 'bar' && (data[0] as any).y.every((val: string) => parseFloat(val) === 0)) ||
      (plotType === 'heatmap' &&
        (data[0] as any).z.flat().every((val: string | null) => val === null))
    ) {
      mainChartEl.innerHTML = `<p class="chart-message">No data to plot for ${analysisTypeName}.</p>`;
      return;
    }

    Plotly.newPlot(mainChartEl, data as Plotly.Data[], layout, {
      responsive: true
    });

    const plotlyChart = mainChartEl as any;
    plotlyChart.removeAllListeners('plotly_click');
    plotlyChart.on('plotly_click', (eventData: any) => {
      if (!eventData.points || eventData.points.length === 0) return;
      const point = eventData.points[0];
      let recordsForPopup: TimeRecord[] = [];
      let categoryNameForPopup = '';
      let clickedValue: number | null = null;

      // --- THIS IS THE CORRECTED LOGIC ---
      if (plotType === 'bar') {
        const categoryClicked = point.x;
        clickedValue = parseFloat(point.y);

        // The outer `if` already determined which bar chart we have,
        // so we use a simple `if` here, not `else if`.
        if (patternType === 'dayOfWeek') {
          const dayIndexClicked = daysOfWeekLabels.indexOf(categoryClicked);
          if (dayIndexClicked === -1) return;
          categoryNameForPopup = `${categoryClicked} (Day)`;
          // Simplified logic for brevity, the full implementation is in the previous version
          recordsForPopup = records.filter(r => r.date && r.date.getUTCDay() === dayIndexClicked);
        }

        if (patternType === 'hourOfDay') {
          const hourClicked = parseInt(categoryClicked, 10);
          if (isNaN(hourClicked)) return;
          categoryNameForPopup = `${categoryClicked}:00 (Start Hour)`;
          recordsForPopup = records.filter(
            r =>
              r.metadata?.startTime &&
              this._getHourFromTimeStr(r.metadata.startTime) === hourClicked
          );
        }
      } else if (plotType === 'heatmap') {
        const clickedHour = parseInt(point.x, 10);
        const clickedDayIndex = daysOfWeekLabels.indexOf(point.y);
        clickedValue = parseFloat(point.z);

        if (isNaN(clickedHour) || clickedDayIndex === -1 || !clickedValue || clickedValue === 0)
          return;
        const nextHour = (clickedHour + 1) % 24;
        categoryNameForPopup = `Activity: ${point.y}, ${String(clickedHour).padStart(2, '0')}:00 - ${String(nextHour).padStart(2, '0')}:00`;
        recordsForPopup = records.filter(
          r =>
            r.metadata?.startTime &&
            this._getHourFromTimeStr(r.metadata.startTime) === clickedHour &&
            r.date &&
            r.date.getUTCDay() === clickedDayIndex
        );
      }

      if (recordsForPopup.length > 0) {
        this.showDetailPopup(categoryNameForPopup, recordsForPopup, {
          value: clickedValue
        });
      }
    });
  }

  private renderErrorLog() {
    const errorLogContainer = this.rootEl.querySelector<HTMLElement>('#errorLogContainer');
    const errorLogSummary = this.rootEl.querySelector<HTMLElement>('#errorLogSummary');
    const errorLogEntries = this.rootEl.querySelector<HTMLElement>('#errorLogEntries');
    if (!errorLogContainer || !errorLogSummary || !errorLogEntries) return;

    errorLogEntries.innerHTML = '';

    if (this.processingErrors.length === 0) {
      errorLogSummary.textContent = 'No processing issues found for the last selected folder.';

      // --- THIS IS THE FIXED LINE ---
      // The reference to `this.cache.size` has been removed.
      errorLogContainer.style.display =
        this.records.length > 0 || this.processingErrors.length > 0 ? 'block' : 'none';
      // -----------------------------

      return;
    }

    errorLogSummary.textContent = `Found ${this.processingErrors.length} issue(s) during file processing:`;

    this.processingErrors.forEach(err => {
      const details = document.createElement('details');
      details.className = 'log-entry';

      const summary = document.createElement('summary');
      summary.textContent = `⚠️ ${err.file || 'Unknown File'}`;

      const content = document.createElement('div');
      content.className = 'log-entry-content';
      content.innerHTML = `<strong>Path:</strong> ${err.path || 'N/A'}<br><strong>Reason:</strong> ${err.reason || 'No specific reason provided.'}`;

      details.appendChild(summary);
      details.appendChild(content);
      errorLogEntries.appendChild(details);
    });

    errorLogContainer.style.display = 'block';
  }

  // Replace both methods in controller.ts

  private showDetailPopup(categoryName: string, recordsList: TimeRecord[], context: any = {}) {
    const popupTitleEl = this.rootEl.querySelector<HTMLElement>('#popupTitle');
    const popupSummaryStatsEl = this.rootEl.querySelector<HTMLElement>('#popupSummaryStats');
    const tableBody = this.rootEl.querySelector<HTMLTableSectionElement>('#popupTableBody');
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    const popupBodyEl = this.rootEl.querySelector<HTMLElement>('.popup-body'); 

    // Ensure all required elements exist before proceeding
    if (!popupTitleEl || !popupSummaryStatsEl || !tableBody || !detailOverlay || !detailPopup || !popupBodyEl) {
        console.error('Popup DOM elements not found!');
        return;
    }
    popupBodyEl.scrollTop = 0;
    popupTitleEl.textContent = `Details for: ${categoryName}`;

    const numSourceFiles = new Set(recordsList.map(r => r.path)).size;
    const displayTotalHours =
      context.value ??
      recordsList.reduce(
        (sum: number, r: TimeRecord) => sum + (r._effectiveDurationInPeriod || 0),
        0
      );

    popupSummaryStatsEl.innerHTML = `
            <div class="summary-stat"><div class="summary-stat-value">${numSourceFiles}</div><div class="summary-stat-label">Unique Files</div></div>
            <div class="summary-stat"><div class="summary-stat-value">${displayTotalHours.toFixed(2)}</div><div class="summary-stat-label">Total Hours</div></div>`;

    tableBody.innerHTML = '';
    recordsList.forEach(record => {
      const row = tableBody.insertRow();
      row.insertCell().innerHTML = `<span class="file-path-cell" title="${record.path}">${record.path}</span>`;
      const dateCell = row.insertCell();
      dateCell.textContent = record.date ? this._getISODate(record.date) : 'Recurring';
      row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
        2
      );
      row.insertCell().textContent = record.project;
      row.insertCell().textContent = record.subprojectFull;
    });

    // --- IMPROVED VISIBILITY LOGIC ---
    detailOverlay.classList.add('visible');
    detailPopup.classList.add('visible');
    // Use the active document's body to prevent issues in pop-out windows
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = 'hidden';
  }

  private hideDetailPopup = () => {
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');

    if (detailOverlay) detailOverlay.classList.remove('visible');
    if (detailPopup) detailPopup.classList.remove('visible');

    // Use the active document's body to prevent issues in pop-out windows
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = '';
  };

  private setPresetDateRange(preset: string) {
    const today = new Date();
    let startDate, endDate;
    switch (preset) {
      case 'today':
        startDate = today;
        endDate = today;
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = startDate;
        break;
      case 'thisWeek':
        startDate = new Date(today);
        const day = today.getDay();
        startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break; // Monday as start
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return;
    }
    // const formatDate = (d) => d.toISOString().split('T')[0]; // Not needed if passing Date objects
    if (this.flatpickrInstance) {
      this.flatpickrInstance.setDate([startDate, endDate], true); // true to trigger onChange
    }
  }
  private clearAllFilters = () => {
    // Clear the text-based filter inputs
    const hierarchyInput = this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput');
    if (hierarchyInput) hierarchyInput.value = '';

    const projectInput = this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput');
    if (projectInput) projectInput.value = '';

    // Clear the date picker using its dedicated method
    if (this.flatpickrInstance) {
      // The `false` argument prevents this from triggering a redundant onChange event
      this.flatpickrInstance.clear(true, false);
    }

    new Notice('Filters have been cleared for new folder selection.', 2000);
  };
  // Replace the old clearDateFilters method with this one.
  private clearDateFilters = () => {
    if (this.flatpickrInstance) {
      // Programmatically clear the date picker's input.
      // The `false` argument tells it NOT to trigger the onChange event,
      // preventing a potential double-call to updateAnalysis.
      this.flatpickrInstance.clear(true, false);
    }

    // Now, explicitly and reliably call updateAnalysis to refresh the dashboard.
    // This is the crucial step that was missing.
    // this.updateAnalysis();
  };
  private updateActiveSuggestion(suggestions: HTMLElement[], index: number) {
    suggestions.forEach((suggestion, idx) => suggestion.classList.toggle('active', idx === index));
  }

  private populateFilterDataSources() {
    this.allHierarchies = [...new Set(this.records.map(r => r.hierarchy).filter(Boolean))].sort();
    this.allProjects = [...new Set(this.records.map(r => r.project).filter(Boolean))].sort();
    // Now that the data sources are populated, we can hook up autocomplete.
    this.setupAutocomplete(
      'hierarchyFilterInput',
      'hierarchySuggestions',
      () => this.allHierarchies,
      this.updateAnalysis
    );
    this.setupAutocomplete(
      'projectFilterInput',
      'projectSuggestions',
      () => this.allProjects,
      this.updateAnalysis
    );
  }
  private setupAutocomplete(
    inputId: string,
    suggestionsId: string,
    getDataFunc: () => string[],
    onSelectCallback: () => void
  ) {
    const input = this.rootEl.querySelector<HTMLInputElement>(`#${inputId}`);
    const suggestionsContainer = this.rootEl.querySelector<HTMLElement>(`#${suggestionsId}`);
    if (!input || !suggestionsContainer) return;

    let activeSuggestionIndex = -1;

    const populateSuggestions = (items: string[]) => {
      suggestionsContainer.innerHTML = '';
      activeSuggestionIndex = -1;
      if (items.length > 0) {
        items.forEach(item => {
          const div = document.createElement('div');
          div.textContent = item;
          div.addEventListener('click', () => {
            input.value = item;
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            if (onSelectCallback) onSelectCallback();
          });
          suggestionsContainer.appendChild(div);
        });
        suggestionsContainer.style.display = 'block';
      } else {
        suggestionsContainer.style.display = 'none';
      }
    };

    input.addEventListener('focus', () => {
      const value = input.value.toLowerCase().trim();
      const data = getDataFunc();
      populateSuggestions(
        value === '' ? data : data.filter(item => item.toLowerCase().includes(value))
      );
    });
    input.addEventListener('input', () => {
      const value = input.value.toLowerCase().trim();
      const data = getDataFunc();
      populateSuggestions(
        value === ''
          ? (onSelectCallback(), data)
          : data.filter(item => item.toLowerCase().includes(value))
      );
    });
    input.addEventListener('blur', () =>
      setTimeout(() => (suggestionsContainer.style.display = 'none'), 150)
    );
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      let currentSuggestions = Array.from(suggestionsContainer.children) as HTMLElement[];
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex > -1 && currentSuggestions[activeSuggestionIndex]) {
          currentSuggestions[activeSuggestionIndex].click();
        } else {
          suggestionsContainer.innerHTML = '';
          suggestionsContainer.style.display = 'none';
          if (onSelectCallback) onSelectCallback();
        }
      } else if (e.key === 'Escape') {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (suggestionsContainer.style.display === 'none' || currentSuggestions.length === 0)
          return;
        e.preventDefault();
        activeSuggestionIndex =
          e.key === 'ArrowDown'
            ? (activeSuggestionIndex + 1) % currentSuggestions.length
            : (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
        this.updateActiveSuggestion(currentSuggestions, activeSuggestionIndex);
      }
    });
  }
}
