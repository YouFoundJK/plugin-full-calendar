// src/chrono_analyser/data/InsightsEngine.ts

import { TimeRecord } from './types';
import { InsightsConfig } from '../ui/ui';
import { FilterPayload } from '../ui/UIService';

const BATCH_SIZE = 500;

export interface InsightPayloadItem {
  project: string;
  details: string;
  action: FilterPayload | null;
  subItems?: InsightPayloadItem[]; // For nested breakdowns
  isDeprioritized?: boolean;
  isSeparator?: boolean;
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

    // Always run on allRecords, not taggedRecords
    const lapsedHabitInsight = this._consolidateLapsedHabits(allRecords);
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
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const processedBatch = batch.map(record => this._tagRecord(record, config));
      taggedRecords = taggedRecords.concat(processedBatch);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return taggedRecords;
  }

  private _tagRecord(record: TimeRecord, config: InsightsConfig): TimeRecord {
    const tags = new Set<string>();
    const deprioritizedTags = new Set<string>();
    const subprojectLower = record.subproject.toLowerCase();

    for (const groupName in config.insightGroups) {
      const group = config.insightGroups[groupName];
      if (!group || !group.rules) continue;
      const rules = group.rules;

      let isDeprioritized = false;
      const exclusionKeywords = rules.subprojectKeywords_exclude || [];
      if (exclusionKeywords.length > 0) {
        if (exclusionKeywords.some(kw => kw && subprojectLower.includes(kw.toLowerCase()))) {
          isDeprioritized = true;
        }
      }

      const isIncluded =
        rules.hierarchies.some(h => h.toLowerCase() === record.hierarchy.toLowerCase()) ||
        rules.projects.some(p => p.toLowerCase() === record.project.toLowerCase()) ||
        rules.subprojectKeywords.some(kw => kw && subprojectLower.includes(kw.toLowerCase()));

      if (isIncluded) {
        tags.add(groupName);
        if (isDeprioritized) {
          deprioritizedTags.add(groupName);
        }
      }
    }
    (record as any)._semanticTags = Array.from(tags);
    (record as any)._deprioritizedTags = Array.from(deprioritizedTags);
    return record;
  }

  // --- INSIGHT CALCULATORS ---

  private _createHierarchyExtremesInsight(allRecords: TimeRecord[]): Insight | null {
    // Set all boundaries to midnight (local time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const thirtySevenDaysAgo = new Date(sevenDaysAgo);
    thirtySevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);

    const weeklyDistribution = new Map<string, number>();
    const monthlyDistribution = new Map<string, number>();
    let weeklyTotalHours = 0;
    let monthlyTotalHours = 0;

    // For nested breakdowns
    const projectDistribution = new Map<string, Map<string, number>>();

    for (const record of allRecords) {
      if (!record.date) continue;
      const recordDay = new Date(record.date);
      recordDay.setHours(0, 0, 0, 0);

      if (recordDay >= sevenDaysAgo && recordDay <= today) {
        weeklyTotalHours += record.duration;
        weeklyDistribution.set(
          record.hierarchy,
          (weeklyDistribution.get(record.hierarchy) || 0) + record.duration
        );

        if (!projectDistribution.has(record.hierarchy)) {
          projectDistribution.set(record.hierarchy, new Map());
        }
        const projectsInHierarchy = projectDistribution.get(record.hierarchy)!;
        projectsInHierarchy.set(
          record.project,
          (projectsInHierarchy.get(record.project) || 0) + record.duration
        );
      } else if (recordDay >= thirtySevenDaysAgo && recordDay < sevenDaysAgo) {
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

  private createProjectSubItemsForGroup(
    projects: Map<string, number> | undefined,
    startDate: Date,
    isDeprioritized: boolean = false
  ): InsightPayloadItem[] {
    if (!projects) return [];
    return Array.from(projects.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([projectName, projectHours]) => ({
        project: `• ${projectName}`,
        details: `${projectHours.toFixed(1)} hours`,
        action: {
          analysisTypeSelect: 'time-series',
          projectFilterInput: projectName,
          dateRangePicker: [startDate, new Date()]
        },
        isDeprioritized: isDeprioritized,
        isSeparator: false
      }));
  }

  private _calculateGroupDistribution(taggedRecords: TimeRecord[]): Insight | null {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const distribution = new Map<string, number>();
    const projectsByGroup = new Map<string, Map<string, number>>();
    const deprioritizedProjectsByGroup = new Map<string, Map<string, number>>();

    for (const record of taggedRecords) {
      const recordDate = record.date;
      if (!recordDate) continue;
      const recordDay = new Date(recordDate);
      recordDay.setHours(0, 0, 0, 0);
      if (recordDay < thirtyDaysAgo) continue;

      const tags = (record as any)._semanticTags || [];
      const deprioritizedTags = new Set((record as any)._deprioritizedTags || []);

      for (const tag of tags) {
        const projectsMap = deprioritizedTags.has(tag)
          ? deprioritizedProjectsByGroup
          : projectsByGroup;
        // Only count hours for non-deprioritized in the main distribution
        if (!projectsMap.has(tag)) projectsMap.set(tag, new Map());
        const projects = projectsMap.get(tag)!;
        projects.set(record.project, (projects.get(record.project) || 0) + record.duration);

        if (!deprioritizedTags.has(tag)) {
          distribution.set(tag, (distribution.get(tag) || 0) + record.duration);
        }
      }
    }

    const primaryTotalHours = Array.from(distribution.values()).reduce((sum, h) => sum + h, 0);
    if (primaryTotalHours === 0) return null;

    const sortedGroups = Array.from(distribution.entries())
      .map(([groupName, hours]) => ({ groupName, hours }))
      .sort((a, b) => b.hours - a.hours);

    const topGroups = sortedGroups.slice(0, 3);
    if (topGroups.length === 0) return null;

    const topGroupNames = topGroups.map(g => `**'${g.groupName}'**`);
    const topGroupsText =
      topGroups.length === 1
        ? topGroupNames[0]
        : topGroups.length === 2
          ? topGroupNames.join(' and ')
          : `${topGroupNames.slice(0, -1).join(', ')}, and ${topGroupNames.slice(-1)}`;

    const topGroupsTotalHours = topGroups.reduce((sum, g) => sum + g.hours, 0);
    const topGroupsPercentage =
      primaryTotalHours > 0 ? (topGroupsTotalHours / primaryTotalHours) * 100 : 0;

    const displayText = this._formatText(
      `Your top activities were ${topGroupsText}, making up **'${topGroupsPercentage.toFixed(0)}%'** of your primary logged time.`
    );

    const payload: InsightPayloadItem[] = topGroups.map(group => {
      const percentage = primaryTotalHours > 0 ? (group.hours / primaryTotalHours) * 100 : 0;
      const subItems = this.createProjectSubItemsForGroup(
        projectsByGroup.get(group.groupName),
        thirtyDaysAgo,
        false
      );
      const deprioSubItems = this.createProjectSubItemsForGroup(
        deprioritizedProjectsByGroup.get(group.groupName),
        thirtyDaysAgo,
        true
      );

      if (subItems.length > 0 && deprioSubItems.length > 0) {
        subItems.push({
          project: 'Deprioritized Items',
          details: '',
          action: null,
          isSeparator: true
        });
      }
      subItems.push(...deprioSubItems);

      return {
        project: group.groupName,
        details: `${group.hours.toFixed(1)} hours (${percentage.toFixed(0)}% of primary)`,
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: group.groupName,
          dateRangePicker: [thirtyDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: subItems,
        isDeprioritized: false
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

  private _consolidateLapsedHabits(allRecords: TimeRecord[]): Insight | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const thirtySevenDaysAgo = new Date(sevenDaysAgo);
    thirtySevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);

    const recentProjects = new Set<string>();
    const baselineProjects = new Map<string, number>();
    for (const record of allRecords) {
      const recordDate = record.date;
      if (!recordDate) continue;
      const recordDay = new Date(recordDate);
      recordDay.setHours(0, 0, 0, 0);

      if (recordDay >= sevenDaysAgo) {
        recentProjects.add(record.project);
      } else if (recordDay >= thirtySevenDaysAgo) {
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
