/**
 * @file dispatcher.ts
 * @brief Maps NLP action objects to concrete plugin actions.
 *
 * @description
 * This module is the bridge between the NLP engine's output (NLPActionObject)
 * and the plugin's InternalAPI. It translates parsed intents and parameters
 * into real calendar operations: opening views, changing navigation, or
 * pre-filling the event creation modal.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';
import { Notice } from 'obsidian';
import type { OFCEvent } from '../../types';
import type { NLPActionObject } from './types';
import { launchCreateModal } from '../../ui/modals/event_modal';
import { t } from '../i18n/i18n';

/** FullCalendar view name mapping for navigation intents. */
const INTENT_VIEW_MAP: Record<string, string> = {
  NAVIGATE_DAY: 'timeGridDay',
  NAVIGATE_WEEK: 'timeGridWeek',
  NAVIGATE_MONTH: 'dayGridMonth'
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Resolves a calendar keyword to a calendar source ID via case-insensitive
 * name matching. Falls back to the first writable calendar if no match.
 */
function resolveCalendarId(keyword: string | null): string | null {
  const sources = PluginState.getProviderRegistry()
    .getAllSources()
    .filter(s => {
      const instance = PluginState.getProviderRegistry().getInstance(s.id);
      return instance?.getCapabilities().canCreate;
    });

  if (sources.length === 0) {
    return null;
  }

  if (keyword) {
    const normalized = keyword.toLowerCase().trim();
    const match = sources.find(s => s.name?.toLowerCase().trim() === normalized);
    if (match) {
      return match.id;
    }
  }

  return sources[0].id;
}

/**
 * Determines whether the NLP action object contains an explicit time
 * by checking if a time-related rule was matched.
 */
function hasExplicitTime(action: NLPActionObject): boolean {
  const timeRules = ['time_exact_ampm', 'time_noon', 'time_midnight', 'in_hours', 'in_minutes'];
  return action.matchedRules.some(rule => timeRules.includes(rule));
}

/**
 * Builds a partial OFCEvent from the NLP action object for the create modal.
 */
function buildPartialEvent(action: NLPActionObject): Partial<OFCEvent> {
  const timed = hasExplicitTime(action);

  if (timed) {
    const endHour = action.hours + 1;
    return {
      title: action.title,
      type: 'single',
      date: action.date,
      allDay: false,
      startTime: `${pad(action.hours)}:${pad(action.minutes)}`,
      endTime: `${pad(endHour % 24)}:${pad(action.minutes)}`
    };
  }

  return {
    title: action.title,
    type: 'single',
    date: action.date,
    allDay: true
  };
}

/**
 * Dispatches an NLP action object to the appropriate plugin action.
 *
 * - Navigation intents call `InternalAPI.changeView()`, `openCalendar()`, or `openSidebar()`
 * - `CREATE_EVENT` builds a partial event and opens the pre-filled create modal
 */
export async function dispatchNLPAction(action: NLPActionObject): Promise<void> {
  const internal = PluginState.getInternalAPI();

  // Handle navigation intents
  const viewName = INTENT_VIEW_MAP[action.intent];
  if (viewName) {
    await internal.changeView(viewName);
    return;
  }

  if (action.intent === 'OPEN_CALENDAR') {
    await internal.openCalendar();
    return;
  }

  if (action.intent === 'OPEN_SIDEBAR') {
    await internal.openSidebar();
    return;
  }

  // CREATE_EVENT intent
  const calendarId = resolveCalendarId(action.targetCalendar);
  if (!calendarId) {
    new Notice(t('nlp.noCalendars'));
    return;
  }

  const partialEvent = buildPartialEvent(action);
  launchCreateModal(PluginState.getPlugin(), partialEvent);
}

/** Exported for testing/preview purposes. */
export { buildPartialEvent, hasExplicitTime, resolveCalendarId };
