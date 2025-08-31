/**
 * @file TasksParser.ts
 * @brief Parser for Obsidian Tasks plugin task format
 * 
 * @description
 * This parser handles the specific format used by the Obsidian Tasks plugin:
 * - [ ] Task title 📅 2025-01-15
 * - [x] Completed task ✅ 2025-01-14
 * 
 * It identifies tasks with due dates (for calendar) and those without (for backlog).
 * 
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TaskParseResult, ParsedDatedTask, ParsedUndatedTask } from './typesTasks';

// Common regex patterns for Tasks plugin format
const TASK_REGEX = /^(\s*)-\s+\[([ x])\]\s+(.+)$/;
const DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const SCHEDULED_DATE_REGEX = /⏰\s*(\d{4}-\d{2}-\d{2})/;
const START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const COMPLETION_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;

export class TasksParser {
  /**
   * Parse a single line to determine if it's a task and extract task information
   * @param line The text line to parse
   * @param filePath The file path for location tracking
   * @param lineNumber The line number for location tracking
   * @returns TaskParseResult indicating the type of task or none
   */
  parseLine(line: string, filePath: string, lineNumber: number): TaskParseResult {
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) {
      return { type: 'none' };
    }

    const [, , checkbox, taskContent] = taskMatch;
    const completed = checkbox === 'x' ? this.extractCompletionDate(taskContent) || true : false;
    
    // Extract title by removing all date emojis and dates
    const title = this.extractCleanTitle(taskContent);
    
    // Check for due date first (this makes it a dated task)
    const dueDate = this.extractDate(taskContent, DUE_DATE_REGEX);
    if (dueDate) {
      const parsedTask: ParsedDatedTask = {
        title,
        completed,
        dueDate,
        startDate: this.extractDate(taskContent, START_DATE_REGEX),
        scheduledDate: this.extractDate(taskContent, SCHEDULED_DATE_REGEX),
        filePath,
        lineNumber,
        originalLine: line
      };
      return { type: 'dated', task: parsedTask };
    }

    // Check for scheduled or start date (also makes it a dated task)
    const scheduledDate = this.extractDate(taskContent, SCHEDULED_DATE_REGEX);
    const startDate = this.extractDate(taskContent, START_DATE_REGEX);
    
    if (scheduledDate || startDate) {
      const parsedTask: ParsedDatedTask = {
        title,
        completed,
        dueDate: scheduledDate || startDate || '', // Use scheduled or start as due date
        startDate,
        scheduledDate,
        filePath,
        lineNumber,
        originalLine: line
      };
      return { type: 'dated', task: parsedTask };
    }

    // No dates found - this is an undated task for the backlog
    const parsedTask: ParsedUndatedTask = {
      title,
      completed,
      filePath,
      lineNumber,
      originalLine: line
    };
    return { type: 'undated', task: parsedTask };
  }

  /**
   * Extract a date from task content using the given regex
   */
  private extractDate(content: string, regex: RegExp): string | undefined {
    const match = content.match(regex);
    return match ? match[1] : undefined;
  }

  /**
   * Extract completion date from task content
   */
  private extractCompletionDate(content: string): string | undefined {
    return this.extractDate(content, COMPLETION_DATE_REGEX);
  }

  /**
   * Extract clean title by removing all task-related emojis and dates
   */
  private extractCleanTitle(content: string): string {
    return content
      .replace(DUE_DATE_REGEX, '')
      .replace(SCHEDULED_DATE_REGEX, '')
      .replace(START_DATE_REGEX, '')
      .replace(COMPLETION_DATE_REGEX, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convert a ParsedDatedTask to an OFCEvent
   */
  convertToOFCEvent(task: ParsedDatedTask): import('../../types').OFCEvent {
    const baseEvent: import('../../types').OFCEvent = {
      title: task.title,
      type: 'single',
      allDay: true,
      date: task.dueDate,
      endDate: null,
      completed: typeof task.completed === 'boolean' ? (task.completed ? null : false) : task.completed
    };

    return baseEvent;
  }

  /**
   * Generate a persistent ID for a task based on file path and line number
   */
  generateTaskId(filePath: string, lineNumber: number): string {
    return `${filePath}::${lineNumber}`;
  }

  /**
   * Parse a task ID back to file path and line number
   */
  parseTaskId(taskId: string): { filePath: string; lineNumber: number } | null {
    const parts = taskId.split('::');
    if (parts.length !== 2) return null;
    
    const lineNumber = parseInt(parts[1], 10);
    if (isNaN(lineNumber)) return null;
    
    return { filePath: parts[0], lineNumber };
  }
}