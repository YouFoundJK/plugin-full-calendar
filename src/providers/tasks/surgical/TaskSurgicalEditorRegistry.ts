/**
 * @file TaskSurgicalEditorRegistry.ts
 * @brief Registry for managing surgical task editors.
 *
 * @description
 * This registry manages a collection of surgical editors and provides
 * the main interface for applying surgical modifications to task lines.
 * It follows the chain of responsibility pattern to find the appropriate
 * editor for each type of change.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../../types';
import { TaskSurgicalEditor } from './TaskSurgicalEditor';

/**
 * Registry that manages surgical editors and applies them in order of priority.
 * This class follows the Open/Closed Principle - it's open for extension
 * (adding new editors) but closed for modification.
 */
export class TaskSurgicalEditorRegistry {
  private editors: TaskSurgicalEditor[] = [];

  /**
   * Registers a new surgical editor.
   * @param editor The editor to register
   */
  register(editor: TaskSurgicalEditor): void {
    this.editors.push(editor);
  }

  /**
   * Finds the first editor that can handle the change between two events.
   * @param oldEvent The original event data
   * @param newEvent The modified event data
   * @returns The editor that can handle the change, or null if none found
   */
  findEditor(oldEvent: OFCEvent, newEvent: OFCEvent): TaskSurgicalEditor | null {
    for (const editor of this.editors) {
      if (editor.canHandle(oldEvent, newEvent)) {
        return editor;
      }
    }
    return null;
  }

  /**
   * Attempts to apply a surgical edit to a task line.
   * @param originalLine The original task line from the file
   * @param oldEvent The original event data
   * @param newEvent The modified event data
   * @returns The surgically modified line, or null if no editor can handle the change
   */
  applySurgicalEdit(
    originalLine: string,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): string | null {
    const editor = this.findEditor(oldEvent, newEvent);
    
    if (!editor) {
      return null;
    }

    try {
      return editor.apply(originalLine, oldEvent, newEvent);
    } catch (error) {
      console.warn(`Surgical editor '${editor.name}' failed to apply changes:`, error);
      return null;
    }
  }

  /**
   * Gets a list of all registered editor names (for debugging).
   */
  getRegisteredEditorNames(): string[] {
    return this.editors.map(editor => editor.name);
  }

  /**
   * Clears all registered editors (primarily for testing).
   */
  clear(): void {
    this.editors = [];
  }
}