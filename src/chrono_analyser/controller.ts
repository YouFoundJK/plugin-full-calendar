/**
 * @file The main orchestrator for the Chrono Analyser.
 * The AnalysisController class manages the application's state, handles user interactions,
 * and coordinates the data flow between the parser, aggregator, and plotter modules.
 */

import { App, Notice, TFile, TFolder, debounce } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import Plotly from './plotly-custom';

// Import from our new modules
import * as Parser from './modules/parser';
import * as Aggregator from './modules/aggregator';
import * as Plotter from './modules/plotter';
import * as Utils from './modules/utils';
import * as UI from './modules/ui';
import { TimeRecord, ProcessingError, SunburstData, PieData } from './modules/types';

/**
 * Manages the entire lifecycle and state of the Chrono Analyser view.
 */
export class AnalysisController {
  private records: TimeRecord[] = [];
  private processingErrors: ProcessingError[] = [];
  private currentSunburstAggregatedData: SunburstData | null = null;
  private currentPieAggregatedData: PieData | null = null;
  private filteredRecordsForCharts: TimeRecord[] = [];
  private allHierarchies: string[] = [];
  private allProjects: string[] = [];
  private flatpickrInstance: FlatpickrInstance | null = null;
  private uiStateKey = 'ChronoAnalyzerUIState_v3';

  constructor(
    private app: App,
    private rootEl: HTMLElement
  ) {}

  /**
   * Initializes the controller, setting up event listeners, loading UI state,
   * and triggering the initial data load and analysis.
   * @async
   */
  public async initialize(): Promise<void> {
    this.setupEventListeners();
    this.loadUIState();
    this.handleAnalysisTypeChange();
    await this.loadInitialFolder();
  }

  public destroy(): void {
    this.flatpickrInstance?.destroy();
  }

  private showStatus(
    message: string,
    type: 'info' | 'error' | 'success' | 'warning' = 'info',
    duration: number = 4000
  ) {
    new Notice(message, duration);
  }

  private async loadInitialFolder(): Promise<void> {
    const defaultPath = 'Calender';
    const abstractFile = this.app.vault.getAbstractFileByPath(defaultPath);

    if (abstractFile instanceof TFolder) {
      this.showStatus(`Loading default folder: "${defaultPath}"`, 'info', 2000);
      await this.loadAndProcessFolder(abstractFile);
    } else {
      this.showStatus(
        `Default folder "${defaultPath}" not found. Please select a folder.`,
        'warning',
        5000
      );
      this.promptForFolder();
    }
  }

  private promptForFolder = () => {
    new UI.FolderSuggestModal(this.app, folder => {
      this.loadAndProcessFolder(folder);
    }).open();
  };

  private async loadAndProcessFolder(folder: TFolder): Promise<void> {
    this.clearAllFilters();
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
      this.showStatus('No .md files found in the selected folder.', 'info', 3000);
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

    const promises = files.map(file => Parser.parseFile(this.app, file));
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

    this.populateFilterDataSources();
    this.updateAnalysis();
  }

  private setupEventListeners = () => {
    this.rootEl
      .querySelector('#folderInputButton')
      ?.addEventListener('click', this.promptForFolder);
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
    this.rootEl
      .querySelector('#clearCacheBtn')
      ?.addEventListener('click', () => new Notice('Cache clearing will be implemented later.'));
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
      state.startDate = Utils.getISODate(this.flatpickrInstance.selectedDates[0]);
      state.endDate = Utils.getISODate(this.flatpickrInstance.selectedDates[1]);
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

  /**
   * The core analysis and rendering pipeline, triggered by any change in filters or data.
   * This function is debounced to prevent rapid-fire updates. It orchestrates filtering,
   * aggregating, and calling the appropriate plotting function from the plotter module.
   * It is the central hub for refreshing the view's content.
   */
  private updateAnalysis = () => {
    setTimeout(() => {
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

      Plotter.renderErrorLog(this.rootEl, this.processingErrors, this.records.length);
      const filteredDataResults = this.getFilteredRecords();
      this.filteredRecordsForCharts = filteredDataResults.records;

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
        if (legendEl) legendEl.style.display = '';
        const levelSelect = document.getElementById('levelSelect') as HTMLSelectElement | null;
        const patternInput = document.getElementById('patternInput') as HTMLInputElement | null;
        const sunburstLevel = levelSelect?.value ?? '';
        const pattern = patternInput?.value ?? '';
        let recordsForSunburst = filteredDataResults.records;
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
            if (legendEl) legendEl.innerHTML = '';
            return;
          }
        }
        this.currentSunburstAggregatedData = Aggregator.aggregateForSunburst(
          recordsForSunburst,
          sunburstLevel
        );
        if (
          this.currentSunburstAggregatedData &&
          this.currentSunburstAggregatedData.ids.length > 1
        ) {
          Plotter.renderSunburstChartDisplay(
            this.rootEl,
            this.currentSunburstAggregatedData,
            this.showDetailPopup
          );
        } else if (pattern?.trim() && recordsForSunburst.length === 0) {
          mainChartEl.innerHTML =
            '<p class="chart-message">No data matches the Category Filter.</p>';
          if (legendEl) legendEl.innerHTML = '';
        } else {
          mainChartEl.innerHTML =
            '<p class="chart-message">No data for Sunburst Chart with current filters.</p>';
          if (legendEl) legendEl.innerHTML = '';
        }
      } else {
        if (legendEl) legendEl.style.display = 'none';
        if (analysisType === 'time-series') {
          analysisName = 'Time-Series Trend';
          Plotter.renderTimeSeriesChart(
            this.rootEl,
            this.filteredRecordsForCharts,
            filteredDataResults
          );
        } else if (analysisType === 'activity') {
          analysisName = 'Activity Patterns';
          Plotter.renderActivityPatternChart(
            this.rootEl,
            this.filteredRecordsForCharts,
            filteredDataResults,
            this.showDetailPopup
          );
        } else if (analysisType === 'pie') {
          analysisName = 'Category Breakdown';
          const pieLevel = (this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')
            ?.value || 'hierarchy') as keyof TimeRecord;
          const piePattern =
            this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value || '';
          this.currentPieAggregatedData = Aggregator.aggregateForPieChart(
            this.filteredRecordsForCharts,
            pieLevel,
            piePattern,
            (msg, type) => this.showStatus(msg, type)
          );
          if (
            !this.currentPieAggregatedData.error &&
            this.currentPieAggregatedData.hours.size > 0
          ) {
            Plotter.renderPieChartDisplay(
              this.rootEl,
              this.currentPieAggregatedData,
              this.showDetailPopup
            );
          } else {
            mainChartEl.innerHTML =
              '<p class="chart-message">No data for Pie Chart with current filters.</p>';
          }
        }
      }

      if (analysisTypeStatEl) analysisTypeStatEl.textContent = analysisName;
      this.saveUIState();
    }, 50);
  };

  /**
   * Filters the master list of `records` based on the current UI filter settings
   * (date range, hierarchy, project). It also calculates the effective duration
   * for recurring events within the selected period.
   *
   * @returns An object containing the filtered records, total hours, file count, and the date range used.
   */
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
      startDateStr = Utils.getISODate(this.flatpickrInstance.selectedDates[0]) || '';
      endDateStr = Utils.getISODate(this.flatpickrInstance.selectedDates[1]) || '';
    }
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
          const numInstances = Utils.calculateRecurringInstancesInDateRange(
            record.metadata,
            filterStartDate,
            filterEndDate
          );
          effectiveDuration = (record.duration || 0) * numInstances;
          if (effectiveDuration > 0) includeRecord = true;
        }
      } else {
        if (this.isWithinDateRange(record.date, startDateStr, endDateStr)) {
          effectiveDuration = record.duration;
          includeRecord = true;
        }
      }
      if (includeRecord && effectiveDuration > 0) {
        filteredRecs.push({ ...record, _effectiveDurationInPeriod: effectiveDuration });
        totalHours += effectiveDuration;
        uniqueFiles.add(record.path);
      }
    }
    return {
      records: filteredRecs,
      totalHours,
      fileCount: uniqueFiles.size,
      filterStartDate,
      filterEndDate
    };
  }

  private isWithinDateRange(
    recordDateObj: Date | null,
    filterStartDateStr: string,
    filterEndDateStr: string
  ): boolean {
    if (!filterStartDateStr && !filterEndDateStr) return true;
    if (!recordDateObj || isNaN(recordDateObj.getTime())) return false;
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
      if (recordTime < filterStartTime) return false;
    }
    if (filterEndDateStr) {
      const [y, m, d] = filterEndDateStr.split('-').map(Number);
      const filterEndTime = new Date(Date.UTC(y, m - 1, d)).getTime();
      if (recordTime > filterEndTime) return false;
    }
    return true;
  }

  private showDetailPopup = (
    categoryName: string,
    recordsList: TimeRecord[],
    context: any = {}
  ) => {
    const popupTitleEl = this.rootEl.querySelector<HTMLElement>('#popupTitle');
    const popupSummaryStatsEl = this.rootEl.querySelector<HTMLElement>('#popupSummaryStats');
    const tableBody = this.rootEl.querySelector<HTMLTableSectionElement>('#popupTableBody');
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    const popupBodyEl = this.rootEl.querySelector<HTMLElement>('.popup-body');

    if (
      !popupTitleEl ||
      !popupSummaryStatsEl ||
      !tableBody ||
      !detailOverlay ||
      !detailPopup ||
      !popupBodyEl
    ) {
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
      dateCell.textContent = record.date ? Utils.getISODate(record.date) : 'Recurring';
      row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
        2
      );
      row.insertCell().textContent = record.project;
      row.insertCell().textContent = record.subprojectFull;
    });
    detailOverlay.classList.add('visible');
    detailPopup.classList.add('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = 'hidden';
  };

  private hideDetailPopup = () => {
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    if (detailOverlay) detailOverlay.classList.remove('visible');
    if (detailPopup) detailPopup.classList.remove('visible');
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
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return;
    }
    if (this.flatpickrInstance) {
      this.flatpickrInstance.setDate([startDate, endDate], true);
    }
  }

  private clearAllFilters = () => {
    const hierarchyInput = this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput');
    if (hierarchyInput) hierarchyInput.value = '';
    const projectInput = this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput');
    if (projectInput) projectInput.value = '';
    if (this.flatpickrInstance) {
      this.flatpickrInstance.clear(true, false);
    }
    new Notice('Filters have been cleared for new folder selection.', 2000);
  };

  private clearDateFilters = () => {
    if (this.flatpickrInstance) {
      this.flatpickrInstance.clear(true, true); // trigger change
    }
  };

  private populateFilterDataSources() {
    this.allHierarchies = [...new Set(this.records.map(r => r.hierarchy).filter(Boolean))].sort();
    this.allProjects = [...new Set(this.records.map(r => r.project).filter(Boolean))].sort();
    UI.setupAutocomplete(
      this.rootEl,
      'hierarchyFilterInput',
      'hierarchySuggestions',
      () => this.allHierarchies,
      this.updateAnalysis
    );
    UI.setupAutocomplete(
      this.rootEl,
      'projectFilterInput',
      'projectSuggestions',
      () => this.allProjects,
      this.updateAnalysis
    );
  }
}
