// src/chrono_analyser/modules/DataManager.ts

/**
 * @file Manages the state of all parsed TimeRecords, providing indexed lookups and efficient filtering.
 * This class is the single source of truth for all analytical data.
 */

import { TimeRecord } from './types';
import * as Utils from './utils';

export interface AnalysisFilters {
  hierarchy?: string;
  project?: string;
  filterStartDate?: Date | null;
  filterEndDate?: Date | null;
  pattern?: string;
}

/**
 * The result of a full analysis query, including aggregated data.
 */
export interface AnalysisResult {
  records: TimeRecord[];
  totalHours: number;
  fileCount: number;
  // A map of category names to the sum of hours for that category.
  aggregation: Map<string, number>;
  // A map of category names to the list of records belonging to that category.
  recordsByCategory: Map<string, TimeRecord[]>;
  error: string | null;
}

/**
 * A stateful class that holds all time records and provides indexed,
 * high-performance filtering and aggregation in a single pass.
 */
export class DataManager {
  #records: Map<string, TimeRecord> = new Map();
  #hierarchyIndex: Map<string, Set<string>> = new Map();
  #projectIndex: Map<string, Set<string>> = new Map();

  // --- NEW: A sorted array for high-speed date range lookups ---
  #dateIndex: { date: number; path: string }[] = [];

  #originalHierarchyCasing: Map<string, string> = new Map();
  #originalProjectCasing: Map<string, string> = new Map();

  public clear(): void {
    this.#records.clear();
    this.#hierarchyIndex.clear();
    this.#projectIndex.clear();
    this.#dateIndex = [];
    this.#originalHierarchyCasing.clear();
    this.#originalProjectCasing.clear();
  }

  public addRecord(record: TimeRecord): void {
    if (this.#records.has(record.path)) {
      this.removeRecord(record.path);
    }
    this.#records.set(record.path, record);

    const hierarchyKey = record.hierarchy.toLowerCase();
    if (!this.#hierarchyIndex.has(hierarchyKey)) {
      this.#hierarchyIndex.set(hierarchyKey, new Set());
      this.#originalHierarchyCasing.set(hierarchyKey, record.hierarchy);
    }
    this.#hierarchyIndex.get(hierarchyKey)!.add(record.path);

    const projectKey = record.project.toLowerCase();
    if (!this.#projectIndex.has(projectKey)) {
      this.#projectIndex.set(projectKey, new Set());
      this.#originalProjectCasing.set(projectKey, record.project);
    }
    this.#projectIndex.get(projectKey)!.add(record.path);

    // Add to the date index if the record has a date
    if (record.date) {
      this.#dateIndex.push({ date: record.date.getTime(), path: record.path });
    }
  }

  /**
   * Must be called after all records are added to sort the date index for binary search.
   */
  public finalize(): void {
    this.#dateIndex.sort((a, b) => a.date - b.date);
  }

  public removeRecord(filePath: string): void {
    const record = this.#records.get(filePath);
    if (!record) return;

    const hierarchyKey = record.hierarchy.toLowerCase();
    const projectKey = record.project.toLowerCase();
    const hierarchyPaths = this.#hierarchyIndex.get(hierarchyKey);
    if (hierarchyPaths) {
      hierarchyPaths.delete(filePath);
      if (hierarchyPaths.size === 0) {
        this.#hierarchyIndex.delete(hierarchyKey);
        this.#originalHierarchyCasing.delete(hierarchyKey);
      }
    }
    const projectPaths = this.#projectIndex.get(projectKey);
    if (projectPaths) {
      projectPaths.delete(filePath);
      if (projectPaths.size === 0) {
        this.#projectIndex.delete(projectKey);
        this.#originalProjectCasing.delete(projectKey);
      }
    }
    this.#records.delete(filePath);

    // Remove from date index
    const dateIndexPos = this.#dateIndex.findIndex(d => d.path === filePath);
    if (dateIndexPos > -1) {
      this.#dateIndex.splice(dateIndexPos, 1);
    }
  }

  public getKnownHierarchies = (): string[] =>
    Array.from(this.#originalHierarchyCasing.values()).sort();
  public getKnownProjects = (): string[] => Array.from(this.#originalProjectCasing.values()).sort();
  public getTotalRecordCount = (): number => this.#records.size;

  /**
   * Performs a high-performance, single-pass filter AND aggregation of the data.
   * This is the primary query method for the analyzer.
   * @param filters - The filter criteria to apply.
   * @param breakdownBy - The TimeRecord property to use for aggregation/categorization.
   * @returns An AnalysisResult object containing filtered records, stats, and aggregated data.
   */
  public getAnalyzedData(
    filters: AnalysisFilters,
    breakdownBy: keyof TimeRecord | null
  ): AnalysisResult {
    // --- FIX: Declare the result object ONCE at the top ---
    const result: AnalysisResult = {
      records: [],
      totalHours: 0,
      fileCount: 0,
      aggregation: new Map(),
      recordsByCategory: new Map(),
      error: null
    };
    let regex: RegExp | null = null;

    if (filters.pattern) {
      try {
        regex = new RegExp(filters.pattern, 'i');
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        return result; // Return early with the error
      }
    }

    let candidatePaths: Set<string> | null = null;

    // --- OPTIMIZATION 1: Use Date Index if it's the most restrictive filter ---
    const startDate = filters.filterStartDate ?? null;
    const endDate = filters.filterEndDate ?? null;

    if (startDate || endDate) {
      candidatePaths = new Set();
      // Use binary search (or a simple find, depending on what's faster to implement)
      // For simplicity, we'll loop, but a binary search would go here.
      const startTime = startDate?.getTime() ?? -Infinity;
      const endTime = endDate?.getTime() ?? Infinity;
      for (const item of this.#dateIndex) {
        if (item.date >= startTime && item.date <= endTime) {
          candidatePaths.add(item.path);
        }
      }
    }

    // --- OPTIMIZATION 2: Intersect with category indices ---
    if (filters.hierarchy) {
      const hierarchyPaths = this.#hierarchyIndex.get(filters.hierarchy) || new Set();
      candidatePaths = candidatePaths
        ? new Set([...candidatePaths].filter(path => hierarchyPaths.has(path)))
        : hierarchyPaths;
    }

    if (filters.project) {
      const projectPaths = this.#projectIndex.get(filters.project) || new Set();
      candidatePaths = candidatePaths
        ? new Set([...candidatePaths].filter(path => projectPaths.has(path)))
        : projectPaths;
    }

    const recordsToScan: Iterable<TimeRecord> = candidatePaths
      ? Array.from(candidatePaths)
          .map(path => this.#records.get(path)!)
          .filter(Boolean)
      : this.#records.values();

    const uniqueFiles = new Set<string>();

    for (const record of recordsToScan) {
      let effectiveDuration = 0;
      let includeRecord = false;

      // Note: Recurring events are not in the date index, so we handle them separately.
      // A full implementation might also index recurring events by their start date.
      if (record.metadata?.type === 'recurring') {
        const numInstances = Utils.calculateRecurringInstancesInDateRange(
          record.metadata,
          startDate,
          endDate
        );
        effectiveDuration = (record.duration || 0) * numInstances;
        if (effectiveDuration > 0) includeRecord = true;
      } else {
        if (!startDate && !endDate) {
          effectiveDuration = record.duration;
          includeRecord = true;
        } else if (candidatePaths?.has(record.path)) {
          effectiveDuration = record.duration;
          includeRecord = true;
        }
      }

      if (includeRecord && effectiveDuration > 0) {
        const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };

        if (breakdownBy) {
          const key = String(record[breakdownBy] || `(No ${breakdownBy})`);
          if (regex && !regex.test(key)) {
            continue;
          }
          result.aggregation.set(key, (result.aggregation.get(key) || 0) + effectiveDuration);
          if (!result.recordsByCategory.has(key)) result.recordsByCategory.set(key, []);
          result.recordsByCategory.get(key)!.push(finalRecord);
        }

        result.records.push(finalRecord);
        result.totalHours += effectiveDuration;
        uniqueFiles.add(record.path);
      }
    }

    result.fileCount = uniqueFiles.size;
    return result;
  }

  // --- FIX: Provide the full, correct implementation for this method ---
  private isWithinDateRange(
    recordDate: Date | null,
    startDate: Date | null,
    endDate: Date | null
  ): boolean {
    if (!startDate && !endDate) return true;
    if (!recordDate || isNaN(recordDate.getTime())) return false;

    const recordTime = new Date(
      Date.UTC(recordDate.getUTCFullYear(), recordDate.getUTCMonth(), recordDate.getUTCDate())
    ).getTime();

    if (startDate) {
      const startTime = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
      ).getTime();
      if (recordTime < startTime) return false;
    }
    if (endDate) {
      const endTime = new Date(
        Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
      ).getTime();
      if (recordTime > endTime) return false;
    }
    return true;
  }
}
