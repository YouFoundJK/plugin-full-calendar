/**
 * @file Defines all shared data structures, interfaces, and type definitions for the Chrono Analyser.
 * This centralizes the data contracts used across different modules (parsing, aggregation, plotting).
 */

import Plotly from '../plotly-custom';

// ... (keep all existing interfaces like TimeRecord, ProcessingError, etc.)

export interface TimeRecord {
  path: string;
  hierarchy: string;
  project: string;
  subproject: string;
  subprojectFull: string;
  duration: number;
  file: string;
  date: Date | null;
  metadata: FileMetadata;
  _effectiveDurationInPeriod?: number;
}

export interface ProcessingError {
  file: string;
  path: string;
  reason: string;
}

export interface SunburstData {
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  recordsByLabel: Map<string, TimeRecord[]>;
}

export interface PieData {
  hours: Map<string, number>;
  recordsByCategory: Map<string, TimeRecord[]>;
  error: boolean;
}

export interface FileMetadata {
  type?: 'recurring' | string;
  startTime?: string | number;
  endTime?: string | number;
  days?: number;
  date?: string | Date;
  startRecur?: string | Date;
  endRecur?: string | Date;
  daysOfWeek?: string | string[];
  [key: string]: any;
}

// --- NEW: A COMPLETE THEME SYSTEM FOR PLOTLY ---

/**
 * Defines base layout properties common to both light and dark themes.
 * This ensures consistency and transparency.
 */
export const PLOTLY_BASE_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: 'var(--font-default)',
    size: 12
  },
  showlegend: true
};

/**
 * Defines layout properties specific to Obsidian's light theme.
 */
export const PLOTLY_LIGHT_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};

/**
 * Defines layout properties specific to Obsidian's dark theme.
 */
export const PLOTLY_DARK_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};

// --- NEW CACHE TYPES ---

/**
 * Defines the structure for a single cached entry.
 * It stores the parsed record and the file's modification time to validate the cache.
 */
export interface CacheEntry {
  mtime: number;
  record: TimeRecord;
}

/**
 * Defines the entire cache object, which maps file paths to their CacheEntry.
 */
export type ChronoCache = Record<string, CacheEntry>;

/**
 * Defines the top-level structure for all data persisted by the Chrono Analyser.
 * This includes the file cache and user settings like the last used folder path.
 */
export interface ChronoAnalyserData {
  cache: ChronoCache;
  lastFolderPath?: string;
}
