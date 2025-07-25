// src/chrono_analyser/modules/InsightsEngine.ts

import { TimeRecord } from '../data/types';
import { InsightsConfig } from '../ui/ui';
import { FilterPayload } from '../ui/UIService';

const BATCH_SIZE = 500;

export interface InsightPayloadItem {
  project: string;
  details: string;
  action: FilterPayload | null;
  subItems?: InsightPayloadItem[]; // NEW: For nested breakdowns
}

export interface Insight {
  displayText: string;
  category: string;
  sentiment: 'neutral' | 'positive' | 'warning';
  payload?: InsightPayloadItem[];
  action: FilterPayload | null;
}

export class InsightsEngine {
  constructor() {}

  public async generateInsights(
    allRecords: TimeRecord[],
    config: InsightsConfig
  ): Promise<Insight[]> {
    const taggedRecords = await this._tagRecordsInBatches(allRecords, config);
    const insights: Insight[] = [];

    // --- Run Calculators ---

    const hierarchyExtremesInsight = this._createHierarchyExtremesInsight(allRecords);
    if (hierarchyExtremesInsight) {
      insights.push(hierarchyExtremesInsight);
    }

    const groupDistributionInsight = this._calculateGroupDistribution(taggedRecords);
    if (groupDistributionInsight) {
      insights.push(groupDistributionInsight);
    }

    const lapsedHabitInsight = this._consolidateLapsedHabits(taggedRecords);
    if (lapsedHabitInsight) {
      insights.push(lapsedHabitInsight);
    }

    return insights;
  }

  private _formatText(text: string): string {
    return text.replace(/\*\*'(.+?)'\*\*/g, '<strong>$1</strong>');
  }

  private async _tagRecordsInBatches(
    records: TimeRecord[],
    config: InsightsConfig
  ): Promise<TimeRecord[]> {
    let taggedRecords: TimeRecord[] = [];
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const processedBatch = batch.map(record => this._tagRecord(record, config));
      taggedRecords = taggedRecords.concat(processedBatch);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return taggedRecords;
  }

  private _tagRecord(record: TimeRecord, config: InsightsConfig): TimeRecord {
    const tags = new Set<string>();
    const subprojectLower = record.subproject.toLowerCase();
    for (const groupName in config.insightGroups) {
      const group = config.insightGroups[groupName];
      if (!group || !group.rules) {
        continue;
      }
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
    (record as any)._semanticTags = Array.from(tags);
    return record;
  }

  // --- INSIGHT CALCULATORS ---

  /**
   * REWRITTEN & CORRECTED: Creates the Weekly Snapshot insight.
   * Re-instates the monthly comparison data.
   */
  private _createHierarchyExtremesInsight(allRecords: TimeRecord[]): Insight | null {
    // Define date ranges
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const thirtySevenDaysAgo = new Date();
    thirtySevenDaysAgo.setDate(today.getDate() - 37);

    const weeklyDistribution = new Map<string, number>();
    const monthlyDistribution = new Map<string, number>();
    let weeklyTotalHours = 0;
    let monthlyTotalHours = 0;

    // For nested breakdowns
    const projectDistribution = new Map<string, Map<string, number>>();

    for (const record of allRecords) {
      if (!record.date) continue;
      if (record.date >= sevenDaysAgo && record.date <= today) {
        weeklyTotalHours += record.duration;
        weeklyDistribution.set(
          record.hierarchy,
          (weeklyDistribution.get(record.hierarchy) || 0) + record.duration
        );

        // Nested: hierarchy -> project -> hours
        if (!projectDistribution.has(record.hierarchy)) {
          projectDistribution.set(record.hierarchy, new Map());
        }
        const projectsInHierarchy = projectDistribution.get(record.hierarchy)!;
        projectsInHierarchy.set(
          record.project,
          (projectsInHierarchy.get(record.project) || 0) + record.duration
        );
      } else if (record.date >= thirtySevenDaysAgo && record.date < sevenDaysAgo) {
        monthlyTotalHours += record.duration;
        monthlyDistribution.set(
          record.hierarchy,
          (monthlyDistribution.get(record.hierarchy) || 0) + record.duration
        );
      }
    }

    if (weeklyDistribution.size < 2 || weeklyTotalHours === 0) return null;

    const sortedHierarchies = Array.from(weeklyDistribution.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => a.hours - b.hours);
    const least = sortedHierarchies[0];
    const most = sortedHierarchies[sortedHierarchies.length - 1];

    if (least.name === most.name || most.hours === 0) return null;

    const mostPercentage = (most.hours / weeklyTotalHours) * 100;
    const leastPercentage = (least.hours / weeklyTotalHours) * 100;

    let displayText = this._formatText(
      `Last week, your main focus was **'${most.name}'** for **'${mostPercentage.toFixed(0)}%'**, while **'${least.name}'** for **'${leastPercentage.toFixed(0)}%'** took a backseat.`
    );

    // FIX: Add the comparison if data from the previous month exists for these hierarchies.
    if (monthlyTotalHours > 0) {
      const mostHoursLastMonth = monthlyDistribution.get(most.name) || 0;
      const leastHoursLastMonth = monthlyDistribution.get(least.name) || 0;
      if (mostHoursLastMonth > 0 || leastHoursLastMonth > 0) {
        const mostPercentageLastMonth = (mostHoursLastMonth / monthlyTotalHours) * 100;
        const leastPercentageLastMonth = (leastHoursLastMonth / monthlyTotalHours) * 100;
        const comparisonText = this._formatText(
          ` This compares to last month's **'${mostPercentageLastMonth.toFixed(0)}%'** on **'${most.name}'** and **'${leastPercentageLastMonth.toFixed(0)}%'** on **'${least.name}'**.`
        );
        displayText += comparisonText;
      }
    }

    const createProjectSubItems = (hierarchyName: string): InsightPayloadItem[] => {
      const projects = projectDistribution.get(hierarchyName);
      if (!projects) return [];
      return Array.from(projects.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([projectName, projectHours]) => ({
          project: `• ${projectName}`,
          details: `${projectHours.toFixed(1)} hours`,
          action: {
            analysisTypeSelect: 'time-series',
            projectFilterInput: projectName,
            dateRangePicker: [sevenDaysAgo, new Date()]
          }
        }));
    };

    const payload: InsightPayloadItem[] = [
      {
        project: most.name,
        details: `**${mostPercentage.toFixed(0)}%** (${most.hours.toFixed(1)} hours last week)`,
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: most.name,
          dateRangePicker: [sevenDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: createProjectSubItems(most.name)
      },
      {
        project: least.name,
        details: `**${leastPercentage.toFixed(0)}%** (${least.hours.toFixed(1)} hours last week)`,
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: least.name,
          dateRangePicker: [sevenDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: createProjectSubItems(least.name)
      }
    ];

    return {
      displayText,
      category: 'WEEKLY SNAPSHOT',
      sentiment: 'neutral',
      payload: payload,
      action: null
    };
  }

  private _calculateGroupDistribution(taggedRecords: TimeRecord[]): Insight | null {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const distribution = new Map<string, number>();
    let trueGrandTotalHours = 0;

    for (const record of taggedRecords) {
      const recordDate = record.date || new Date();
      if (recordDate < thirtyDaysAgo) continue;
      trueGrandTotalHours += record.duration;
      const tags = (record as any)._semanticTags || [];
      for (const tag of tags) {
        distribution.set(tag, (distribution.get(tag) || 0) + record.duration);
      }
    }

    if (trueGrandTotalHours === 0) return null;

    const sortedGroups = Array.from(distribution.entries())
      .map(([groupName, hours]) => ({ groupName, hours }))
      .sort((a, b) => b.hours - a.hours);

    const topGroups = sortedGroups.slice(0, 3);
    if (topGroups.length === 0) return null;

    const topGroupNames = topGroups.map(g => `**'${g.groupName}'**`);
    let topGroupsText: string;
    if (topGroupNames.length === 1) {
      topGroupsText = topGroupNames[0];
    } else if (topGroupNames.length === 2) {
      topGroupsText = topGroupNames.join(' and ');
    } else {
      topGroupsText = `${topGroupNames.slice(0, -1).join(', ')}, and ${topGroupNames.slice(-1)}`;
    }

    const topGroupsTotalHours = topGroups.reduce((sum, g) => sum + g.hours, 0);
    const topGroupsPercentage = (topGroupsTotalHours / trueGrandTotalHours) * 100;

    const displayText = this._formatText(
      `Your top ${topGroups.length === 1 ? 'activity was' : 'activities were'} ${topGroupsText}, accounting for **'${topGroupsPercentage.toFixed(0)}%'** of your total logged time.`
    );

    const payload: InsightPayloadItem[] = topGroups.map(group => {
      const percentage = (group.hours / trueGrandTotalHours) * 100;
      return {
        project: group.groupName,
        details: `${group.hours.toFixed(1)} hours (${percentage.toFixed(0)}% of total)`,
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: group.groupName,
          dateRangePicker: [thirtyDaysAgo, new Date()],
          levelSelect_pie: 'project'
        }
      };
    });

    return {
      displayText,
      category: 'Activity Overview',
      sentiment: 'neutral',
      payload: payload,
      action: null
    };
  }

  private _consolidateLapsedHabits(taggedRecords: TimeRecord[]): Insight | null {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtySevenDaysAgo = new Date();
    thirtySevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);
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
    const lapsedHabitsPayload: InsightPayloadItem[] = [];
    for (const [project, count] of baselineProjects.entries()) {
      if (count >= 2 && !recentProjects.has(project)) {
        lapsedHabitsPayload.push({
          project,
          details: `(logged ${count} times in the month prior)`,
          action: {
            analysisTypeSelect: 'time-series',
            projectFilterInput: project,
            dateRangePicker: [thirtySevenDaysAgo, new Date()]
          }
        });
      }
    }
    if (lapsedHabitsPayload.length === 0) return null;
    lapsedHabitsPayload.sort((a, b) => {
      const countA = parseInt(a.details.match(/\d+/)?.[0] || '0');
      const countB = parseInt(b.details.match(/\d+/)?.[0] || '0');
      return countB - countA;
    });

    return {
      displayText: this._formatText(
        `You have **'${lapsedHabitsPayload.length} activities'** that you haven't logged in over a week, but were previously consistent.`
      ),
      category: 'Habit Consistency',
      sentiment: 'warning',
      payload: lapsedHabitsPayload,
      action: null
    };
  }
}
