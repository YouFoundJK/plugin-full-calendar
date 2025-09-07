/**
 * @file TaskSurgicalEditor.ts
 * @brief Interfaces and base classes for surgical task editing system.
 *
 * @description
 * This file defines the interface and architecture for a surgical editing system
 * that can handle specific types of task modifications while preserving all
 * unrelated metadata. Follows SOLID principles for extensibility and maintainability.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../../types';

/**
 * Interface for surgical editors that can handle specific types of task modifications.
 * Each editor is responsible for one type of change (title, date, completion, etc.)
 * and can determine if it can handle a particular change and apply it surgically.
 */
export interface TaskSurgicalEditor {
  /**
   * Determines if this editor can handle the change between two events.
   * @param oldEvent The original event data
   * @param newEvent The modified event data
   * @returns true if this editor can handle the change surgically
   */
  canHandle(oldEvent: OFCEvent, newEvent: OFCEvent): boolean;

  /**
   * Applies the surgical modification to the original task line.
   * @param originalLine The original task line from the file
   * @param oldEvent The original event data
   * @param newEvent The modified event data
   * @returns The modified task line with only the specific change applied
   */
  apply(originalLine: string, oldEvent: OFCEvent, newEvent: OFCEvent): string;

  /**
   * A descriptive name for this editor (for debugging and logging).
   */
  readonly name: string;
}

/**
 * Base class for surgical editors providing common utility methods.
 */
export abstract class BaseSurgicalEditor implements TaskSurgicalEditor {
  abstract readonly name: string;
  abstract canHandle(oldEvent: OFCEvent, newEvent: OFCEvent): boolean;
  abstract apply(originalLine: string, oldEvent: OFCEvent, newEvent: OFCEvent): string;

  /**
   * Utility method to check if two events are of the same type and basic structure.
   */
  protected areEventsCompatible(oldEvent: OFCEvent, newEvent: OFCEvent): boolean {
    return oldEvent.type === 'single' && newEvent.type === 'single';
  }

  /**
   * Utility method to check if only specific fields changed between events.
   * This method handles the discriminated union nature of OFCEvent.
   */
  protected onlyFieldsChanged(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    fieldsToCheck: string[]
  ): boolean {
    if (!this.areEventsCompatible(oldEvent, newEvent)) {
      return false;
    }

    // Get all properties from both events (as any to handle discriminated union)
    const oldEventAny = oldEvent as any;
    const newEventAny = newEvent as any;
    
    // Get all keys from both events
    const allKeys = new Set([
      ...Object.keys(oldEventAny),
      ...Object.keys(newEventAny)
    ]);

    // Check each key
    for (const key of allKeys) {
      const oldValue = oldEventAny[key];
      const newValue = newEventAny[key];
      
      if (oldValue !== newValue) {
        // This field changed - is it in our allowed list?
        if (!fieldsToCheck.includes(key)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Utility method to normalize whitespace in a task line.
   */
  protected normalizeWhitespace(line: string): string {
    return line.replace(/\s+/g, ' ').trim();
  }
}