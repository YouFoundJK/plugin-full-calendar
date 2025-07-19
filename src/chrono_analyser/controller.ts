/**
 * @file The main orchestrator for the Chrono Analyser.
 * The AnalysisController class manages the application's state, handles user interactions,
 * and coordinates the data flow between the parser, aggregator, and plotter modules.
 */

import { App, Notice, TFile, TFolder, debounce } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import Plotly from './plotly-custom';
import FullCalendarPlugin from 'src/main'; // Adjust path if necessary

// Import from our modules
import * as Parser from './modules/parser';
import * as Aggregator from './modules/aggregator';
import * as Plotter from './modules/plotter';
import * as Utils from './modules/utils';
import * as UI from './modules/ui';
import { DataManager, AnalysisFilters } from './modules/DataManager';
import {
  TimeRecord,
  ProcessingError,
  SunburstData,
  PieData,
  ChronoCache,
  ChronoAnalyserData
} from './modules/types';

const CACHE_NAMESPACE = 'chronoAnalyserCache';

/**
 * Manages the entire lifecycle and state of the Chrono Analyser view.
 */
export class AnalysisController {
  private dataManager: DataManager;
  private processingErrors: ProcessingError[] = [];
  private cache: ChronoCache = {};
  private lastFolderPath: string | null = null;

  private currentSunburstAggregatedData: SunburstData | null = null;
  private currentPieAggregatedData: PieData | null = null;
  private filteredRecordsForCharts: TimeRecord[] = [];
  private flatpickrInstance: FlatpickrInstance | null = null;
  private uiStateKey = 'ChronoAnalyzerUIState_v3';

  constructor(
    private app: App,
    private rootEl: HTMLElement,
    private plugin: FullCalendarPlugin
  ) {
    this.dataManager = new DataManager();
  }

  /**
   * Initializes the controller, loading the cache and UI state,
   * setting up event listeners, and triggering the initial data load.
   * @async
   */
  public async initialize(): Promise<void> {
    await this.loadCacheAndSettings();
    this.setupEventListeners();
    this.registerVaultEvents();
    this.loadUIState();
    this.handleAnalysisTypeChange();
    await this.loadInitialFolder();
  }

  public destroy(): void {
    this.flatpickrInstance?.destroy();
  }

  // --- CACHE & DATA LOADING ---

  private async loadCacheAndSettings(): Promise<void> {
    const allData = (await this.plugin.loadData()) || {};
    const analyserData: Partial<ChronoAnalyserData> = allData[CACHE_NAMESPACE] || {};

    // Use default values to safely extract properties.
    this.cache = analyserData.cache ?? {};
    // This line ensures that if `lastFolderPath` is undefined or null, `this.lastFolderPath` becomes null.
    // This perfectly matches the type `string | null`.
    this.lastFolderPath = analyserData.lastFolderPath ?? null;
  }

  private async saveCacheAndSettings(): Promise<void> {
    const allData = (await this.plugin.loadData()) || {};
    const analyserData: ChronoAnalyserData = {
      cache: this.cache,
      lastFolderPath: this.lastFolderPath ?? undefined
    };
    allData[CACHE_NAMESPACE] = analyserData;
    await this.plugin.saveData(allData);
  }

  private async loadAndProcessFolder(folder: TFolder): Promise<void> {
    this.clearAllFilters();
    const notice = new Notice(`Scanning folder: "${folder.path}"...`, 0);

    try {
      const allMarkdownFiles = this.app.vault.getMarkdownFiles();
      const folderPathWithSlash = folder.isRoot()
        ? ''
        : folder.path.endsWith('/')
          ? folder.path
          : `${folder.path}/`;
      const filesToProcess = folder.isRoot()
        ? allMarkdownFiles
        : allMarkdownFiles.filter(file => file.path.startsWith(folderPathWithSlash));

      if (filesToProcess.length === 0) {
        notice.setMessage('No .md files found in the selected folder.');
        this.dataManager.clear();
        this.processingErrors = [];
        this.updateAnalysis();
        return;
      }

      // Pass the folder's path as the base for parsing
      await this.processFiles(filesToProcess, folder.path, notice);

      this.lastFolderPath = folder.path;
      await this.saveCacheAndSettings();

      const seenPaths = new Set(filesToProcess.map(f => f.path));
      let cacheWasModified = false;
      for (const path in this.cache) {
        if (path.startsWith(folderPathWithSlash) && !seenPaths.has(path)) {
          delete this.cache[path];
          this.dataManager.removeRecord(path);
          cacheWasModified = true;
        }
      }
      if (cacheWasModified) {
        await this.saveCacheAndSettings();
      }
    } catch (error) {
      console.error('Chrono Analyser: Failed to process folder.', error);
      notice.setMessage('An error occurred during processing. Check console for details.');
    } finally {
      setTimeout(() => notice.hide(), 4000);
    }
  }

  private async processFiles(
    files: TFile[],
    baseFolderPath: string,
    notice: Notice
  ): Promise<void> {
    this.dataManager.clear();
    this.processingErrors = [];
    let filesParsed = 0;
    let filesFromCache = 0;

    for (const file of files) {
      const cachedEntry = this.cache[file.path];
      if (cachedEntry && cachedEntry.mtime === file.stat.mtime) {
        const recordFromCache = cachedEntry.record;
        if (recordFromCache.date && typeof recordFromCache.date === 'string')
          recordFromCache.date = new Date(recordFromCache.date);
        if (
          recordFromCache.metadata.startRecur &&
          typeof recordFromCache.metadata.startRecur === 'string'
        )
          recordFromCache.metadata.startRecur = new Date(recordFromCache.metadata.startRecur);
        if (
          recordFromCache.metadata.endRecur &&
          typeof recordFromCache.metadata.endRecur === 'string'
        )
          recordFromCache.metadata.endRecur = new Date(recordFromCache.metadata.endRecur);
        this.dataManager.addRecord(recordFromCache);
        filesFromCache++;
      } else {
        try {
          // Pass the baseFolderPath to the parser
          const record = await Parser.parseFile(this.app, file, baseFolderPath);
          this.dataManager.addRecord(record);
          this.cache[file.path] = { mtime: file.stat.mtime, record };
          filesParsed++;
        } catch (error: any) {
          this.processingErrors.push({
            file: error.fileName,
            path: error.filePath,
            reason: error.message
          });
        }
      }
    }

    this.dataManager.finalize();
    notice.setMessage(`Analysis complete. Parsed: ${filesParsed}, From cache: ${filesFromCache}.`);

    if (filesParsed > 0) await this.saveCacheAndSettings();

    this.populateFilterDataSources();
    this.updateAnalysis();
  }

  private registerVaultEvents(): void {
    this.plugin.registerEvent(
      this.app.vault.on('modify', async file => {
        // Only process if we have a folder context and the file is inside it.
        if (
          this.lastFolderPath &&
          file instanceof TFile &&
          file.path.startsWith(this.lastFolderPath)
        ) {
          try {
            const record = await Parser.parseFile(this.app, file, this.lastFolderPath);
            this.dataManager.addRecord(record);
            this.dataManager.finalize();
            this.cache[file.path] = { mtime: file.stat.mtime, record };
            await this.saveCacheAndSettings();
            this.populateFilterDataSources();
            this.updateAnalysis();
          } catch (e) {}
        }
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on('delete', file => {
        if (this.lastFolderPath && file.path in this.cache) {
          delete this.cache[file.path];
          this.dataManager.removeRecord(file.path);
          this.dataManager.finalize();
          this.saveCacheAndSettings();
          this.populateFilterDataSources();
          this.updateAnalysis();
        }
      })
    );
    this.plugin.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        // Handle both the old path being tracked, and the new path being in the current folder.
        if (
          this.lastFolderPath &&
          file instanceof TFile &&
          file.path.startsWith(this.lastFolderPath) &&
          oldPath in this.cache
        ) {
          try {
            const newRecord = await Parser.parseFile(this.app, file, this.lastFolderPath);
            this.dataManager.removeRecord(oldPath);
            this.dataManager.addRecord(newRecord);
            this.dataManager.finalize();
            this.cache[file.path] = { mtime: file.stat.mtime, record: newRecord };
            delete this.cache[oldPath];
            await this.saveCacheAndSettings();
            this.populateFilterDataSources();
            this.updateAnalysis();
          } catch (e) {}
        }
      })
    );
  }

  /**
   * The core analysis pipeline, now dramatically simplified.
   */
  private updateAnalysis = () => {
    setTimeout(() => {
      // 1. Get all filter values from the UI
      const hierarchyFilter =
        this.rootEl
          .querySelector<HTMLInputElement>('#hierarchyFilterInput')
          ?.value.trim()
          .toLowerCase() || undefined;
      const projectFilter =
        this.rootEl
          .querySelector<HTMLInputElement>('#projectFilterInput')
          ?.value.trim()
          .toLowerCase() || undefined;
      const dates = this.flatpickrInstance?.selectedDates;
      const filterStartDate = dates && dates.length === 2 ? dates[0] : null;
      const filterEndDate = dates && dates.length === 2 ? dates[1] : null;
      const filters: AnalysisFilters = {
        hierarchy: hierarchyFilter,
        project: projectFilter,
        filterStartDate,
        filterEndDate
      };

      // 2. Determine aggregation level from UI
      const analysisType =
        this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value;
      let breakdownBy: keyof TimeRecord | null = null;
      if (analysisType === 'pie') {
        breakdownBy = (this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')?.value ||
          'hierarchy') as keyof TimeRecord;
      }
      // Note: Sunburst, Time-Series etc. have more complex aggregation needs not covered by this simple breakdown.
      // We will handle them separately for now.

      // 3. Make ONE call to the DataManager
      const { records, totalHours, fileCount, aggregation, recordsByCategory } =
        this.dataManager.getAnalyzedData(filters, breakdownBy);
      this.filteredRecordsForCharts = records;

      // 4. Render the UI with the results
      this.renderUI(totalHours, fileCount, { hours: aggregation, recordsByCategory, error: false });
      this.saveUIState();
    }, 50);
  };

  private renderUI(totalHours: number, fileCount: number, pieData: PieData) {
    // --- Initial Setup and Element Caching ---
    const mainChartEl = this.rootEl.querySelector<HTMLElement>('#mainChart');
    if (!mainChartEl) return;
    Plotly.purge(mainChartEl);

    const statsGrid = this.rootEl.querySelector<HTMLElement>('#statsGrid');
    const mainChartContainer = this.rootEl.querySelector<HTMLElement>('#mainChartContainer');
    const legendEl = this.rootEl.querySelector<HTMLElement>('#customLegend');
    const analysisTypeStatEl = this.rootEl.querySelector('#currentAnalysisTypeStat') as HTMLElement;
    const analysisType = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value;

    // Always render the error log
    Plotter.renderErrorLog(
      this.rootEl,
      this.processingErrors,
      this.dataManager.getTotalRecordCount()
    );

    // If there are no records loaded at all (e.g., empty folder), hide everything and return.
    if (this.dataManager.getTotalRecordCount() === 0) {
      if (statsGrid) statsGrid.style.display = 'none';
      if (mainChartContainer) mainChartContainer.style.display = 'none';
      mainChartEl.innerHTML =
        '<p class="chart-message">No time-tracking files found in the selected folder.</p>';
      return;
    }

    // From this point on, we assume there is data, so we keep the layout stable.
    if (statsGrid) statsGrid.style.display = '';
    if (mainChartContainer) mainChartContainer.style.display = '';

    // --- FIX: Handle the "No Data for Filter" case gracefully ---
    if (this.filteredRecordsForCharts.length === 0) {
      // Set stats to placeholder values
      (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent = '-';
      (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = '-';
      if (analysisTypeStatEl) analysisTypeStatEl.textContent = 'N/A';

      // Display a clear message in the chart area
      mainChartEl.innerHTML = '<p class="chart-message">No data matches the current filters.</p>';

      // Hide the sunburst legend if it was visible
      if (legendEl) legendEl.style.display = 'none';

      return; // Stop further rendering
    }

    // --- Render Stats and Chart for the "Data Found" Case ---
    (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent = totalHours.toFixed(2);
    (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = String(fileCount);

    let analysisName = 'Unknown';
    const dates = this.flatpickrInstance?.selectedDates;
    const filterStartDate = dates && dates.length === 2 ? dates[0] : null;
    const filterEndDate = dates && dates.length === 2 ? dates[1] : null;

    if (analysisType === 'sunburst') {
      analysisName = 'Category Breakdown';
      if (legendEl) legendEl.style.display = '';
      const level = this.rootEl.querySelector<HTMLSelectElement>('#levelSelect')?.value ?? '';
      const pattern = this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? '';
      let recordsForSunburst = this.filteredRecordsForCharts;
      if (pattern.trim()) {
        try {
          const regex = new RegExp(pattern.trim(), 'i');
          const outerField = level === 'project' ? 'project' : 'subproject';
          recordsForSunburst = this.filteredRecordsForCharts.filter(record =>
            regex.test(record[outerField] || '')
          );
        } catch (e) {
          /* handle error */
        }
      }
      const sunburstData = Aggregator.aggregateForSunburst(recordsForSunburst, level);

      if (sunburstData && sunburstData.ids.length > 1) {
        Plotter.renderSunburstChartDisplay(this.rootEl, sunburstData, this.showDetailPopup);
      } else {
        mainChartEl.innerHTML = '<p class="chart-message">No data for Sunburst Chart.</p>';
      }
    } else {
      if (legendEl) legendEl.style.display = 'none';
      if (analysisType === 'time-series') {
        analysisName = 'Time-Series Trend';
        Plotter.renderTimeSeriesChart(this.rootEl, this.filteredRecordsForCharts, {
          filterStartDate,
          filterEndDate
        });
      } else if (analysisType === 'activity') {
        analysisName = 'Activity Patterns';
        Plotter.renderActivityPatternChart(
          this.rootEl,
          this.filteredRecordsForCharts,
          { filterStartDate, filterEndDate },
          this.showDetailPopup
        );
      } else if (analysisType === 'pie') {
        analysisName = 'Category Breakdown';
        if (!pieData.error && pieData.hours.size > 0) {
          Plotter.renderPieChartDisplay(this.rootEl, pieData, this.showDetailPopup);
        } else {
          mainChartEl.innerHTML = '<p class="chart-message">No data for Pie Chart.</p>';
        }
      }
    }
    if (analysisTypeStatEl) analysisTypeStatEl.textContent = analysisName;
  }
  // --- UI & Event Handlers ---
  private showStatus(
    message: string,
    type: 'info' | 'error' | 'success' | 'warning' = 'info',
    duration: number = 4000
  ) {
    new Notice(message, duration);
  }
  private promptForFolder = () => {
    new UI.FolderSuggestModal(this.app, folder => {
      this.loadAndProcessFolder(folder);
    }).open();
  };

  private async loadInitialFolder(): Promise<void> {
    const defaultPath = 'Calender';
    let folderToLoad: TFolder | null = null;
    let noticeMessage = '';

    if (this.lastFolderPath) {
      const abstractFile = this.app.vault.getAbstractFileByPath(this.lastFolderPath);
      if (abstractFile instanceof TFolder) {
        folderToLoad = abstractFile;
        noticeMessage = `Loading last used folder: "${this.lastFolderPath}"`;
      }
    }

    if (!folderToLoad) {
      const abstractFile = this.app.vault.getAbstractFileByPath(defaultPath);
      if (abstractFile instanceof TFolder) {
        folderToLoad = abstractFile;
        noticeMessage = `Loading default folder: "${defaultPath}"`;
      }
    }

    if (folderToLoad) {
      this.showStatus(noticeMessage, 'info', 2000);
      await this.loadAndProcessFolder(folderToLoad);
    } else {
      this.showStatus(`Please select a folder to analyze.`, 'info', 5000);
      this.promptForFolder();
    }
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
    this.rootEl.querySelector('#clearCacheBtn')?.addEventListener('click', this.handleClearCache);
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

  private handleClearCache = async () => {
    new Notice('Clearing Chrono Analyser cache...', 2000);
    this.cache = {};
    this.lastFolderPath = null;
    await this.saveCacheAndSettings();
    this.dataManager.clear();
    this.updateAnalysis();
    new Notice('Cache cleared. Please select a folder.', 3000);
    this.promptForFolder();
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
      stackingLevelContainer.classList.toggle('hidden-controls', timeSeriesType !== 'stackedArea');
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
          if (el && val !== undefined) el.value = val;
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
    )
      return;
    popupBodyEl.scrollTop = 0;
    popupTitleEl.textContent = `Details for: ${categoryName}`;
    const numSourceFiles = new Set(recordsList.map(r => r.path)).size;
    const displayTotalHours =
      context.value ??
      recordsList.reduce(
        (sum: number, r: TimeRecord) => sum + (r._effectiveDurationInPeriod || 0),
        0
      );
    popupSummaryStatsEl.innerHTML = `<div class="summary-stat"><div class="summary-stat-value">${numSourceFiles}</div><div class="summary-stat-label">Unique Files</div></div><div class="summary-stat"><div class="summary-stat-value">${displayTotalHours.toFixed(2)}</div><div class="summary-stat-label">Total Hours</div></div>`;
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
    if (this.flatpickrInstance) this.flatpickrInstance.setDate([startDate, endDate], true);
  }
  private clearAllFilters = () => {
    const hierarchyInput = this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput');
    if (hierarchyInput) hierarchyInput.value = '';
    const projectInput = this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput');
    if (projectInput) projectInput.value = '';
    if (this.flatpickrInstance) this.flatpickrInstance.clear(true, false);
    new Notice('Filters have been cleared for new folder selection.', 2000);
  };

  private clearDateFilters = () => {
    if (this.flatpickrInstance) this.flatpickrInstance.clear(true, true);
  };

  private populateFilterDataSources() {
    UI.setupAutocomplete(
      this.rootEl,
      'hierarchyFilterInput',
      'hierarchySuggestions',
      () => this.dataManager.getKnownHierarchies(),
      this.updateAnalysis
    );
    UI.setupAutocomplete(
      this.rootEl,
      'projectFilterInput',
      'projectSuggestions',
      () => this.dataManager.getKnownProjects(),
      this.updateAnalysis
    );
  }
}
