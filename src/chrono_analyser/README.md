# Chrono Analyser Subproject
[![License](https://img.shields.io/badge/License-MIT-green)](https://github.com/YouFoundJK/plugin-full-calendar/blob/main/LICENSE)
[![Version](https://img.shields.io/badge/Version-v_0.10.9-blue)](https://youfoundjk.github.io/Time-Analyser-Full-Calender/)

## 1. Overview

The Chrono Analyser is a feature within the Full Calendar plugin that provides users with powerful data visualization tools to analyze their time-tracking notes. It scans a designated folder of markdown files, parses time and project data from filenames and YAML frontmatter, and renders interactive charts (Pie, Sunburst, Time-Series, etc.) to give users insights into how they spend their time.

This document details the architecture, data flow, and development guidelines for this subproject.

## 2. Core Features 

-   **Multi-Chart Analysis**: Supports various chart types including Pie, Sunburst, Time-Series Trends, and Activity Heatmaps.
-   **Interactive Visualizations**: Charts are fully interactive, with tooltips and clickable segments that open a detailed popup view of the underlying data records.
-   **High-Performance Caching**: Implements a robust, persistent caching system using file modification times (`mtime`) to avoid re-parsing unchanged files, resulting in near-instantaneous load times after the initial scan.
-   **Real-time Synchronization**: The analyser listens to vault events (`modify`, `delete`, `rename`) to keep the data fresh and the view updated in real-time without requiring a manual refresh.
-   **Efficient In-Memory Filtering**: Utilizes in-memory indices for projects, hierarchies, and dates to provide a lag-free filtering experience, even with thousands of data points.

## 3. Architectural Overview

The Chrono Analyser is built on a modular, decoupled architecture designed for performance, maintainability, and extensibility. The core components communicate in a well-defined flow, separating concerns into distinct modules.

### Data Flow Diagram

```ascii
+----------------+       +-------------------+       +---------------------+
|      UI        |------>|   Controller.ts   |------>|   DataManager.ts    |
| (HTML Filters) |       |  (Orchestrator)   |       | (Cache/Index/Query) |
+----------------+       +-------------------+       +---------------------+
      |   ^                     |                             |
      |   | (Update View)       | (Calls Query)               |
      |   |                     v                             v
      |   +-------------+---------------------+       +----------------+
      |                 |    Aggregator.ts    |------>|   Plotter.ts   |
      +-----------------|   (For Sunburst)    |       | (Renders Chart)|
                        +---------------------+       +----------------+
```

### Component Breakdown

The entire feature is self-contained within the `src/chrono_analyser/` directory.

-   **`AnalysisView.ts`**: The main Obsidian `ItemView` class. Its primary job is to create the DOM structure and instantiate the `AnalysisController`.
-   **`controller.ts`**: The central **orchestrator**. It handles user events (clicks, input), manages the application state (e.g., selected filters), and directs the flow of data between the `DataManager`, `Aggregator`, and `Plotter`. It knows *what* to do, but not *how* to do it.
-   **`dom.ts`**: Contains a function that generates the static HTML skeleton for the view.

#### `modules/`

-   **`DataManager.ts`**: The **brain** of the system. This stateful class holds all `TimeRecord` objects and maintains high-performance indices (Maps) for projects, hierarchies, and dates. It provides a single, powerful query method (`getAnalyzedData`) that performs filtering and aggregation in one efficient pass.
-   **`parser.ts`**: A stateless module with one job: to parse a single `TFile` into a structured `TimeRecord` object. It handles all regex and YAML parsing logic.
-   **`plotter.ts`**: A stateless module responsible for all `Plotly.js` rendering. It receives prepared data and draws the charts. It contains no application state.
-   **`aggregator.ts`**: A helper module for complex, multi-level aggregations (like Sunburst) that don't fit the generic single-pass model in the `DataManager`.
-   **`types.ts`**: The source of truth for all data structures (`TimeRecord`, `AnalysisFilters`, `CacheEntry`, etc.). Centralizing types ensures a consistent data contract across all modules.
-   **`ui.ts`**: Contains UI-specific components like the `FolderSuggestModal` and the `setupAutocomplete` logic.
-   **`utils.ts`**: A library of pure, stateless helper functions for date manipulation, duration calculations, etc.

## 4. Performance & Data Flow Deep Dive

### Initial Load & Caching

1.  On startup, `controller.ts` calls `loadCache()` to retrieve the persisted `ChronoCache` from the plugin's `data.json`.
2.  When `loadAndProcessFolder` is called, it iterates through all relevant markdown files.
3.  For each file, it checks if `cache[filePath].mtime === file.stat.mtime`.
    -   **If TRUE**: The file is unchanged. The pre-parsed `TimeRecord` is loaded directly from the cache. Crucially, any date strings from the JSON are "revived" back into `Date` objects.
    -   **If FALSE**: The file is new or modified. `parser.ts` is called to parse it. The new `TimeRecord` and current `mtime` are stored in the cache.
4.  After processing, `saveCache()` persists any changes back to `data.json`.

### Filtering & Aggregation

The key to a lag-free UI is the `DataManager.getAnalyzedData` method, which avoids redundant loops.

1.  The `Controller` gathers all active filters from the UI (e.g., `{ hierarchy: 'work', filterStartDate: Date(...) }`).
2.  It calls `getAnalyzedData` with these filters.
3.  **The `DataManager` performs a multi-stage, high-performance query:**
    a. It first applies the most restrictive index (e.g., using the sorted date index to find a small slice of records).
    b. It then intersects the resulting set of file paths with the sets from the `hierarchyIndex` and `projectIndex`.
    c. This produces a very small, final set of candidate records.
    d. It performs a **single loop** over this final set to calculate stats (`totalHours`) and perform aggregations (for the pie chart) simultaneously.
4.  It returns a complete `AnalysisResult` object, preventing the `Controller` from needing to loop through the data again.

## 5. Developer Guide & Extension Hooks

This system is designed to be easily extended.

### How to Add a New Chart Type

Let's say you want to add a "Bar Chart by Project".

1.  **Update UI (`dom.ts`)**: Add a new `<option>` to the `#analysisTypeSelect` dropdown.
    ```html
    <option value="bar-project">Bar Chart by Project</option>
    ```
2.  **Create Plotter Function (`plotter.ts`)**: Create a new function `renderProjectBarChart(rootEl, analysisResult)`. This function will take the aggregated data and use Plotly to draw a bar chart.
3.  **Update Controller (`controller.ts`)**:
    a. In `updateAnalysis`, detect the new type and set the `breakdownBy` key to `'project'`.
    b. In `renderUI`, add a new `else if` block to the chart rendering logic:
    ```typescript
    // In renderUI()
    } else if (analysisType === 'bar-project') {
        analysisName = 'Bar Chart by Project';
        // The data is already aggregated by the DataManager!
        Plotter.renderProjectBarChart(this.rootEl, pieData); // Re-use pieData structure
    }
    ```

### How to Add a New Filter

Let's say you want to filter by `subproject`.

1.  **Update UI (`dom.ts`)**: Add a new text input and suggestion container for the subproject filter.
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
    c. In `getAnalyzedData`, add a new filtering stage that uses the `#subprojectIndex` to narrow down the `candidatePaths`.
4.  **Update Controller (`controller.ts`)**:
    a. In `updateAnalysis`, read the value from the new subproject input field and add it to the `filters` object passed to `getAnalyzedData`.
    b. In `populateFilterDataSources`, set up a new autocomplete for the subproject input.

## 6. Future Work & Potential Improvements

-   **Generic Aggregation**: Refactor the Sunburst aggregation to use the single-pass `DataManager` query, making it as efficient as the Pie chart.
-   **Advanced Filtering**: Add support for filtering by tags (extracted from YAML) or using logical operators (e.g., Project A OR Project B).
-   **Date Index Optimization**: The current date filter loops through the sorted index. This can be replaced with a true binary search algorithm to find the start/end indices for even faster performance on very large date ranges.