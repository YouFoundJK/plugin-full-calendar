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

export const PLOTLY_DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: 'var(--font-default)',
    size: 12
  },
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
    bgcolor: 'rgba(0,0,0,0)',
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
