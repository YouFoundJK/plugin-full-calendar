/**
 * @file DateSurgicalEditor.ts
 * @brief Surgical editor for task date changes.
 *
 * @description
 * This editor handles changes to task dates (due date, start date, end date)
 * while preserving all other metadata. It surgically modifies only the
 * relevant date emojis and their associated dates.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';
import { BaseSurgicalEditor } from './TaskSurgicalEditor';
import { getDueDateEmoji, getStartDateEmoji } from '../TasksSettings';

/**
 * Surgical editor that handles date changes.
 * Only modifies date-related emojis and their values while preserving other metadata.
 */
export class DateSurgicalEditor extends BaseSurgicalEditor {
  readonly name = 'DateSurgicalEditor';

  /**
   * Determines if this is only a date-related change.
   */
  canHandle(oldEvent: OFCEvent, newEvent: OFCEvent): boolean {
    if (!this.areEventsCompatible(oldEvent, newEvent)) {
      return false;
    }

    // Type guard to ensure we're working with single events
    if (oldEvent.type !== 'single' || newEvent.type !== 'single') {
      return false;
    }

    // Check if only date-related fields changed
    return this.onlyFieldsChanged(oldEvent, newEvent, ['date', 'endDate']);
  }

  /**
   * Surgically modifies a task line to change only date-related metadata.
   * Preserves all non-date metadata while updating dates.
   */
  apply(originalLine: string, oldEvent: OFCEvent, newEvent: OFCEvent): string {
    // Type guard
    if (oldEvent.type !== 'single' || newEvent.type !== 'single') {
      throw new Error('DateSurgicalEditor can only handle single events');
    }

    let modifiedLine = originalLine;

    // Handle the primary date change
    if (oldEvent.date !== newEvent.date) {
      modifiedLine = this.updateDateEmoji(
        modifiedLine,
        oldEvent.date,
        newEvent.date,
        this.getPrimaryDateEmoji(oldEvent, newEvent)
      );
    }

    // Handle end date changes
    if (oldEvent.endDate !== newEvent.endDate) {
      if (oldEvent.endDate && !newEvent.endDate) {
        // Removing end date
        modifiedLine = this.removeDateEmoji(modifiedLine, oldEvent.endDate, getDueDateEmoji());
      } else if (!oldEvent.endDate && newEvent.endDate) {
        // Adding end date
        modifiedLine = this.addDateEmoji(modifiedLine, newEvent.endDate, getDueDateEmoji());
      } else if (oldEvent.endDate && newEvent.endDate) {
        // Updating end date
        modifiedLine = this.updateDateEmoji(
          modifiedLine,
          oldEvent.endDate,
          newEvent.endDate,
          getDueDateEmoji()
        );
      }
    }

    return this.normalizeWhitespace(modifiedLine);
  }

  /**
   * Determines the appropriate emoji for the primary date based on event structure.
   */
  private getPrimaryDateEmoji(oldEvent: { type: 'single'; date: string; endDate: string | null }, newEvent: { type: 'single'; date: string; endDate: string | null }): string {
    // If there's an end date, primary date should use start date emoji
    if (newEvent.endDate || oldEvent.endDate) {
      return getStartDateEmoji();
    }
    // Otherwise use due date emoji
    return getDueDateEmoji();
  }

  /**
   * Updates a specific date emoji and its value in the task line.
   */
  private updateDateEmoji(line: string, oldDate: string, newDate: string, emoji: string): string {
    const oldDateFormatted = DateTime.fromISO(oldDate).toFormat('yyyy-MM-dd');
    const newDateFormatted = DateTime.fromISO(newDate).toFormat('yyyy-MM-dd');

    // Find the emoji followed by the old date pattern
    const pattern = new RegExp(`${this.escapeRegex(emoji)}\\s+${this.escapeRegex(oldDateFormatted)}`, 'g');
    
    if (line.match(pattern)) {
      return line.replace(pattern, `${emoji} ${newDateFormatted}`);
    }

    // If exact pattern not found, try to find the emoji and replace the first date after it
    const emojiIndex = line.indexOf(emoji);
    if (emojiIndex !== -1) {
      const before = line.substring(0, emojiIndex + emoji.length);
      const after = line.substring(emojiIndex + emoji.length);
      
      // Replace the first date after the emoji with the new date
      const datePattern = /\s*\d{4}-\d{1,2}-\d{1,2}/;
      const updatedAfter = after.replace(datePattern, ` ${newDateFormatted}`);
      
      return before + updatedAfter;
    }

    // If emoji not found, this might be a single-date event becoming multi-date
    // Add the emoji and date at the end
    return this.addDateEmoji(line, newDate, emoji);
  }

  /**
   * Removes a date emoji and its value from the task line.
   */
  private removeDateEmoji(line: string, dateToRemove: string, emoji: string): string {
    const dateFormatted = DateTime.fromISO(dateToRemove).toFormat('yyyy-MM-dd');
    
    // Try to remove emoji + date combination
    const pattern = new RegExp(`\\s*${this.escapeRegex(emoji)}\\s+${this.escapeRegex(dateFormatted)}`);
    let result = line.replace(pattern, '');
    
    // If that didn't work, try removing just the emoji (and the date after it)
    if (result === line) {
      const emojiIndex = line.indexOf(emoji);
      if (emojiIndex !== -1) {
        const before = line.substring(0, emojiIndex);
        const after = line.substring(emojiIndex + emoji.length);
        
        // Remove the first date after the emoji
        const datePattern = /\s*\d{4}-\d{1,2}-\d{1,2}/;
        const updatedAfter = after.replace(datePattern, '');
        
        result = before + updatedAfter;
      }
    }
    
    return result;
  }

  /**
   * Adds a new date emoji and value to the task line.
   */
  private addDateEmoji(line: string, date: string, emoji: string): string {
    const dateFormatted = DateTime.fromISO(date).toFormat('yyyy-MM-dd');
    return `${line} ${emoji} ${dateFormatted}`;
  }

  /**
   * Escapes special regex characters in a string.
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}