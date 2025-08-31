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

    // Look for any date patterns from Tasks plugin emojis
    // Priority order: Due date (📅) > Start date (🛫) > Scheduled date (⏰)
    const datePatterns = [
      { emoji: '📅', type: 'due' },      // Due date (primary)
      { emoji: '🛫', type: 'start' },   // Start date
      { emoji: '⏰', type: 'scheduled' } // Scheduled date
    ];

    for (const pattern of datePatterns) {
      const regex = new RegExp(`${pattern.emoji}\\s*(\\d{4}-\\d{2}-\\d{2})(?:\\s+(\\d{1,2}:\\d{2}))?`);
      const dateMatch = cleanContent.match(regex);
      
      if (dateMatch) {
        const [, dateStr, timeStr] = dateMatch;
        
        // Validate the date
        const parsedDate = DateTime.fromISO(dateStr);
        if (!parsedDate.isValid) {
          // Invalid date, continue to next pattern or treat as undated
          continue;
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
    }

    // No valid date found, this is an undated task
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
   * Extracts the task content without any Tasks plugin emojis and metadata
   */
  public getTaskContentWithoutDate(content: string): string {
    // Remove all common Tasks plugin emojis and their associated data
    let cleaned = content;
    
    // Date-related emojis with dates/times
    cleaned = cleaned.replace(/[📅🛫⏰]\s*\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?/g, '');
    
    // Other common Tasks plugin emojis (these typically don't have dates)
    // Priority emoji (🔺, ⏫, 🔼, 🔽, ⏬)
    cleaned = cleaned.replace(/[🔺⏫🔼🔽⏬]/g, '');
    
    // Recurrence rule emoji 🔁 (followed by RRULE text)
    cleaned = cleaned.replace(/🔁[^🌟🏷️📝💬🆔❌✅]*/g, '');
    
    // Other metadata emojis that might have text after them
    cleaned = cleaned.replace(/[🌟🏷️📝💬🆔]/g, '');
    
    // Clean up multiple spaces and trim
    return cleaned.replace(/\s+/g, ' ').trim();
  }
}