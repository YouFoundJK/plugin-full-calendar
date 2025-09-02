/**
 * @file TasksParser.ts
 * @brief Core parsing logic for Obsidian Tasks format.
 *
 * @description
 * This module provides parsing functionality for tasks in Obsidian's markdown
 * format, specifically those managed by the Obsidian Tasks plugin. It can
 * identify and extract task information including title, due dates, and
 * completion status.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { parseChecklistItems } from './utils/markdown';
import { splitBySymbol, extractDate, cleanTaskTitle } from './utils/splitter';
import { getTaskDateEmojis, TASK_EMOJIS } from './TasksSettings';

export interface ParsedTask {
  title: string;
  startDate?: DateTime; // Start date (🛫) or scheduled date (⏳)
  endDate?: DateTime; // Due date (📅)
  date: DateTime; // Legacy compatibility - the primary date for display
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export interface ParsedDatedTask {
  title: string;
  startDate?: DateTime; // Start date (🛫) or scheduled date (⏳)
  endDate?: DateTime; // Due date (📅)
  date: DateTime; // Legacy compatibility - the primary date for display
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export interface ParsedUndatedTask {
  title: string;
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export type ParsedTaskResult =
  | { type: 'dated'; task: ParsedDatedTask }
  | { type: 'undated'; task: ParsedUndatedTask }
  | { type: 'none' };

export class TasksParser {
  /**
   * Parses a single line of text for task information.
   * @param line The line of text to parse
   * @param filePath The path to the file containing this line
   * @param lineNumber The line number (1-based)
   * @returns A ParsedTaskResult discriminated union indicating the type of task found
   */
  parseLine(line: string, filePath: string, lineNumber: number): ParsedTaskResult {
    // Check if the line is a checklist item
    if (!/^\s*-\s*\[[\sx]\]\s*/.test(line)) {
      return { type: 'none' };
    }

    // Extract checklist content without checkbox syntax
    const contentMatch = line.match(/^\s*-\s*\[[\sx]\]\s*(.*)$/);
    if (!contentMatch) {
      return { type: 'none' };
    }

    const content = contentMatch[1];
    const isCompleted = /^\s*-\s*\[x\]\s*/i.test(line);

    // Look for completion status emojis first
    const isDoneFromEmoji = content.includes(TASK_EMOJIS.DONE) || content.includes(TASK_EMOJIS.CANCELLED);
    const finalIsDone = isCompleted || isDoneFromEmoji;

    // Parse all date emojis found in the content
    const dateEmojis = getTaskDateEmojis();
    const foundDates: { type: 'start' | 'scheduled' | 'due'; date: DateTime }[] = [];
    let workingContent = content;

    for (const [emoji, dateType] of dateEmojis) {
      const { before, after, found } = splitBySymbol(workingContent, emoji);
      if (found) {
        const dateString = extractDate(after);
        if (dateString) {
          const parsedDate = this.parseDate(dateString);
          if (parsedDate && parsedDate.isValid) {
            foundDates.push({ type: dateType, date: parsedDate });
            // Update working content to remove this emoji and date for next iteration
            workingContent = before + ' ' + after.replace(dateString, '').trim();
          }
        }
      }
    }

    // Clean the title by surgically removing date emojis and their associated dates
    // Only clean if we actually found valid dates
    let cleanedTitle = content;
    
    if (foundDates.length > 0) {
      // Remove each date emoji and its associated date
      for (const [emoji] of dateEmojis) {
        let currentContent = cleanedTitle;
        const { before, after, found } = splitBySymbol(currentContent, emoji);
        if (found) {
          const dateString = extractDate(after);
          if (dateString) {
            // Check if this date was actually parsed successfully
            const parsedDate = this.parseDate(dateString);
            if (parsedDate && parsedDate.isValid) {
              // Remove the emoji and the date, preserving the rest
              const afterDateRemoved = after.replace(dateString, '').trim();
              cleanedTitle = (before + ' ' + afterDateRemoved).replace(/\s+/g, ' ').trim();
            }
          }
        }
      }
    }
    
    // Always clean completion emojis
    cleanedTitle = cleanedTitle.replace(TASK_EMOJIS.DONE, '').replace(TASK_EMOJIS.CANCELLED, '');
    cleanedTitle = cleanedTitle.replace(/\s+/g, ' ').trim();
    
    if (!cleanedTitle) {
      return { type: 'none' }; // Empty title
    }

    // If no dates found, this is an undated task
    if (foundDates.length === 0) {
      // For undated tasks, we should still clean up any date emoji that had invalid dates
      // This matches the original behavior where tasks with invalid dates get cleaned
      let undatedTitle = content;
      
      // Remove date emojis and any invalid date strings that follow them
      for (const [emoji] of dateEmojis) {
        const { before, after, found } = splitBySymbol(undatedTitle, emoji);
        if (found) {
          const dateString = extractDate(after);
          if (dateString) {
            // Remove the emoji and the invalid date string
            const afterDateRemoved = after.replace(dateString, '').trim();
            undatedTitle = (before + ' ' + afterDateRemoved).replace(/\s+/g, ' ').trim();
          } else {
            // Remove the emoji and the first word after it (likely the invalid date)
            // but preserve any other content that might be tags, etc.
            const afterParts = after.trim().split(/\s+/);
            if (afterParts.length > 0 && afterParts[0]) {
              // Remove the first word (likely invalid date) but keep the rest
              const remainingAfter = afterParts.slice(1).join(' ');
              undatedTitle = (before + ' ' + remainingAfter).replace(/\s+/g, ' ').trim();
            } else {
              undatedTitle = before.trim();
            }
          }
        }
      }
      
      // Remove completion emojis
      undatedTitle = undatedTitle.replace(TASK_EMOJIS.DONE, '').replace(TASK_EMOJIS.CANCELLED, '');
      undatedTitle = undatedTitle.replace(/\s+/g, ' ').trim();
      
      if (!undatedTitle) {
        return { type: 'none' }; // Empty title
      }
      
      return {
        type: 'undated',
        task: {
          title: undatedTitle,
          isDone: finalIsDone,
          location: {
            path: filePath,
            lineNumber
          }
        }
      };
    }

    // Determine start and end dates based on found dates
    let startDate: DateTime | undefined;
    let endDate: DateTime | undefined;
    let primaryDate: DateTime;

    // Find start date (🛫 or ⏳ in that order of preference)
    const startDateEntry = foundDates.find(d => d.type === 'start') || 
                           foundDates.find(d => d.type === 'scheduled');
    if (startDateEntry) {
      startDate = startDateEntry.date;
    }

    // Find due date (📅)
    const dueDateEntry = foundDates.find(d => d.type === 'due');
    if (dueDateEntry) {
      endDate = dueDateEntry.date;
    }

    // Determine primary date for legacy compatibility
    if (startDate && endDate) {
      // Multi-day event: primary date is start date
      primaryDate = startDate;
    } else if (startDate) {
      // Only start date: single-day event
      primaryDate = startDate;
    } else if (endDate) {
      // Only due date: single-day event
      primaryDate = endDate;
    } else {
      // Should not happen given foundDates.length > 0, but fallback to first found
      primaryDate = foundDates[0].date;
    }

    return {
      type: 'dated',
      task: {
        title: cleanedTitle,
        startDate,
        endDate,
        date: primaryDate, // Legacy compatibility
        isDone: finalIsDone,
        location: {
          path: filePath,
          lineNumber
        }
      }
    };
  }

  /**
   * Parses all tasks from a file's content.
   * @param content The complete file content
   * @param filePath The path to the file
   * @returns Array of ParsedTask objects (for backward compatibility, only dated tasks)
   */
  parseFileContent(content: string, filePath: string): ParsedTask[] {
    const checklistItems = parseChecklistItems(content);
    const tasks: ParsedTask[] = [];

    for (const item of checklistItems) {
      const result = this.parseLine(item.line, filePath, item.lineNumber);
      if (result.type === 'dated') {
        // Convert ParsedDatedTask to ParsedTask for backward compatibility
        tasks.push({
          title: result.task.title,
          date: result.task.date,
          isDone: result.task.isDone,
          location: result.task.location
        });
      }
    }

    return tasks;
  }

  /**
   * Parses a date string into a DateTime object.
   * Supports various common date formats.
   * @param dateString The date string to parse
   * @returns A DateTime object or null if parsing fails
   */
  private parseDate(dateString: string): DateTime | null {
    // Try different date formats
    const formats = [
      'yyyy-MM-dd', // 2024-01-15
      'yyyy/MM/dd', // 2024/01/15
      'dd-MM-yyyy', // 15-01-2024
      'dd/MM/yyyy', // 15/01/2024
      'dd.MM.yyyy', // 15.01.2024
      'MM-dd-yyyy', // 01-15-2024
      'MM/dd/yyyy' // 01/15/2024
    ];

    for (const format of formats) {
      const date = DateTime.fromFormat(dateString, format);
      if (date.isValid) {
        return date;
      }
    }

    // Also try ISO parsing as fallback
    const isoDate = DateTime.fromISO(dateString);
    if (isoDate.isValid) {
      return isoDate;
    }

    return null;
  }
}
