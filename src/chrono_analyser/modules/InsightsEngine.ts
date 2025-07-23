// src/chrono_analyser/modules/InsightsEngine.ts

import { TimeRecord } from './types';
import { InsightsConfig } from './ui';

const BATCH_SIZE = 500; // Process 500 records at a time before yielding

// The structure for a generated insight
export interface Insight {
  displayText: string;
  action: {
    chartType: 'pie' | 'time-series';
    filters: { [key: string]: any };
  } | null;
}

export class InsightsEngine {
  constructor() {}

  /**
   * The main entry point for generating insights.
   * Processes all records asynchronously in chunks to avoid blocking the UI.
   * @param allRecords - The complete list of TimeRecords from the DataManager.
   * @param config - The user's defined Insight Group configuration.
   * @returns A promise that resolves to an array of Insight objects.
   */
  public async generateInsights(
    allRecords: TimeRecord[],
    config: InsightsConfig
  ): Promise<Insight[]> {
    console.log('[Chrono] Starting insight generation...');
    const taggedRecords = await this._tagRecordsInBatches(allRecords, config);
    console.log(`[Chrono] Tagging complete. ${taggedRecords.length} records tagged.`);

    const insights: Insight[] = [];

    // --- Run Calculators ---
    insights.push(...this._calculateGroupDistribution(taggedRecords));
    insights.push(...this._calculateLapsedHabits(taggedRecords, config));

    console.log(`[Chrono] Insight generation complete. Found ${insights.length} insights.`);
    return insights;
  }

  /**
   * Processes records in non-blocking chunks, applying semantic tags based on user rules.
   */
  private async _tagRecordsInBatches(
    records: TimeRecord[],
    config: InsightsConfig
  ): Promise<TimeRecord[]> {
    let taggedRecords: TimeRecord[] = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const processedBatch = batch.map(record => this._tagRecord(record, config));
      taggedRecords = taggedRecords.concat(processedBatch);
      // Yield to the main thread to keep the UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return taggedRecords;
  }

  /**
   * Applies rules from the config to a single record to determine its semantic tags.
   */
  private _tagRecord(record: TimeRecord, config: InsightsConfig): TimeRecord {
    const tags = new Set<string>();
    const subprojectLower = record.subproject.toLowerCase();

    for (const groupName in config.insightGroups) {
      const group = config.insightGroups[groupName];
      const rules = group.rules;

      if (rules.hierarchies.some(h => h.toLowerCase() === record.hierarchy.toLowerCase())) {
        tags.add(groupName);
        continue;
      }
      if (rules.projects.some(p => p.toLowerCase() === record.project.toLowerCase())) {
        tags.add(groupName);
        continue;
      }
      if (rules.subprojectKeywords.some(kw => subprojectLower.includes(kw.toLowerCase()))) {
        tags.add(groupName);
      }
    }
    // We are adding a temporary property to the in-memory object for this run only
    (record as any)._semanticTags = Array.from(tags);
    return record;
  }

  // --- INSIGHT CALCULATORS ---

  /**
   * Calculates the total time spent in each Insight Group over the last 30 days.
   */
  private _calculateGroupDistribution(taggedRecords: TimeRecord[]): Insight[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const distribution = new Map<string, number>();

    for (const record of taggedRecords) {
      const recordDate = record.date || new Date(); // Assume recurring events are current
      if (recordDate < thirtyDaysAgo) continue;

      const tags = (record as any)._semanticTags || [];
      for (const tag of tags) {
        distribution.set(tag, (distribution.get(tag) || 0) + record.duration);
      }
    }

    if (distribution.size === 0) return [];

    const insights: Insight[] = [];
    for (const [groupName, hours] of distribution.entries()) {
      if (hours > 0) {
        insights.push({
          displayText: `You spent **${hours.toFixed(1)} hours** on activities in your **'${groupName}'** group in the last 30 days.`,
          action: null // Action hook for future implementation
        });
      }
    }
    return insights;
  }

  /**
   * A simple calculator to find projects that were done regularly but have been missed recently.
   * Here we'll define "lapsed" as not done in the last 7 days but done at least twice in the 30 days prior.
   */
  private _calculateLapsedHabits(taggedRecords: TimeRecord[], config: InsightsConfig): Insight[] {
    // For this simple example, we'll assume any group could contain habits.
    // A more advanced version could use a specific "habit" group type.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtySevenDaysAgo = new Date();
    thirtySevenDaysAgo.setDate(thirtySevenDaysAgo.getDate() - 37);

    const recentProjects = new Set<string>();
    const baselineProjects = new Map<string, number>();

    for (const record of taggedRecords) {
      const recordDate = record.date;
      if (!recordDate) continue;

      if (recordDate >= sevenDaysAgo) {
        recentProjects.add(record.project);
      } else if (recordDate >= thirtySevenDaysAgo) {
        baselineProjects.set(record.project, (baselineProjects.get(record.project) || 0) + 1);
      }
    }

    const lapsedInsights: Insight[] = [];
    for (const [project, count] of baselineProjects.entries()) {
      if (count >= 2 && !recentProjects.has(project)) {
        lapsedInsights.push({
          displayText: `It's been over a week since you've logged time for **'${project}'**. You logged it ${count} times in the month prior.`,
          action: null
        });
      }
    }
    return lapsedInsights;
  }
}
