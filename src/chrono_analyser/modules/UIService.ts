/**
 * @file Manages all DOM interactions, UI state, and event handling for the Chrono Analyser view.
 * This service acts as the interface between the user and the application, abstracting all direct
 * DOM manipulation away from the controller.
 */

import { App, debounce, Notice } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import * as UI from './ui';
import { AnalysisFilters } from './DataManager';
import { TimeRecord } from './types';
import * as Utils from './utils';
import FullCalendarPlugin from '../../main';
import { InsightsConfig } from './ui';
import { Insight, InsightPayloadItem } from './InsightsEngine'; // Import InsightPayloadItem

/**
 * Manages all DOM interactions, UI state, and event handling for the Chrono Analyser view.
 */
export class UIService {
  private flatpickrInstance: FlatpickrInstance | null = null;
  private uiStateKey = 'ChronoAnalyzerUIState_v5';
  public insightsConfig: InsightsConfig | null = null;

  constructor(
    private app: App,
    private rootEl: HTMLElement,
    private plugin: FullCalendarPlugin,
    private onFilterChange: () => void,
    private onGenerateInsights: () => void,
    private onOpenConfig: () => void
  ) {}

  /**
   * Initializes all UI components and event listeners.
   */
  public async initialize(): Promise<void> {
    this.setupEventListeners();
    this.loadFilterState();
    await this.loadInsightsConfig();
  }

  private async loadInsightsConfig() {
    // Read directly from the plugin's settings object.
    this.insightsConfig = this.plugin.settings.chrono_analyser_config || null;
  }

  public setInsightsLoading(isLoading: boolean) {
    const generateBtn = this.rootEl.querySelector<HTMLButtonElement>('#generateInsightsBtn');
    const resultContainer = this.rootEl.querySelector<HTMLElement>('#insightsResultContainer');
    if (!generateBtn || !resultContainer) return;

    if (isLoading) {
      generateBtn.textContent = 'Processing...';
      generateBtn.disabled = true;
      generateBtn.classList.add('is-loading');
      resultContainer.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><div>Analyzing your data...</div></div>`;
    } else {
      generateBtn.textContent = 'Generate Insights';
      generateBtn.disabled = false;
      generateBtn.classList.remove('is-loading');
    }
  }

  public renderInsights(insights: Insight[]) {
    const resultContainer = this.rootEl.querySelector<HTMLElement>('#insightsResultContainer');
    if (!resultContainer) return;

    resultContainer.innerHTML = ''; // Clear loading spinner

    if (insights.length === 0) {
      resultContainer.innerHTML = `<div class="insights-placeholder">No specific insights found for the current period.</div>`;
      return;
    }

    // --- NEW: Grouping and Dashboard Rendering Logic ---
    const iconMap: { [key: string]: string } = {
      neutral: 'info',
      positive: 'trending-up',
      warning: 'alert-triangle'
    };

    // 1. Group insights by their category
    const groupedInsights = insights.reduce(
      (groups, insight) => {
        const key = insight.category;
        if (!groups[key]) groups[key] = [];
        groups[key].push(insight);
        return groups;
      },
      {} as { [key: string]: Insight[] }
    );

    for (const category in groupedInsights) {
      const groupContainer = resultContainer.createDiv({ cls: 'insight-group' });
      groupContainer.createEl('h3', { cls: 'insight-group-title', text: category });

      groupedInsights[category].forEach(insight => {
        const card = groupContainer.createDiv({
          cls: `insight-card sentiment-${insight.sentiment}`
        });
        const iconEl = card.createDiv({ cls: 'insight-icon' });
        const iconName = iconMap[insight.sentiment] || 'info';
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${iconName}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`; // Simplified icon logic

        const textEl = card.createDiv({ cls: 'insight-text' });
        textEl.innerHTML = insight.displayText;

        if (insight.action) {
          card.addClass('is-clickable');
          card.addEventListener('click', () => this.applyFiltersAndRefresh(insight.action));
        }

        if (insight.payload && insight.payload.length > 0) {
          const subItemsContainer = groupContainer.createDiv({
            cls: 'insight-sub-items-container'
          });
          insight.payload.forEach((item: InsightPayloadItem) => {
            const subItemCard = subItemsContainer.createDiv({
              cls: 'insight-card is-sub-item is-clickable'
            });

            // --- MODIFICATION: Create two spans for alignment ---
            subItemCard.createEl('span', {
              cls: 'insight-sub-item-project',
              text: item.project
            });
            subItemCard.createEl('span', {
              cls: 'insight-sub-item-details',
              text: `(logged ${item.count} times in the month prior)`
            });
            // --- END MODIFICATION ---

            subItemCard.addEventListener('click', () => {
              this.applyFiltersAndRefresh(item.action);
            });
          });
        }
      });
    }
  }

  private _formatText(text: string): string {
    return text.replace(/\*\*'(.+?)'\*\*/g, '<strong>$1</strong>');
  }

  /**
   * Cleans up UI components to prevent memory leaks.
   */
  public destroy(): void {
    this.flatpickrInstance?.destroy();
  }

  public getFilterState(): { filters: AnalysisFilters; newChartType: string | null } {
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
    const newChartType =
      this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value ?? null;

    return { filters, newChartType };
  }

  public getChartSpecificFilter(type: string | null): Record<string, any> {
    switch (type) {
      case 'pie':
        return {
          breakdownBy: (this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')?.value ||
            'hierarchy') as keyof TimeRecord,
          pattern: this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? ''
        };
      case 'sunburst':
        return {
          level: this.rootEl.querySelector<HTMLSelectElement>('#levelSelect')?.value ?? '',
          pattern: this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? ''
        };
      case 'time-series':
        return {
          granularity:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesGranularitySelect')?.value ??
            'daily',
          type:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value ?? 'line'
        };
      case 'activity':
        return {
          patternType:
            this.rootEl.querySelector<HTMLSelectElement>('#activityPatternTypeSelect')?.value ??
            'dayOfWeek'
        };
      default:
        return {};
    }
  }

  /**
   * Updates the statistical display cards.
   * @param totalHours - The total hours to display. Can be a number or placeholder string.
   * @param fileCount - The number of files to display. Can be a number or placeholder string.
   */
  public renderStats(totalHours: number | string, fileCount: number | string): void {
    (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent =
      typeof totalHours === 'number' ? totalHours.toFixed(2) : totalHours;
    (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = String(fileCount);
  }

  /**
   * Updates the "Active Analysis" stat card.
   * @param name - The name of the currently active analysis.
   */
  public updateActiveAnalysisStat(name: string): void {
    const el = this.rootEl.querySelector('#currentAnalysisTypeStat') as HTMLElement;
    if (el) el.textContent = name;
  }

  public showMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.style.display = '';
    this.rootEl.querySelector<HTMLElement>('#mainChartContainer')!.style.display = '';
  }

  public hideMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.style.display = 'none';
    this.rootEl.querySelector<HTMLElement>('#mainChartContainer')!.style.display = 'none';
  }

  /**
   * Sets up all event listeners for the view's interactive elements.
   */
  private setupEventListeners = () => {
    this.rootEl
      .querySelector('#configureInsightsBtn')
      ?.addEventListener('click', () => this.onOpenConfig());

    this.rootEl
      .querySelector('#generateInsightsBtn')
      ?.addEventListener('click', () => this.onGenerateInsights());

    const datePickerEl = this.rootEl.querySelector<HTMLInputElement>('#dateRangePicker');
    if (datePickerEl) {
      this.flatpickrInstance = flatpickr(datePickerEl, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        onChange: this.onFilterChange
      });
    }

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
      ?.addEventListener('change', () => this.handleAnalysisTypeChange());
    this.rootEl.querySelector('#levelSelect_pie')?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#levelSelect')?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#patternInput')
      ?.addEventListener('input', debounce(this.onFilterChange, 300));
    this.rootEl
      .querySelector('#timeSeriesGranularitySelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#timeSeriesTypeSelect')?.addEventListener('change', () => {
      this.handleTimeSeriesTypeVis();
      this.onFilterChange();
    });
    this.rootEl
      .querySelector('#timeSeriesStackingLevelSelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#activityPatternTypeSelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#popupCloseBtn')?.addEventListener('click', this.hideDetailPopup);
    this.rootEl.querySelector('#detailOverlay')?.addEventListener('click', this.hideDetailPopup);
  };

  public showDetailPopup = (categoryName: string, recordsList: TimeRecord[], context: any = {}) => {
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
      row.insertCell().textContent = record.project;
      row.insertCell().textContent = record.subprojectFull;
      row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
        2
      );
      const dateCell = row.insertCell();
      dateCell.textContent = record.date ? Utils.getISODate(record.date) : 'Recurring';
      row.insertCell().innerHTML = `<span class="file-path-cell" title="${record.path}">${record.path}</span>`;
    });

    detailOverlay.classList.add('visible');
    detailPopup.classList.add('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = 'hidden';
  };

  public hideDetailPopup = () => {
    const detailOverlay = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const detailPopup = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    if (detailOverlay) detailOverlay.classList.remove('visible');
    if (detailPopup) detailPopup.classList.remove('visible');
    this.app.workspace.containerEl.ownerDocument.body.style.overflow = '';
  };

  public saveState = (lastFolderPath: string | null) => {
    const getElValue = (id: string) =>
      this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
    const state: any = {
      // lastFolderPath is no longer needed
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

  private loadFilterState = () => {
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
        }
        setVal('levelSelect_pie', state.levelSelect_pie);
        setVal('levelSelect', state.levelSelect);
        setVal('patternInput', state.patternInput);
        setVal('timeSeriesGranularitySelect', state.timeSeriesGranularity);
        setVal('timeSeriesTypeSelect', state.timeSeriesType);
        setVal('timeSeriesStackingLevelSelect', state.timeSeriesStackingLevel);
        setVal('activityPatternTypeSelect', state.activityPatternType);
        this.handleAnalysisTypeChange(false);
      } catch (error) {
        console.error('[ChronoAnalyzer] Error loading UI state:', error);
        localStorage.removeItem(this.uiStateKey);
      }
    }
  };

  private handleAnalysisTypeChange = (triggerAnalysis = true) => {
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
    if (triggerAnalysis) {
      this.onFilterChange();
    }
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

  private applyFiltersAndRefresh(action: Insight['action']) {
    if (!action) return;

    const { chartType, filters } = action;

    // 1. Set the chart type
    const analysisTypeSelect = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect');
    if (analysisTypeSelect) {
      analysisTypeSelect.value = chartType;
    }

    // 2. Clear existing filters for a clean slate
    this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput')!.value = '';
    this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput')!.value = '';

    // 3. Apply new filters from the action
    if (filters.project) {
      this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput')!.value = filters.project;
    }
    if (filters.filterStartDate && filters.filterEndDate && this.flatpickrInstance) {
      this.flatpickrInstance.setDate([filters.filterStartDate, filters.filterEndDate], false);
    }

    // 4. Trigger the main analysis loop in the controller
    this.onFilterChange();

    // Smooth scroll down to the chart for a better user experience
    this.rootEl.querySelector('.controls')?.scrollIntoView({ behavior: 'smooth' });
  }

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

  public clearAllFilters = () => {
    this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput')!.value = '';
    this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput')!.value = '';
    if (this.flatpickrInstance) this.flatpickrInstance.clear(false, false);
  };

  private clearDateFilters = () => {
    if (this.flatpickrInstance) this.flatpickrInstance.clear(true, true);
  };

  public populateFilterDataSources(getHierarchies: () => string[], getProjects: () => string[]) {
    const hierarchyWrapper = this.rootEl
      .querySelector<HTMLInputElement>('#hierarchyFilterInput')
      ?.closest('.autocomplete-wrapper');
    if (hierarchyWrapper instanceof HTMLElement) {
      UI.setupAutocomplete(
        hierarchyWrapper,
        value => {
          // Set the input value manually on selection before triggering change
          const input = hierarchyWrapper.querySelector('input');
          if (input) input.value = value;
          this.onFilterChange();
        },
        getHierarchies
      );
    }

    const projectWrapper = this.rootEl
      .querySelector<HTMLInputElement>('#projectFilterInput')
      ?.closest('.autocomplete-wrapper');
    if (projectWrapper instanceof HTMLElement) {
      UI.setupAutocomplete(
        projectWrapper,
        value => {
          const input = projectWrapper.querySelector('input');
          if (input) input.value = value;
          this.onFilterChange();
        },
        getProjects
      );
    }
  }
}
