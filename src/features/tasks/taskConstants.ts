/**
 * @file taskConstants.ts
 * @brief Constants and definitions for task status characters.
 *
 * @description
 * This module defines the available task statuses and their metadata for use
 * throughout the plugin. It follows DRY principles by centralizing all task
 * status definitions that are used by the UI modal, context menus, and other
 * task-related functionality.
 *
 * @license See LICENSE.md
 */

/**
 * Available task status characters and their human-readable descriptions.
 * These align with common task management systems including Obsidian Tasks plugin.
 */
export const TASK_STATUSES = {
  TODO: ' ',        // Standard todo (space)
  DONE: 'x',        // Completed task
  CANCELLED: '-',   // Cancelled task
  IN_PROGRESS: '/',  // In progress
  DEFERRED: '>',    // Deferred/delegated
  QUESTION: '?',    // Question/unclear
  IMPORTANT: '!',   // Important/priority
  SCHEDULED: '<',   // Scheduled
  INFO: 'i',        // Information/note
} as const;

/**
 * Task status display information for UI components.
 */
export const TASK_STATUS_OPTIONS = [
  { value: null, label: 'Not a task', description: 'Regular calendar event' },
  { value: TASK_STATUSES.TODO, label: 'Todo', description: 'Task to be done' },
  { value: TASK_STATUSES.IN_PROGRESS, label: 'In Progress', description: 'Task currently being worked on' },
  { value: TASK_STATUSES.DONE, label: 'Done', description: 'Completed task' },
  { value: TASK_STATUSES.CANCELLED, label: 'Cancelled', description: 'Cancelled task' },
  { value: TASK_STATUSES.DEFERRED, label: 'Deferred', description: 'Delegated or deferred task' },
  { value: TASK_STATUSES.QUESTION, label: 'Question', description: 'Task with unclear requirements' },
  { value: TASK_STATUSES.IMPORTANT, label: 'Important', description: 'High priority task' },
  { value: TASK_STATUSES.SCHEDULED, label: 'Scheduled', description: 'Scheduled task' },
  { value: TASK_STATUSES.INFO, label: 'Info', description: 'Information or note' },
] as const;

/**
 * Type for valid task status characters.
 */
export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES] | null;

/**
 * Checks if a given string is a valid task status character.
 */
export function isValidTaskStatus(status: string | null): status is TaskStatus {
  if (status === null) return true;
  return Object.values(TASK_STATUSES).includes(status as any);
}

/**
 * Gets the display label for a task status.
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  const option = TASK_STATUS_OPTIONS.find(opt => opt.value === status);
  return option?.label || 'Unknown';
}

/**
 * Gets the description for a task status.
 */
export function getTaskStatusDescription(status: TaskStatus): string {
  const option = TASK_STATUS_OPTIONS.find(opt => opt.value === status);
  return option?.description || 'Unknown task status';
}