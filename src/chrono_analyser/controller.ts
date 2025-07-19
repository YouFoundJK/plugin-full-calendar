// src/chrono_analyser/controller.ts

/**
 * @file The main orchestrator for the Chrono Analyser.
 * This class connects the DataService and UIService, managing the flow of data
 * and triggering UI updates in response to data changes or user actions. It uses a
 * strategy pattern to handle different chart types in a modular and extensible way.
 */

import { App, TFolder, Notice } from 'obsidian';
import FullCalendarPlugin from 'src/main';
import * as Plotter from './modules/plotter';
import * as Aggregator from './modules/aggregator';
import { DataManager } from './modules/DataManager';
import { UIService } from './modules/UIService';
import { DataService } from './modules/DataService';
import { PieData, TimeRecord } from './modules/types';

/**
 * Defines the contract for a chart rendering strategy. Each chart type
 * will have an implementation of this interface.
 */
interface IChartStrategy {
  analysisName: string;
  // The render method's signature now includes the `filteredRecords` parameter,
  // making it match the implementation in the strategies.
  render(
    controller: AnalysisController, // Provide context
    useReact: boolean,
    filteredRecords: TimeRecord[] // The pre-filtered data
  ): void;
}

export class AnalysisController {
  // Public services for strategies to access
  public uiService: UIService;
  public dataService: DataService;
  public dataManager: DataManager;
  public rootEl: HTMLElement;

  // Internal state
  private activeChartType: string | null = null;
  private isChartRendered = false;

  // --- NEW: State to track breakdown levels for redraw logic ---
  private activePieBreakdown: string | null = null;
  private activeSunburstLevel: string | null = null;
  private activeTimeSeriesGranularity: string | null = null;
  private activeTimeSeriesType: string | null = null;
  private activeActivityPattern: string | null = null;

  constructor(
    private app: App,
    rootEl: HTMLElement,
    private plugin: FullCalendarPlugin
  ) {
    this.rootEl = rootEl;
    this.dataManager = new DataManager();
    this.uiService = new UIService(
      app,
      rootEl,
      () => this.updateAnalysis(),
      f => this.handleFolderSelect(f),
      () => this.handleClearCache()
    );
    this.dataService = new DataService(app, plugin, this.dataManager, () => this.handleDataReady());
  }

  /**
   * Initializes the services and starts the initial data load.
   */
  public async initialize(): Promise<void> {
    this.uiService.initialize();
    await this.dataService.initialize();
    await this.dataService.loadInitialFolder();
  }

  public destroy(): void {
    this.uiService.destroy();
  }

  /**
   * Callback executed by the DataService when a new set of data is ready.
   * This populates the UI filters and triggers the first analysis render.
   */
  private handleDataReady(): void {
    this.activeChartType = null;
    this.isChartRendered = false;
    this.activePieBreakdown = null;
    this.activeSunburstLevel = null;
    this.activeTimeSeriesGranularity = null;
    this.activeTimeSeriesType = null;
    this.uiService.populateFilterDataSources(
      () => this.dataManager.getKnownHierarchies(),
      () => this.dataManager.getKnownProjects()
    );
    this.updateAnalysis();
  }

  /**
   * Handles the user selecting a new folder from the UI.
   * @param folder - The folder selected by the user.
   */
  private async handleFolderSelect(folder: TFolder): Promise<void> {
    this.uiService.clearAllFilters();
    await this.dataService.loadAndProcessFolder(folder);
  }

  /**
   * Handles the user clicking the "Clear Cache" button.
   */
  private async handleClearCache(): Promise<void> {
    await this.dataService.clearCache();
    this.activeChartType = null;
    this.isChartRendered = false;
    this.activePieBreakdown = null;
    this.activeSunburstLevel = null;
    this.activeTimeSeriesGranularity = null;
    this.activeTimeSeriesType = null;
    this.activeActivityPattern = null;
    this.updateAnalysis(); // Re-render the empty state
    this.uiService.promptForFolder();
  }

  /**
   * The core analysis pipeline. Gathers filters, and delegates rendering to the active chart strategy.
   */
  private updateAnalysis(): void {
    const { filters, newChartType } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    // --- FIX: The logic to determine a full redraw is now more intelligent ---
    let useReact = this.activeChartType === newChartType && this.isChartRendered;

    if (useReact) {
      switch (newChartType) {
        case 'pie':
          if (this.activePieBreakdown !== chartSpecificFilters.breakdownBy) useReact = false;
          break;
        case 'sunburst':
          if (this.activeSunburstLevel !== chartSpecificFilters.level) useReact = false;
          break;
        case 'time-series':
          if (
            this.activeTimeSeriesGranularity !== chartSpecificFilters.granularity ||
            this.activeTimeSeriesType !== chartSpecificFilters.type
          )
            useReact = false;
          break;
        case 'activity':
          if (this.activeActivityPattern !== chartSpecificFilters.patternType) useReact = false;
          break;
      }
    }

    filters.pattern = chartSpecificFilters.pattern; // Add regex pattern for DataManager
    const { records, totalHours, fileCount, error } = this.dataManager.getAnalyzedData(
      filters,
      null
    );

    this.renderUI(records, totalHours, fileCount, useReact);

    // Update active state *after* rendering
    this.activeChartType = newChartType;
    this.activePieBreakdown = newChartType === 'pie' ? chartSpecificFilters.breakdownBy : null;
    this.activeSunburstLevel = newChartType === 'sunburst' ? chartSpecificFilters.level : null;
    this.activeTimeSeriesGranularity =
      newChartType === 'time-series' ? chartSpecificFilters.granularity : null;
    this.activeTimeSeriesType = newChartType === 'time-series' ? chartSpecificFilters.type : null;
    this.activeActivityPattern =
      newChartType === 'activity' ? chartSpecificFilters.patternType : null;

    this.uiService.saveFilterState();
  }

  /**
   * Manages the overall UI state (stats, messages) and calls the specific chart strategy.
   * This is the final step in the rendering pipeline.
   * @param filteredRecords - The records that have passed all filters.
   * @param totalHours - The sum of hours for the filtered records.
   * @param fileCount - The number of unique files in the filtered set.
   * @param useReact - A boolean flag indicating whether to use Plotly.react (for fast updates) or Plotly.newPlot (for full redraws).
   */
  private renderUI(
    filteredRecords: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean
  ) {
    // Always render the error log with the latest information.
    Plotter.renderErrorLog(
      this.rootEl,
      this.dataService.processingErrors,
      this.dataManager.getTotalRecordCount()
    );

    // Case 1: No data has been loaded at all (e.g., first launch, empty folder).
    if (this.dataManager.getTotalRecordCount() === 0) {
      this.uiService.hideMainContainers();
      Plotter.renderChartMessage(
        this.rootEl,
        'No time-tracking files found. Please select a folder.'
      );
      this.isChartRendered = false; // No chart is on the screen.
      return;
    }

    // If we have data, ensure the main layout containers are visible.
    this.uiService.showMainContainers();

    // Case 2: Data exists, but the current filters yield no results.
    if (filteredRecords.length === 0) {
      this.uiService.renderStats('-', '-'); // Show placeholder stats.
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false; // The chart was destroyed to show the message.
      return;
    }

    // Case 3: We have data that matches the filters. Render the stats and the chart.
    this.uiService.renderStats(totalHours, fileCount);

    const { newChartType } = this.uiService.getFilterState();
    const chartStrategies = this.createChartStrategies();
    const strategy = chartStrategies.get(newChartType!);

    if (strategy) {
      this.uiService.updateActiveAnalysisStat(strategy.analysisName);
      // Delegate the actual chart rendering to the appropriate strategy.
      strategy.render(this, useReact, filteredRecords);
      this.isChartRendered = true; // A chart has been successfully rendered.
    } else {
      // Fallback case if an unknown chart type is selected.
      Plotter.renderChartMessage(this.rootEl, `Unknown chart type: ${newChartType}`);
      this.isChartRendered = false;
    }
  }

  /**
   * Creates and maps all the available chart strategies.
   * This is the key to making the system extensible.
   */
  private createChartStrategies(): Map<string, IChartStrategy> {
    const strategies = new Map<string, IChartStrategy>();

    strategies.set('pie', {
      analysisName: 'Category Breakdown',
      render(controller: AnalysisController, useReact: boolean, filteredRecords: TimeRecord[]) {
        const pieFilters = controller.uiService.getChartSpecificFilter('pie');
        // We now need to re-aggregate here, as the breakdown level is dynamic
        const { aggregation, recordsByCategory, error } = controller.dataManager.getAnalyzedData(
          { ...controller.uiService.getFilterState().filters, pattern: pieFilters.pattern },
          pieFilters.breakdownBy
        );

        if (error) {
          Plotter.renderChartMessage(controller.rootEl, `Regex Error: ${error}`);
          return;
        }

        const pieData: PieData = { hours: aggregation, recordsByCategory, error: false };
        Plotter.renderPieChartDisplay(
          controller.rootEl,
          pieData,
          controller.uiService.showDetailPopup,
          useReact
        );
      }
    });

    strategies.set('sunburst', {
      analysisName: 'Category Breakdown',
      render(controller: AnalysisController, useReact: boolean, filteredRecords: TimeRecord[]) {
        const sunburstFilters = controller.uiService.getChartSpecificFilter('sunburst');
        const sunburstData = Aggregator.aggregateForSunburst(
          filteredRecords,
          sunburstFilters.level
        );
        Plotter.renderSunburstChartDisplay(
          controller.rootEl,
          sunburstData,
          controller.uiService.showDetailPopup,
          useReact
        );
      }
    });

    strategies.set('time-series', {
      analysisName: 'Time-Series Trend',
      render(controller: AnalysisController, useReact: boolean, filteredRecords: TimeRecord[]) {
        const { filters } = controller.uiService.getFilterState();
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderTimeSeriesChart(controller.rootEl, filteredRecords, filterDates, useReact);
      }
    });

    strategies.set('activity', {
      analysisName: 'Activity Patterns',
      render(controller: AnalysisController, useReact: boolean, filteredRecords: TimeRecord[]) {
        const { filters } = controller.uiService.getFilterState();
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderActivityPatternChart(
          controller.rootEl,
          filteredRecords,
          filterDates,
          controller.uiService.showDetailPopup,
          useReact
        );
      }
    });

    return strategies;
  }
}
