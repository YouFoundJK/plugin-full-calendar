/**
 * @file tasks.ts
 * @brief Provides utility functions for handling task-related events.
 *
 * @description
 * This file contains core business logic for managing the "task" aspect of an event.
 * It includes logic for identifying if an event is a task (`isTask`), updating
 * task status (`updateTaskStatus`), and converting a regular event into a
 * task or vice-versa (`unmakeTask`).
 *
 * Updated for the new multi-status task system in Step 3.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../types';
import { TaskStatus } from '../features/tasks/taskConstants';

/**
 * Checks if an event is a task by examining the new `task` property.
 * @param e The event to check
 * @returns true if the event has a task status (any non-null value)
 */
export const isTask = (e: OFCEvent) => {
  return e.task !== null && e.task !== undefined;
};

/**
 * Converts a task event back to a regular event by setting task to null.
 * @param event The event to convert
 * @returns A new event object without task status
 */
export const unmakeTask = (event: OFCEvent): OFCEvent => {
  return { ...event, task: null };
};

/**
 * Updates the task status of an event.
 * @param event The event to update
 * @param newStatus The new task status character or null for non-task
 * @returns A new event object with the updated task status
 */
export const updateTaskStatus = (event: OFCEvent, newStatus: TaskStatus): OFCEvent => {
  return { ...event, task: newStatus };
};

/**
 * @deprecated Use updateTaskStatus instead. This function is kept for backward compatibility.
 * Toggles the completion status of a task event.
 * @param event The event to toggle
 * @param isDone Whether the task should be marked as done
 * @returns A new event object with updated task status
 */
export const toggleTask = (event: OFCEvent, isDone: boolean): OFCEvent => {
  if (!isTask(event)) {
    // If it's not a task, make it a task first
    return { ...event, task: isDone ? 'x' : ' ' };
  }
  
  // Toggle between done and todo
  return { ...event, task: isDone ? 'x' : ' ' };
};
