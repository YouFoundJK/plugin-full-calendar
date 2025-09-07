/**
 * @file TitleSurgicalEditor.ts
 * @brief Surgical editor for task title changes.
 *
 * @description
 * This editor handles changes to task titles while preserving all metadata.
 * It only modifies the title portion of the task line, keeping all emojis
 * and other metadata intact.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../../types';
import { BaseSurgicalEditor } from './TaskSurgicalEditor';

/**
 * Surgical editor that handles title changes.
 * Only modifies the title portion while preserving all metadata.
 */
export class TitleSurgicalEditor extends BaseSurgicalEditor {
  readonly name = 'TitleSurgicalEditor';

  /**
   * Determines if this is only a title change.
   */
  canHandle(oldEvent: OFCEvent, newEvent: OFCEvent): boolean {
    if (!this.areEventsCompatible(oldEvent, newEvent)) {
      return false;
    }

    // Check if only title changed
    return this.onlyFieldsChanged(oldEvent, newEvent, ['title']);
  }

  /**
   * Surgically modifies a task line to change only the title.
   * Preserves all metadata while updating the title.
   */
  apply(originalLine: string, oldEvent: OFCEvent, newEvent: OFCEvent): string {
    // Parse the structure of the task line
    const taskMatch = originalLine.match(/^(\s*-\s*\[.\]\s*)(.+)$/);
    
    if (!taskMatch) {
      throw new Error('Invalid task line format');
    }

    const [, checkboxPart, restOfLine] = taskMatch;
    
    // Find where the title ends and metadata begins
    const metadataPart = this.extractMetadataPart(restOfLine, oldEvent.title);
    
    // Reconstruct with new title
    return this.normalizeWhitespace(
      checkboxPart + newEvent.title + (metadataPart ? ' ' + metadataPart : '')
    );
  }

  /**
   * Extracts the metadata portion of a task line by removing the title.
   */
  private extractMetadataPart(restOfLine: string, oldTitle: string): string {
    // Simple approach: if the line starts with the old title, extract everything after it
    if (restOfLine.startsWith(oldTitle)) {
      return restOfLine.substring(oldTitle.length).trim();
    }
    
    // Fallback: try to identify where title ends by looking for emoji patterns
    // This is more complex and may require sophisticated parsing
    return this.extractMetadataByEmojiPattern(restOfLine, oldTitle);
  }

  /**
   * Extracts metadata by looking for emoji patterns that indicate metadata start.
   */
  private extractMetadataByEmojiPattern(restOfLine: string, oldTitle: string): string {
    // Common task metadata emojis that indicate metadata has started
    const metadataEmojis = [
      '🆔', '⛔', '⏫', '🔽', '🏁', '➕', '🛫', '⏳', '📅', '✅', '❌',
      '📝', '🔗', '📎', '🎯', '⭐', '🔔', '📍', '🏷️'
    ];
    
    // Find the first occurrence of any metadata emoji
    let firstEmojiIndex = -1;
    for (const emoji of metadataEmojis) {
      const index = restOfLine.indexOf(emoji);
      if (index !== -1 && (firstEmojiIndex === -1 || index < firstEmojiIndex)) {
        firstEmojiIndex = index;
      }
    }
    
    if (firstEmojiIndex !== -1) {
      // Everything from the first emoji onwards is metadata
      return restOfLine.substring(firstEmojiIndex);
    }
    
    // If no emojis found, assume everything after the old title is metadata
    if (restOfLine.includes(oldTitle)) {
      const titleIndex = restOfLine.indexOf(oldTitle);
      const afterTitle = restOfLine.substring(titleIndex + oldTitle.length);
      return afterTitle.trim();
    }
    
    // Last resort: return empty metadata
    return '';
  }
}