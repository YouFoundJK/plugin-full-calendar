/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';

/**
 * Performs all necessary migrations and sanitizations on a loaded settings object.
 * This function is pure and does not modify the plugin state directly.
 * @param settings The raw settings object loaded from data.json.
 * @returns An object containing the migrated settings and a flag indicating if they need to be saved.
 */
export function migrateAndSanitizeSettings(settings: any): {
  settings: FullCalendarSettings;
  needsSave: boolean;
} {
  let needsSave = false;
  let newSettings = { ...settings };

  // MIGRATION 1: Global googleAuth to source-specific auth
  const globalGoogleAuth = newSettings.googleAuth || null;
  if (globalGoogleAuth) {
    needsSave = true;
    newSettings.calendarSources.forEach((s: any) => {
      if (s.type === 'google' && !s.auth) {
        s.auth = globalGoogleAuth;
      }
    });
    delete newSettings.googleAuth;
  }

  // MIGRATION 2: Ensure all calendar sources have a stable ID.
  const { updated, sources } = ensureCalendarIds(newSettings.calendarSources);
  if (updated) {
    needsSave = true;
  }
  newSettings.calendarSources = sources;

  // SANITIZATION 1: Correct initial view if timeline is disabled.
  newSettings = sanitizeInitialView(newSettings);

  return { settings: newSettings, needsSave };
}

/**
 * Ensure each calendar source has a stable id. Pure and UI-free.
 */
export function ensureCalendarIds(sources: any[]): { updated: boolean; sources: CalendarInfo[] } {
  let updated = false;
  const existingIds: string[] = sources.map(s => s.id).filter(Boolean);
  const updatedSources = sources.map(source => {
    if (!source.id) {
      updated = true;
      const newId = generateCalendarId(source.type, existingIds);
      existingIds.push(newId);
      return { ...source, id: newId };
    }
    return source;
  });
  return { updated, sources: updatedSources as CalendarInfo[] };
}

/**
 * Sanitize initial view if timeline is disabled. Pure and UI-free aside from a Notice.
 */
export function sanitizeInitialView(settings: FullCalendarSettings): FullCalendarSettings {
  if (
    !settings.enableAdvancedCategorization &&
    settings.initialView.desktop.startsWith('resourceTimeline')
  ) {
    new Notice('Timeline view is disabled. Resetting default desktop view to "Week".', 5000);
    return {
      ...settings,
      initialView: {
        ...settings.initialView,
        desktop: 'timeGridWeek'
      }
    };
  }
  return settings;
}
