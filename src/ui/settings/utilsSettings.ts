/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';

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
