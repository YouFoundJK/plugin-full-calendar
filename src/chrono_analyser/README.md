# Chrono Analyser Subproject
[![License](https://img.shields.io/badge/License-MIT-green)](https://github.com/YouFoundJK/plugin-full-calendar/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/Version-v_0.10.11-blue)](https://youfoundjk.github.io/Time-Analyser-Full-Calender/)


## 1. Overview

The Chrono Analyser is a feature within the Full Calendar plugin that provides users with powerful data visualization tools to analyze their time-tracking notes. It scans a designated folder of markdown files, parses time and project data from filenames and YAML frontmatter, and renders interactive charts to give users insights into how they spend their time.

This document details the architecture, data flow, and development guidelines for this subproject, which has been designed for high performance, modularity, and extensibility.

## 2. Core Features

-   **Multi-Chart Analysis**: Supports various chart types including Pie, Sunburst, Time-Series Trends, and Activity Heatmaps.
-   **Interactive Visualizations**: Charts are fully interactive, with tooltips and clickable segments that open a detailed popup view of the underlying data records.
-   **High-Performance Caching**: Implements a robust, persistent caching system using file modification times (`mtime`) to avoid re-parsing unchanged files, resulting in near-instantaneous load times after the initial scan.
-   **Real-time Synchronization**: The analyser listens to vault events (`modify`, `delete`, `rename`) to keep the data fresh and the view updated in real-time without requiring a manual refresh.
-   **Efficient In-Memory Filtering**: Utilizes in-memory indices for projects, hierarchies, and dates to provide a lag-free filtering experience, even with thousands of data points.
-   **Extensible Architecture**: Built using a service-oriented approach and a Chart Strategy pattern, allowing new charts and filters to be added with minimal changes to core files.

## 3. Architectural Overview

The Chrono Analyser is built on a modular, decoupled architecture that strictly adheres to the **Single Responsibility Principle**. The system is broken down into three main layers: a **Data Service**, a **UI Service**, and a central **Controller** that orchestrates the communication between them.

### High-Level Architecture Diagram

```ascii
+----------------------+      +--------------------+      +-----------------------+
|     UIService.ts     |----->|   Controller.ts    |----->|     DataService.ts    |
| (Handles DOM, Events)|      |   (Orchestrator)   |      | (Handles Cache, Files)|
|                      |<-----| (Applies Strategy) |<-----|                       |
+----------------------+      +--------------------+      +-----------------------+
       |         ^                  |                             |
(Renders)    (Updates)              | (Queries)                   | (Manages)
       |         |                  |                             |
       v         |                  v                             v
+-------------+  |           +------------------+          +----------------+
| plotter.ts  +--+           |  DataManager.ts  |          |   parser.ts    |
+-------------+              | (The Query Engine) |          | (File->Record) |
                             +------------------+          +----------------+
```

### Component Breakdown

-   **`AnalysisView.ts`**: The main Obsidian `ItemView`. Its only job is to create the DOM skeleton and instantiate the `AnalysisController`.

-   **`controller.ts`**: The central **Orchestrator**. It is the leanest and most important class. It contains no complex logic itself. Its responsibilities are:
    1.  Initialize the `DataService` and `UIService`.
    2.  Receive events (callbacks) from the services (e.g., "filters changed" or "data is ready").
    3.  Apply the appropriate **Chart Strategy** to process the data and render the UI.

-   **`modules/DataService.ts`**: The **Data Layer**. This service is responsible for everything related to data sourcing.
    -   Manages the persistent cache (`load/saveCacheAndSettings`).
    -   Scans vault folders and orchestrates file parsing.
    -   Listens for vault events and keeps the data up-to-date.
    -   Populates the `DataManager` with fresh data.

-   **`modules/UIService.ts`**: The **View Layer**. This service is responsible for all DOM interaction.
    -   Sets up all event listeners (buttons, dropdowns, etc.).
    -   Reads the current state of UI filters.
    -   Shows, hides, and updates DOM elements (stats, chart containers, popups).
    -   Saves and loads the filter state to `localStorage`.

-   **`modules/DataManager.ts`**: The **Query Engine**. This is a powerful, stateful class that holds all `TimeRecord` objects.
    -   Maintains high-performance in-memory indices for hierarchies, projects, and dates.
    -   Provides a single, optimized query method (`getAnalyzedData`) that performs filtering and aggregation in one efficient pass.

-   **`modules/plotter.ts`**: A stateless rendering module. It receives fully prepared data and uses `Plotly.js` to draw the charts.

-   **`modules/aggregator.ts`**: A stateless helper for complex, multi-level aggregations (like Sunburst) that don't fit the generic single-pass model.

## 4. The Chart Strategy Pattern

To avoid a monolithic `if/else if` block in the controller for handling different charts, we use the **Strategy Pattern**. This makes the system highly extensible.

-   **The Contract (`IChartStrategy`)**: An interface in `controller.ts` defines what every chart strategy must provide: an `analysisName` and a `render` method.
-   **The Implementation**: In the controller's `createChartStrategies` method, we create a `Map` where each key is a chart type (e.g., `'pie'`) and the value is a strategy object that fulfills the contract.
-   **The Execution**: The controller's `renderUI` method simply gets the current chart type from the UI, looks up the corresponding strategy in the map, and executes its `render` method.

This means adding a new chart type **does not require modifying the core `renderUI` logic at all**.

## 5. Developer Guide & Extension Hooks

This system is designed to be easily extended. Follow these recipes for common development tasks.

### How to Add a New Chart Type

Let's add a "Bar Chart by Project".

1.  **Update UI (`dom.ts`)**: Add a new `<option>` to the `#analysisTypeSelect` dropdown.
    ```html
    <option value="bar-project">Bar Chart by Project</option>
    ```
2.  **Create Plotter Function (`plotter.ts`)**: Create a new function `renderProjectBarChart(rootEl, pieData, useReact)`. It can reuse the `PieData` structure, as it's a simple categorical aggregation. This function will use Plotly to draw the bar chart.
3.  **Update Controller (`controller.ts`)**: Add a new entry to the `chartStrategies` map inside the `createChartStrategies` method.
    ```typescript
    // In controller.ts -> createChartStrategies()

    strategies.set('bar-project', {
      analysisName: 'Bar Chart by Project',
      render(controller: AnalysisController, useReact: boolean) {
        const { filters } = controller.uiService.getFilterState();
        // The DataManager can aggregate by project for us.
        const { aggregation, recordsByCategory, error } = controller.dataManager.getAnalyzedData(filters, 'project');
        
        if (error) { /* handle error */ return; }

        const chartData: PieData = { hours: aggregation, recordsByCategory, error: false };
        Plotter.renderProjectBarChart(controller.rootEl, chartData, useReact);
      }
    });
    ```
    That's it. The new chart is now fully integrated.

### How to Add a New Filter

Let's add a filter for `subproject`.

1.  **Update UI (`dom.ts`)**: Add a new text input and suggestion container for the subproject filter in the HTML structure.
2.  **Update Types (`types.ts`)**: Add the optional property to the `AnalysisFilters` interface.
    ```typescript
    export interface AnalysisFilters {
      // ... existing filters
      subproject?: string;
    }
    ```
3.  **Update DataManager (`DataManager.ts`)**:
    a. Add a new index: `#subprojectIndex: Map<string, Set<string>> = new Map()`.
    b. Update `addRecord` and `removeRecord` to populate this new index (using a lowercase key).
    c. In `getAnalyzedData`, add a new filtering stage that uses the `#subprojectIndex` to intersect with the `candidatePaths`.
4.  **Update UIService (`UIService.ts`)**:
    a. In `getFilterState`, read the value from the new subproject input and add it to the `filters` object.
    b. In `populateFilterDataSources`, add a call to `UI.setupAutocomplete` for the new subproject input, providing a new `getKnownSubprojects` method from the `DataManager`.

## 6. Future Work & Potential Improvements

-   **Generic Aggregation for Sunburst**: The Sunburst chart still uses its own aggregator. A future improvement would be to enhance the `DataManager`'s `getAnalyzedData` method to handle multi-level `breakdownBy` keys (e.g., `['hierarchy', 'project']`) to make it a true single-pass query engine for all chart types.
-   **Binary Search for Date Index**: The date index is sorted, but the current implementation loops through it. Replacing this with a true binary search algorithm would provide a logarithmic performance boost for date filtering.
-   **UI State Persistence**: The filter state (`localStorage`) and data cache (`plugin.saveData`) are separate. Consolidating all persistent state into `plugin.saveData` under the `ChronoAnalyserData` object would be cleaner.