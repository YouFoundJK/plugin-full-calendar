/**
 * @file Manages the state of all parsed TimeRecords, providing indexed lookups and efficient filtering.
 * This class is the single source of truth for all analytical data.
 */

import { TimeRecord } from './types';
import * as Utils from './utils';
import { OFCEvent } from '../../types';

export interface AnalysisFilters {
  hierarchy?: string;
  project?: string;
  filterStartDate?: Date | null;
  filterEndDate?: Date | null;
  pattern?: string;
}

export interface DataManagerOptions {
  /**
   * If true, recurring events will be expanded into individual, dated records.
   * If false (default), they will be returned as a single record with a calculated
   * total duration for the period.
   */
  expandRecurring?: boolean;
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

  #originalHierarchyCasing: Map<string, string> = new Map();
  #originalProjectCasing: Map<string, string> = new Map();

  public clear(): void {
    this.#records.clear();
    this.#hierarchyIndex.clear();
    this.#projectIndex.clear();
    this.#originalHierarchyCasing.clear();
    this.#originalProjectCasing.clear();
  }

  public addRecord(record: TimeRecord): void {
    // --- CHANGE 'record.path' to 'record._id' ---
    if (this.#records.has(record._id)) {
      this.removeRecord(record._id);
    }
    this.#records.set(record._id, record);

    const hierarchyKey = record.hierarchy.toLowerCase();
    if (!this.#hierarchyIndex.has(hierarchyKey)) {
      this.#hierarchyIndex.set(hierarchyKey, new Set());
      this.#originalHierarchyCasing.set(hierarchyKey, record.hierarchy);
    }
    // --- CHANGE 'record.path' to 'record._id' ---
    this.#hierarchyIndex.get(hierarchyKey)!.add(record._id);

    const projectKey = record.project.toLowerCase();
    if (!this.#projectIndex.has(projectKey)) {
      this.#projectIndex.set(projectKey, new Set());
      this.#originalProjectCasing.set(projectKey, record.project);
    }
    // --- CHANGE 'record.path' to 'record._id' ---
    this.#projectIndex.get(projectKey)!.add(record._id);
  }

  /**
   * Must be called after all records are added.
   * (Currently empty, but kept for future optimizations like sorting indexes).
   */
  public finalize(): void {
    // No-op for now.
  }

  public removeRecord(recordId: string): void {
    // <-- CHANGE parameter name for clarity
    // --- CHANGE 'filePath' to 'recordId' ---
    const record = this.#records.get(recordId);
    if (!record) return;

    const hierarchyKey = record.hierarchy.toLowerCase();
    const projectKey = record.project.toLowerCase();
    const hierarchyPaths = this.#hierarchyIndex.get(hierarchyKey);
    if (hierarchyPaths) {
      // --- CHANGE 'filePath' to 'recordId' ---
      hierarchyPaths.delete(recordId);
      if (hierarchyPaths.size === 0) {
        this.#hierarchyIndex.delete(hierarchyKey);
        this.#originalHierarchyCasing.delete(hierarchyKey);
      }
    }
    const projectPaths = this.#projectIndex.get(projectKey);
    if (projectPaths) {
      // --- CHANGE 'filePath' to 'recordId' ---
      projectPaths.delete(recordId);
      if (projectPaths.size === 0) {
        this.#projectIndex.delete(projectKey);
        this.#originalProjectCasing.delete(projectKey);
      }
    }
    // --- CHANGE 'filePath' to 'recordId' ---
    this.#records.delete(recordId);
  }

  public getKnownHierarchies = (): string[] =>
    Array.from(this.#originalHierarchyCasing.values()).sort();
  public getKnownProjects = (): string[] => Array.from(this.#originalProjectCasing.values()).sort();
  public getTotalRecordCount = (): number => this.#records.size;

  public getAllRecords(): TimeRecord[] {
    return Array.from(this.#records.values());
  }

  /**
   * Performs a high-performance, single-pass filter AND aggregation of the data.
   * This is the primary query method for the analyzer.
   *
   * ## Filter Format
   * The `filters.pattern` property supports both inclusion and exclusion keywords:
   *
   * - **Inclusion:** Any word or quoted phrase (e.g. `"work" 'team meeting' urgent`) will match records whose project name contains **all** of those tokens (AND logic).
   * - **Exclusion:** Prefix a keyword or quoted phrase with a space and hyphen (e.g. `"work -personal -'team meeting'"`) to exclude records whose project name contains any of those tokens.
   * - **Multiple exclusions:** You can chain exclusions: `"work -personal -test -'team meeting'"` excludes all listed tokens.
   * - **Quoted phrases:** Use double or single quotes to match exact phrases, e.g. `"project A" -'archive folder'`.
   * - **Regex:** Each token is interpreted as a case-insensitive regular expression.
   *
   * Example:
   *   pattern = `"projectA" urgent -archive -'old version'`
   *   → Includes records with both "projectA" and "urgent" in the project name, but excludes those containing "archive" or "old version".
   *
   * @param filters - The filter criteria to apply (see above for pattern usage).
   * @param breakdownBy - The TimeRecord property to use for aggregation/categorization.
   * @param options - Options to control data processing, like expanding recurring events.
   * @returns An AnalysisResult object containing filtered records, stats, and aggregated data.
   */
  public getAnalyzedData(
    filters: AnalysisFilters,
    breakdownBy: keyof TimeRecord | null,
    options: DataManagerOptions = {}
  ): AnalysisResult {
    const result: AnalysisResult = {
      records: [],
      totalHours: 0,
      fileCount: 0,
      aggregation: new Map(),
      recordsByCategory: new Map(),
      error: null
    };

    const { expandRecurring = false } = options;

    // --- NEW: Use an array for multiple inclusion conditions (AND logic) ---
    const inclusionRegexes: RegExp[] = [];
    let exclusionRegex: RegExp | null = null;

    if (filters.pattern) {
      try {
        let patternText = filters.pattern;
        const exclusionKeywords: string[] = [];

        // 1. Find and strip out all exclusion tokens first
        const exclusionTokenRegex = /\s-(?:"[^"]+"|\'[^\']+\'|\S+)/g;
        const exclusionMatches = patternText.match(exclusionTokenRegex);

        if (exclusionMatches) {
          for (const match of exclusionMatches) {
            let keyword = match.substring(2);
            const firstChar = keyword.charAt(0);
            const lastChar = keyword.charAt(keyword.length - 1);
            if (
              (firstChar === '"' && lastChar === '"') ||
              (firstChar === "'" && lastChar === "'")
            ) {
              keyword = keyword.slice(1, -1);
            }
            if (keyword) exclusionKeywords.push(keyword);
          }
          patternText = patternText.replace(exclusionTokenRegex, '').trim();
        }
        if (exclusionKeywords.length > 0) {
          exclusionRegex = new RegExp(exclusionKeywords.join('|'), 'i');
        }

        // 2. Parse the remaining text for inclusion tokens (words or phrases)
        if (patternText) {
          const inclusionTokenRegex = /"[^"]+"|\'[^\']+\'|\S+/g;
          const inclusionMatches = patternText.match(inclusionTokenRegex);
          if (inclusionMatches) {
            for (let token of inclusionMatches) {
              const firstChar = token.charAt(0);
              const lastChar = token.charAt(token.length - 1);
              if (
                (firstChar === '"' && lastChar === '"') ||
                (firstChar === "'" && lastChar === "'")
              ) {
                token = token.slice(1, -1);
              }
              if (token) {
                inclusionRegexes.push(new RegExp(token, 'i'));
              }
            }
          }
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        return result;
      }
    }

    let candidatePaths: Set<string> | null = null;

    if (filters.hierarchy) {
      const hierarchyKey = filters.hierarchy.toLowerCase();
      candidatePaths = this.#hierarchyIndex.get(hierarchyKey) || new Set();
    }

    if (filters.project) {
      const projectKey = filters.project.toLowerCase();
      const projectPaths = this.#projectIndex.get(projectKey) || new Set();
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
    const startDate = filters.filterStartDate ?? null;
    const endDate = filters.filterEndDate ?? null;
    const hasDateFilter = !!(startDate || endDate);

    for (const record of recordsToScan) {
      // --- NEW: Correctly apply universal category filter with AND/OR logic ---
      const targetString = record.project;
      if (exclusionRegex && exclusionRegex.test(targetString)) continue;
      if (inclusionRegexes.length > 0 && !inclusionRegexes.every(re => re.test(targetString)))
        continue;

      if (record.metadata.type === 'recurring' && hasDateFilter) {
        if (expandRecurring) {
          const instances = Utils.getRecurringInstances(record, startDate, endDate);
          for (const instanceDate of instances) {
            let newMetadata: OFCEvent;
            const commonProperties = {
              title: record.metadata.title,
              id: record.metadata.id,
              category: record.metadata.category,
              timezone: record.metadata.timezone,
              type: 'single' as const,
              date: Utils.getISODate(instanceDate)!,
              endDate: Utils.getISODate(instanceDate)!
            };
            if (record.metadata.allDay) {
              newMetadata = { ...commonProperties, allDay: true };
            } else {
              newMetadata = {
                ...commonProperties,
                allDay: false,
                startTime: 'startTime' in record.metadata ? record.metadata.startTime : '00:00',
                endTime: 'endTime' in record.metadata ? record.metadata.endTime : '00:00'
              };
            }
            const instanceRecord: TimeRecord = {
              ...record,
              date: instanceDate,
              metadata: newMetadata,
              _effectiveDurationInPeriod: record.duration
            };
            this.processRecord(instanceRecord, record.duration, breakdownBy, result, uniqueFiles);
          }
        } else {
          const numInstances = Utils.calculateRecurringInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            const effectiveDuration = record.duration * numInstances;
            const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
            this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
          }
        }
      } else if (record.metadata.type === 'rrule' && hasDateFilter) {
        if (expandRecurring) {
          const instances = Utils.getRruleInstances(record, startDate, endDate);
          for (const instanceDate of instances) {
            let newMetadata: OFCEvent;
            const commonProperties = {
              title: record.metadata.title,
              id: record.metadata.id,
              category: record.metadata.category,
              timezone: record.metadata.timezone,
              type: 'single' as const,
              date: Utils.getISODate(instanceDate)!,
              endDate: Utils.getISODate(instanceDate)!
            };
            if (record.metadata.allDay) {
              newMetadata = { ...commonProperties, allDay: true };
            } else {
              newMetadata = {
                ...commonProperties,
                allDay: false,
                startTime: 'startTime' in record.metadata ? record.metadata.startTime : '00:00',
                endTime: 'endTime' in record.metadata ? record.metadata.endTime : '00:00'
              };
            }
            const instanceRecord: TimeRecord = {
              ...record,
              date: instanceDate,
              metadata: newMetadata,
              _effectiveDurationInPeriod: record.duration
            };
            this.processRecord(instanceRecord, record.duration, breakdownBy, result, uniqueFiles);
          }
        } else {
          const numInstances = Utils.calculateRruleInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            const effectiveDuration = record.duration * numInstances;
            const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
            this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
          }
        }
      } else {
        const effectiveDuration = record.duration;
        let includeRecord = false;
        if ((record.metadata.type === 'recurring' || record.metadata.type === 'rrule') && !hasDateFilter) {
          includeRecord = true;
        } else if (record.metadata.type !== 'recurring' && record.metadata.type !== 'rrule') {
          if (hasDateFilter) {
            if (this.isWithinDateRange(record.date, startDate, endDate)) {
              includeRecord = true;
            }
          } else {
            includeRecord = true;
          }
        }
        if (includeRecord && effectiveDuration > 0) {
          const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
          this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
        }
      }
    }

    result.fileCount = uniqueFiles.size;
    return result;
  }

  /**
   * Helper function to process a single record (real or expanded) and add it to the result set.
   * This avoids logic duplication within getAnalyzedData.
   */
  private processRecord(
    record: TimeRecord,
    duration: number,
    breakdownBy: keyof TimeRecord | null,
    // regex parameter is now removed
    result: AnalysisResult,
    uniqueFiles: Set<string>
  ): void {
    if (breakdownBy) {
      const key = String(record[breakdownBy] || `(No ${breakdownBy})`);
      // The regex check is now removed from here
      result.aggregation.set(key, (result.aggregation.get(key) || 0) + duration);
      if (!result.recordsByCategory.has(key)) result.recordsByCategory.set(key, []);
      result.recordsByCategory.get(key)!.push(record);
    }

    result.records.push(record);
    result.totalHours += duration;
    uniqueFiles.add(record.path);
  }

  private isWithinDateRange(
    recordDate: Date | null,
    startDate: Date | null,
    endDate: Date | null
  ): boolean {
    if (!recordDate || isNaN(recordDate.getTime())) return false;
    const recordTime = new Date(recordDate.valueOf());
    recordTime.setUTCHours(0, 0, 0, 0);
    const recordTimestamp = recordTime.getTime();
    if (startDate) {
      const startTime = new Date(startDate.valueOf());
      startTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp < startTime.getTime()) return false;
    }
    if (endDate) {
      const endTime = new Date(endDate.valueOf());
      endTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp > endTime.getTime()) return false;
    }
    return true;
  }
}
