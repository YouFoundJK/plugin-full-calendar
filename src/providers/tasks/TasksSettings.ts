/**
 * @file TasksSettings.ts
 * @brief Utility functions for reading Obsidian Tasks plugin settings.
 *
 * @description
 * This module provides functionality to safely read configuration from the
 * Obsidian Tasks plugin, allowing zero-configuration integration by using
 * the user's existing task settings.
 *
 * @license See LICENSE.md
 */

export interface TasksPluginSettings {
  globalFilter: string;
  // Add other settings as needed
}

// Standard task emojis used by the Obsidian Tasks plugin
export const TASK_EMOJIS = {
  DUE: '📅', // Due date
  START: '🛫', // Start date  
  SCHEDULED: '⏳', // Scheduled date
  DONE: '✅', // Done/completion
  CANCELLED: '❌' // Cancelled
} as const;

// Extend Window interface to include Obsidian's app object
declare global {
  interface Window {
    app?: {
      plugins?: {
        plugins?: Record<string, any>;
      };
    };
  }
}

/**
 * Reads the Obsidian Tasks plugin settings if available.
 * @returns The tasks plugin settings or default values
 */
export function getTasksPluginSettings(): TasksPluginSettings {
  // Try to access the Tasks plugin settings via the global app object
  // This is how plugins typically access other plugins' settings
  if (typeof window !== 'undefined' && window.app?.plugins?.plugins) {
    const tasksPlugin = window.app.plugins.plugins['obsidian-tasks-plugin'];
    if (tasksPlugin?.settings) {
      return {
        globalFilter: tasksPlugin.settings.globalFilter || '📅',
        ...tasksPlugin.settings
      };
    }
  }

  // Return default settings if Tasks plugin is not found or settings unavailable
  return {
    globalFilter: '📅' // Default due date emoji
  };
}

/**
 * Gets the due date emoji configured in the Tasks plugin.
 * @returns The emoji used for due dates (defaults to 📅)
 */
export function getDueDateEmoji(): string {
  return getTasksPluginSettings().globalFilter;
}

/**
 * Gets the start date emoji used by the Tasks plugin.
 * @returns The emoji used for start dates (🛫)
 */
export function getStartDateEmoji(): string {
  return TASK_EMOJIS.START;
}

/**
 * Gets the scheduled date emoji used by the Tasks plugin.
 * @returns The emoji used for scheduled dates (⏳)
 */
export function getScheduledDateEmoji(): string {
  return TASK_EMOJIS.SCHEDULED;
}

/**
 * Gets all task date emojis in order of precedence for parsing.
 * @returns Array of [emoji, type] tuples
 */
export function getTaskDateEmojis(): Array<[string, 'start' | 'scheduled' | 'due']> {
  return [
    [getStartDateEmoji(), 'start'],
    [getScheduledDateEmoji(), 'scheduled'], 
    [getDueDateEmoji(), 'due']
  ];
}
