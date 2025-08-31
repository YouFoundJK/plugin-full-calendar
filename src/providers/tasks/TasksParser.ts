/**
 * @file TasksParser.ts
 * @brief Parser for Obsidian Tasks plugin format
 * 
 * @description
 * Parses task lines from markdown files, extracting due dates, completion status,
 * and categorizing tasks as dated or undated for the backlog system.
 * 
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { ParsedTaskResult, ParsedDatedTask, ParsedUndatedTask } from './typesTask';

export class TasksParser {
  /**
   * Parses a line from a markdown file to determine if it's a task and extract its properties
   */
  public parseLine(line: string, filePath: string, lineNumber: number): ParsedTaskResult {
    // Check if line is a task (starts with - [ ] or - [x] or variations)
    const taskMatch = line.match(/^(\s*)- \[([ xX\-])\]\s*(.+)$/);
    if (!taskMatch) {
      return { type: 'none' };
    }

    const [, , completionChar, content] = taskMatch;
    const completed = this.parseCompletion(completionChar);
    const cleanContent = content.trim();

    // Look for due date patterns (📅 YYYY-MM-DD or 📅 YYYY-MM-DD HH:MM)
    const dueDateMatch = cleanContent.match(/📅\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
    
    if (dueDateMatch) {
      const [, dateStr, timeStr] = dueDateMatch;
      
      // Validate the date
      const parsedDate = DateTime.fromISO(dateStr);
      if (!parsedDate.isValid) {
        // Invalid date, treat as undated
        return {
          type: 'undated',
          task: {
            content: cleanContent,
            completed,
            filePath,
            lineNumber
          }
        };
      }

      return {
        type: 'dated',
        task: {
          content: cleanContent,
          date: dateStr,
          time: timeStr,
          completed,
          filePath,
          lineNumber
        }
      };
    }

    // No due date found, this is an undated task
    return {
      type: 'undated',
      task: {
        content: cleanContent,
        completed,
        filePath,
        lineNumber
      }
    };
  }

  /**
   * Parses the completion character to determine task status
   */
  private parseCompletion(char: string): boolean | string {
    switch (char) {
      case ' ':
        return false; // Not completed
      case 'x':
      case 'X':
        return true; // Completed
      case '-':
        return 'cancelled'; // Cancelled (Tasks plugin feature)
      default:
        return false; // Default to not completed for unknown chars
    }
  }

  /**
   * Extracts the task content without the due date emoji and date
   */
  public getTaskContentWithoutDate(content: string): string {
    return content.replace(/📅\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?/g, '').trim();
  }
}