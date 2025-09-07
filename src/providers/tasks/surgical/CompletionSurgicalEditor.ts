/**
 * @file CompletionSurgicalEditor.ts
 * @brief Surgical editor for task completion status changes.
 *
 * @description
 * This editor handles changes to task completion status while preserving
 * all other metadata. It surgically modifies the checkbox and completion
 * emoji without affecting other task metadata.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';
import { BaseSurgicalEditor } from './TaskSurgicalEditor';
import { TASK_EMOJIS } from '../TasksSettings';

/**
 * Surgical editor that handles completion status changes.
 * Only modifies the checkbox and completion emoji, preserving all other metadata.
 */
export class CompletionSurgicalEditor extends BaseSurgicalEditor {
  readonly name = 'CompletionSurgicalEditor';

  /**
   * Determines if this is only a completion status change.
   */
  canHandle(oldEvent: OFCEvent, newEvent: OFCEvent): boolean {
    if (!this.areEventsCompatible(oldEvent, newEvent)) {
      return false;
    }

    // Type guard to ensure we're working with single events
    if (oldEvent.type !== 'single' || newEvent.type !== 'single') {
      return false;
    }

    // Check if only completion status changed
    return this.onlyFieldsChanged(oldEvent, newEvent, ['completed']);
  }

  /**
   * Surgically modifies a task line to change only the completion status.
   * Preserves all metadata while updating checkbox and completion emoji.
   */
  apply(originalLine: string, oldEvent: OFCEvent, newEvent: OFCEvent): string {
    // Type guard
    if (oldEvent.type !== 'single' || newEvent.type !== 'single') {
      throw new Error('CompletionSurgicalEditor can only handle single events');
    }

    const isCompleted = newEvent.completed !== false;
    
    // Step 1: Change the checkbox status
    let modifiedLine = originalLine.replace(
      /^\s*-\s*\[.\]\s*/,
      isCompleted ? '- [x] ' : '- [ ] '
    );

    if (isCompleted) {
      // Adding completion: add completion emoji with today's date
      const completionDate = DateTime.now().toFormat('yyyy-MM-dd');
      modifiedLine += ` ${TASK_EMOJIS.DONE} ${completionDate}`;
    } else {
      // Removing completion: remove completion emoji and its date
      modifiedLine = this.removeCompletionEmojis(modifiedLine);
    }

    return modifiedLine;
  }

  /**
   * Removes completion emojis and their associated dates from a task line.
   */
  private removeCompletionEmojis(line: string): string {
    const completionEmojis = [TASK_EMOJIS.DONE, TASK_EMOJIS.CANCELLED];
    let modifiedLine = line;
    
    for (const emoji of completionEmojis) {
      while (true) {
        const emojiIndex = modifiedLine.indexOf(emoji);
        if (emojiIndex === -1) {
          break;
        }

        const before = modifiedLine.substring(0, emojiIndex).trim();
        const after = modifiedLine.substring(emojiIndex + emoji.length).trim();

        // Look for a date after the completion emoji
        const dateMatch = after.match(
          /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/
        );
        
        if (dateMatch) {
          // Remove both emoji and date
          const dateString = dateMatch[1];
          const afterDateRemoved = after.replace(dateString, '').trim();
          modifiedLine = this.normalizeWhitespace(before + ' ' + afterDateRemoved);
        } else {
          // Just remove the emoji
          modifiedLine = this.normalizeWhitespace(before + ' ' + after);
        }
      }
    }

    return modifiedLine;
  }
}