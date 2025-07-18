/**
 * @file Responsible for aggregating filtered lists of TimeRecords into data structures suitable for plotting.
 * This module transforms raw data lists into hierarchical or categorical summaries.
 */

import { TimeRecord, SunburstData, PieData } from './types';

/**
 * Aggregates a list of TimeRecords into a hierarchical structure for a Sunburst chart.
 *
 * @param filteredRecords - The array of records to aggregate, which have already been filtered by date and other criteria.
 * @param level - The aggregation level, either 'project' (Hierarchy -> Project) or 'subproject' (Project -> Subproject).
 * @returns A SunburstData object ready for plotting.
 */
export function aggregateForSunburst(filteredRecords: TimeRecord[], level: string): SunburstData {
  const data: SunburstData = {
    ids: [],
    labels: [],
    parents: [],
    values: [],
    recordsByLabel: new Map()
  };

  let innerField: keyof TimeRecord;
  let outerField: keyof TimeRecord;

  if (level === 'project') {
    innerField = 'hierarchy';
    outerField = 'project';
  } else {
    innerField = 'project';
    outerField = 'subproject';
  }

  const uniqueEntries = new Map<
    string,
    { duration: number; records: TimeRecord[]; inner: string; outer: string }
  >();

  for (const record of filteredRecords) {
    const duration = record._effectiveDurationInPeriod;
    if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) continue;

    const innerVal = String(record[innerField] || `(No ${innerField})`).trim();
    const outerVal = String(record[outerField] || `(No ${outerField})`).trim();
    const leafId = `${innerVal} - ${outerVal}`;

    if (!uniqueEntries.has(leafId)) {
      uniqueEntries.set(leafId, { duration: 0, records: [], inner: innerVal, outer: outerVal });
    }
    const entry = uniqueEntries.get(leafId)!;
    entry.duration += duration;
    entry.records.push(record);
  }

  const parentTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const { duration, inner } of uniqueEntries.values()) {
    parentTotals.set(inner, (parentTotals.get(inner) || 0) + duration);
  }
  for (const total of parentTotals.values()) {
    grandTotal += total;
  }

  const rootId = 'Total';
  data.ids.push(rootId);
  data.labels.push(rootId);
  data.parents.push('');
  data.values.push(grandTotal);
  data.recordsByLabel.set(rootId, filteredRecords);

  for (const [parent, total] of parentTotals.entries()) {
    data.ids.push(parent);
    data.labels.push(parent);
    data.parents.push(rootId);
    data.values.push(total);
    const parentRecords = filteredRecords.filter(
      r => String(r[innerField] || `(No ${innerField})`).trim() === parent
    );
    data.recordsByLabel.set(parent, parentRecords);
  }

  for (const [leafId, { duration, records, inner, outer }] of uniqueEntries.entries()) {
    data.ids.push(leafId);
    data.labels.push(outer);
    data.parents.push(inner);
    data.values.push(duration);
    data.recordsByLabel.set(leafId, records);
  }

  return data;
}

/**
 * Aggregates a list of TimeRecords into a flat categorical structure for a Pie chart.
 *
 * @param filteredRecords - The array of records to aggregate.
 * @param level - The property of TimeRecord to use for categorization (e.g., 'hierarchy', 'project').
 * @param pattern - An optional regex string to filter the categories.
 * @param showStatus - A callback function to display status messages (e.g., for regex errors).
 * @returns A PieData object containing aggregated hours and categorized records.
 */
export function aggregateForPieChart(
  filteredRecords: TimeRecord[],
  level: keyof TimeRecord,
  pattern: string | null,
  showStatus: (message: string, type: 'error' | 'info') => void
): PieData {
  const hours = new Map<string, number>();
  const recordsByCategory = new Map<string, TimeRecord[]>();
  let regex: RegExp | null = null;
  let aggregationError = false;

  if (pattern?.trim()) {
    try {
      regex = new RegExp(pattern.trim(), 'i');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      showStatus(`Invalid Pie Regex: ${errorMessage}`, 'error');
      aggregationError = true;
      return { hours, recordsByCategory, error: aggregationError };
    }
  }

  for (const record of filteredRecords) {
    const key = record[level] != null ? String(record[level]) : `(No ${level} defined)`;
    if (regex && !regex.test(key)) continue;
    if ((record._effectiveDurationInPeriod || 0) <= 0) continue;

    hours.set(key, (hours.get(key) || 0) + (record._effectiveDurationInPeriod as number));
    if (!recordsByCategory.has(key)) {
      recordsByCategory.set(key, []);
    }
    recordsByCategory.get(key)!.push(record);
  }
  return { hours, recordsByCategory, error: aggregationError };
}
