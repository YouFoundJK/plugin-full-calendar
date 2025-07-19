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
  render(
    controller: AnalysisController, // Provide context
    useReact: boolean
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
  private chartStrategies: Map<string, IChartStrategy>;

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
    this.chartStrategies = this.createChartStrategies();
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
    this.updateAnalysis(); // Re-render the empty state
    this.uiService.promptForFolder();
  }

  /**
   * The core analysis pipeline. Gathers filters, and delegates rendering to the active chart strategy.
   */
  private updateAnalysis(): void {
    const { filters, newChartType } = this.uiService.getFilterState();
    const useReact = this.activeChartType === newChartType && this.isChartRendered;

    // Always get the generic filtered records
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);
    filters.pattern = chartSpecificFilters.pattern;
    const { records, totalHours, fileCount, error } = this.dataManager.getAnalyzedData(
      filters,
      null
    );

    this.renderUI(records, totalHours, fileCount, useReact);

    this.activeChartType = newChartType;
    this.uiService.saveFilterState();
  }

  /**
   * Manages the overall UI state (stats, messages) and calls the specific chart strategy.
   */
  private renderUI(
    filteredRecords: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean
  ) {
    Plotter.renderErrorLog(
      this.rootEl,
      this.dataService.processingErrors,
      this.dataManager.getTotalRecordCount()
    );

    if (this.dataManager.getTotalRecordCount() === 0) {
      this.uiService.hideMainContainers();
      Plotter.renderChartMessage(
        this.rootEl,
        'No time-tracking files found. Please select a folder.'
      );
      this.isChartRendered = false;
      return;
    }

    this.uiService.showMainContainers();

    if (filteredRecords.length === 0) {
      this.uiService.renderStats('-', '-');
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false;
      return;
    }

    this.uiService.renderStats(totalHours, fileCount);

    const { newChartType } = this.uiService.getFilterState();
    const strategy = this.chartStrategies.get(newChartType!);

    if (strategy) {
      this.uiService.updateActiveAnalysisStat(strategy.analysisName);
      strategy.render(this, useReact);
      this.isChartRendered = true;
    } else {
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

    // --- Pie Chart Strategy ---
    strategies.set('pie', {
      analysisName: 'Category Breakdown',
      render(controller: AnalysisController, useReact: boolean) {
        const { filters } = controller.uiService.getFilterState();
        const pieFilters = controller.uiService.getChartSpecificFilter('pie');
        filters.pattern = pieFilters.pattern;
        const { aggregation, recordsByCategory, error } = controller.dataManager.getAnalyzedData(
          filters,
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

    // --- Sunburst Chart Strategy ---
    strategies.set('sunburst', {
      analysisName: 'Category Breakdown',
      render(controller: AnalysisController, useReact: boolean) {
        const { filters } = controller.uiService.getFilterState();
        const sunburstFilters = controller.uiService.getChartSpecificFilter('sunburst');
        filters.pattern = sunburstFilters.pattern;
        const { records } = controller.dataManager.getAnalyzedData(filters, null);

        const sunburstData = Aggregator.aggregateForSunburst(records, sunburstFilters.level);
        Plotter.renderSunburstChartDisplay(
          controller.rootEl,
          sunburstData,
          controller.uiService.showDetailPopup,
          useReact
        );
      }
    });

    // --- Time-Series Strategy ---
    strategies.set('time-series', {
      analysisName: 'Time-Series Trend',
      render(controller: AnalysisController, useReact: boolean) {
        const { filters } = controller.uiService.getFilterState();
        const { records } = controller.dataManager.getAnalyzedData(filters, null);
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderTimeSeriesChart(controller.rootEl, records, filterDates, useReact);
      }
    });

    // --- Activity Patterns Strategy ---
    strategies.set('activity', {
      analysisName: 'Activity Patterns',
      render(controller: AnalysisController, useReact: boolean) {
        const { filters } = controller.uiService.getFilterState();
        const { records } = controller.dataManager.getAnalyzedData(filters, null);
        const filterDates = {
          filterStartDate: filters.filterStartDate ?? null,
          filterEndDate: filters.filterEndDate ?? null
        };
        Plotter.renderActivityPatternChart(
          controller.rootEl,
          records,
          filterDates,
          controller.uiService.showDetailPopup,
          useReact
        );
      }
    });

    return strategies;
  }
}
