/**
 * @file Defines all shared data structures, interfaces, and type definitions for the Chrono Analyser.
 * This centralizes the data contracts used across different modules (parsing, aggregation, plotting).
 */

import Plotly from '../plotly-custom';

/**
 * Represents a single time-logged event parsed from a file.
 * This is the core data object used throughout the analysis pipeline.
 */
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

  /**
   * The calculated duration for the event within the currently filtered date period.
   * For non-recurring events, this is the same as `duration`.
   * For recurring events, this is `duration * numberOfInstancesInPeriod`.
   * This property is added during the filtering stage.
   * @private
   */
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
