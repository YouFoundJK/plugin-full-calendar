/**
 * @file taskEnhancer.ts
 * @brief Task status normalization logic for backward compatibility.
 *
 * @description
 * This module provides pure functions for normalizing task status from the legacy
 * isTask/completed system to the new unified task property. It handles backward
 * compatibility during the migration from binary task states to multi-status.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../types';

/**
 * Normalizes task status from various legacy formats to the canonical task property.
 * 
 * This function implements the backward compatibility bridge by checking for task
 * indicators in the following order of precedence:
 * 1. New `task` property (if present, use as-is)
 * 2. Legacy `completed` property on single events
 * 3. Legacy `isTask` property on recurring/rrule events
 * 
 * @param rawEvent The raw event object from any provider
 * @returns The canonical task status character or null if not a task
 */
export function normalizeTaskStatus(rawEvent: Partial<OFCEvent>): string | null {
  // If the new task property exists, use it directly
  if (rawEvent.task !== undefined) {
    return rawEvent.task;
  }

  // Handle legacy single events with completed property
  if (rawEvent.type === 'single' && rawEvent.completed !== undefined && rawEvent.completed !== null) {
    // If completed is a date string (truthy), it's a completed task
    // If completed is false, it's an incomplete task
    return rawEvent.completed ? 'x' : ' ';
  }

  // Handle legacy recurring/rrule events with isTask property
  if ((rawEvent.type === 'recurring' || rawEvent.type === 'rrule') && rawEvent.isTask) {
    // Recurring tasks don't have completion state in the legacy system,
    // so they default to incomplete
    return ' ';
  }

  // Not a task
  return null;
}