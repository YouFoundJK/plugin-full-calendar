/**
 * @file dispatcher.ts
 * @brief Maps NLP action objects to concrete plugin actions.
 *
 * @description
 * This module is the bridge between the NLP engine's output (NLPActionObject)
 * and the plugin's internal API surface. It translates parsed intents and
 * parameters into real calendar operations: opening views, navigating dates,
 * managing caches, or pre-filling the event creation modal.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';
import { Notice } from 'obsidian';
import type { OFCEvent } from '../../types';
import type { NLPActionObject } from './types';
import { launchCreateModal } from '../../ui/modals/event_modal';
import { resolveSmartCalendar } from './smartCalendar';
import { t } from '../i18n/i18n';

// Re-export for external consumers
export { resolveSmartCalendar } from './smartCalendar';

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
 * Returns a list of all writable calendar source names.
 * Used by the smart calendar resolver and the live preview.
 */
export function getWritableCalendarNames(): string[] {
  try {
    return PluginState.getProviderRegistry()
      .getAllSources()
      .filter(s => {
        const instance = PluginState.getProviderRegistry().getInstance(s.id);
        return instance?.getCapabilities().canCreate;
      })
      .map(s => s.name ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Determines whether the NLP action object contains an explicit time
 * by checking if a time-related rule was matched.
 */
export function hasExplicitTime(action: NLPActionObject): boolean {
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
 * Dispatches an NLP action object to the appropriate plugin action.
 * This is the central orchestrator that bridges NLP output to the plugin API.
 */
export async function dispatchNLPAction(action: NLPActionObject): Promise<void> {
  const internal = PluginState.getInternalAPI();

  // --- Navigation intents ---
  const viewName = INTENT_VIEW_MAP[action.intent];
  if (viewName) {
    new Notice(t('nlp.navigating', { view: action.intent.split('_')[1].toLowerCase() }));
    await internal.changeView(viewName);
    return;
  }

  if (action.intent === 'OPEN_CALENDAR') {
    new Notice(t('nlp.navigating', { view: 'calendar' }));
    await internal.openCalendar();
    return;
  }

  if (action.intent === 'OPEN_SIDEBAR') {
    new Notice(t('nlp.navigating', { view: 'sidebar' }));
    await internal.openSidebar();
    return;
  }

  // --- Orchestrator intents ---
  if (action.intent === 'OPEN_SETTINGS') {
    PluginState.displaySettingsTab();
    new Notice(t('nlp.parseSuccess'));
    return;
  }

  if (action.intent === 'OPEN_CHRONO') {
    if (PluginState.isMobile()) {
      new Notice(t('notices.chronoAnalyserMobileDisabled'));
      return;
    }
    const plugin = PluginState.getPlugin();
    const { ANALYSIS_VIEW_TYPE } = await import('../../chrono_analyser/AnalysisView');
    await plugin.app.workspace.getLeaf('tab').setViewState({
      type: ANALYSIS_VIEW_TYPE,
      active: true
    });
    return;
  }

  if (action.intent === 'SHOW_CHANGELOG') {
    PluginState.showChangelog();
    new Notice(t('nlp.parseSuccess'));
    return;
  }

  if (action.intent === 'RESET_CACHE') {
    PluginState.getCache().reset();
    new Notice(t('nlp.notices.cacheReset'));
    return;
  }

  if (action.intent === 'REVALIDATE_REMOTE') {
    PluginState.getProviderRegistry().revalidateRemoteCalendars(true);
    new Notice(t('nlp.parseSuccess'));
    return;
  }

  if (action.intent === 'SYNC_ACTIVITYWATCH') {
    const settings = PluginState.getSettings();
    if (!settings.activityWatch.enabled) {
      new Notice(t('nlp.notices.awNotEnabled'));
      return;
    }
    const plugin = PluginState.getPlugin();
    const { syncActivityWatch } = await import('../../features/activitywatch/sync');
    await syncActivityWatch(plugin);
    new Notice(t('nlp.parseSuccess'));
    return;
  }

  // --- GOTO_DATE intent: navigate the calendar to the computed date ---
  if (action.intent === 'GOTO_DATE') {
    await internal.changeView('timeGridDay');
    // Allow the view to mount before calling gotoDate
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      const plugin = PluginState.getPlugin();
      const leaf = plugin.app.workspace.getLeavesOfType('full-calendar-view')[0];
      if (leaf?.view && 'fullCalendarView' in (leaf.view as unknown as Record<string, unknown>)) {
        const fcView = (leaf.view as unknown as Record<string, unknown>)['fullCalendarView'] as
          | { gotoDate: (date: string) => void }
          | undefined;
        fcView?.gotoDate(action.date);
      }
    } catch {
      // Best-effort — the day view is already open
    }
    return;
  }

  // --- NEW_EVENT intent: open blank create modal ---
  if (action.intent === 'NEW_EVENT') {
    internal.openCreateModal();
    return;
  }

  // --- CREATE_EVENT intent (default) ---
  // Apply smart calendar resolution
  const resolved = resolveSmartCalendar(action, getWritableCalendarNames());

  const calendarId = resolveCalendarId(resolved.targetCalendar);
  if (!calendarId) {
    new Notice(t('nlp.noCalendars'));
    return;
  }

  const partialEvent = buildPartialEvent(resolved);
  launchCreateModal(PluginState.getPlugin(), partialEvent);
}
