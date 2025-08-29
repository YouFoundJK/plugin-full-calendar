/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { FullCalendarSettings, GoogleAccount } from '../../types/settings'; // Add GoogleAccount import
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';

/**
 * Performs all necessary migrations and sanitizations on a loaded settings object.
 * This function is pure and does not modify the plugin state directly.
 * @param settings The raw settings object loaded from data.json.
 * @returns An object containing the migrated settings and a flag indicating if they need to be saved.
 */
// Legacy shape support for migrations
type LegacyGoogleAuth = {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
};
type GoogleSourceWithAuth = Extract<CalendarInfo, { type: 'google' }> & { auth?: LegacyGoogleAuth };
type LegacySettings = Partial<FullCalendarSettings> & {
  calendarSources?: (CalendarInfo | GoogleSourceWithAuth)[];
  googleAuth?: LegacyGoogleAuth;
};

// Accept unknown to force validation of shape when accessing.
export function migrateAndSanitizeSettings(settings: unknown): {
  settings: FullCalendarSettings;
  needsSave: boolean;
} {
  let needsSave = false;
  const raw = (settings as LegacySettings) || {};
  // Start from raw, ensure required arrays/objects
  let newSettings = {
    calendarSources: (raw.calendarSources || []) as (CalendarInfo | GoogleSourceWithAuth)[],
    defaultCalendar: raw.defaultCalendar ?? 0,
    firstDay: raw.firstDay ?? 0,
    initialView: raw.initialView ?? { desktop: 'timeGridWeek', mobile: 'timeGrid3Days' },
    timeFormat24h: raw.timeFormat24h ?? false,
    clickToCreateEventFromMonthView: raw.clickToCreateEventFromMonthView ?? true,
    displayTimezone: raw.displayTimezone ?? null,
    lastSystemTimezone: raw.lastSystemTimezone ?? null,
    enableAdvancedCategorization: raw.enableAdvancedCategorization ?? false,
    chrono_analyser_config: raw.chrono_analyser_config ?? null,
    categorySettings: raw.categorySettings || [],
    useCustomGoogleClient: raw.useCustomGoogleClient ?? false,
    googleClientId: raw.googleClientId ?? '',
    googleClientSecret: raw.googleClientSecret ?? '',
    googleAccounts: raw.googleAccounts || [],
    businessHours: raw.businessHours || {
      enabled: false,
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00'
    },
    enableBackgroundEvents: raw.enableBackgroundEvents ?? true,
    enableReminders: raw.enableReminders ?? false,
    workspaces: raw.workspaces || [],
    activeWorkspace: raw.activeWorkspace ?? null,
    showEventInStatusBar: (raw as Partial<FullCalendarSettings>).showEventInStatusBar ?? false,
    
    // New granular view configuration properties with sensible defaults
    slotMinTime: raw.slotMinTime ?? '00:00',
    slotMaxTime: raw.slotMaxTime ?? '24:00', 
    weekends: raw.weekends ?? true,
    hiddenDays: raw.hiddenDays ?? [],
    dayMaxEvents: raw.dayMaxEvents ?? false
  } as FullCalendarSettings & { calendarSources: (CalendarInfo | GoogleSourceWithAuth)[] } & {
    googleAuth?: LegacyGoogleAuth;
  };

  // Ensure googleAccounts array exists for the migration
  // googleAccounts already defaulted above

  // MIGRATION 1: Global googleAuth to source-specific auth (from previous work, can be removed or kept for safety)
  const globalGoogleAuth = (raw.googleAuth as LegacyGoogleAuth | undefined) || null;
  if (globalGoogleAuth) {
    // This logic is technically superseded by the next migration,
    // but we can leave it for robustness during the transition.
    newSettings.calendarSources.forEach(s => {
      if (s.type === 'google' && !('googleAccountId' in s) && !(s as GoogleSourceWithAuth).auth) {
        (s as GoogleSourceWithAuth).auth = globalGoogleAuth;
      }
    });
  }

  // === FINAL MIGRATION: Move embedded auth to centralized googleAccounts ===
  const refreshTokenToAccountId = new Map<string, string>();
  newSettings.calendarSources.forEach(source => {
    if (
      source.type === 'google' &&
      (source as GoogleSourceWithAuth).auth &&
      !source.googleAccountId
    ) {
      needsSave = true;
      const refreshToken = (source as GoogleSourceWithAuth).auth?.refreshToken;
      if (refreshToken) {
        if (refreshTokenToAccountId.has(refreshToken)) {
          source.googleAccountId = refreshTokenToAccountId.get(refreshToken);
        } else {
          const newAccountId = `gcal_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount: GoogleAccount = {
            id: newAccountId,
            email: 'Migrated Account',
            ...(source as GoogleSourceWithAuth).auth!
          };
          newSettings.googleAccounts.push(newAccount);
          refreshTokenToAccountId.set(refreshToken, newAccountId);
          source.googleAccountId = newAccountId;
        }
      }
      delete (source as GoogleSourceWithAuth).auth;
    }
  });
  // global googleAuth removed implicitly by not copying it forward
  // === END FINAL MIGRATION ===

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
export function ensureCalendarIds(sources: unknown[]): {
  updated: boolean;
  sources: CalendarInfo[];
} {
  let updated = false;
  const existingIds: string[] = (sources as { id?: string }[])
    .map(s => s.id)
    .filter((id): id is string => !!id);
  const updatedSources = (
    sources as (CalendarInfo | { id?: string; type: CalendarInfo['type'] })[]
  ).map(source => {
    if (!('id' in source) || !source.id) {
      updated = true;
      const newId = generateCalendarId((source as CalendarInfo).type, existingIds);
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
