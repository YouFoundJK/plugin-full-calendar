/**
 * @file renderCalendars.ts
 * @brief Renders the calendar management section of the settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import React, { createElement, RefObject } from 'react';
import FullCalendarPlugin from '../../../main';
import { addCalendarButton } from '../SettingsTab';
import { CalendarSettings, CalendarSettingsRef } from './calendars/CalendarSetting';
import { CalendarInfo } from '../../../types/calendar_settings';
import { t } from '../../../features/i18n/i18n';
import { createDocsLinksFragment } from '../docsLinks';

export function renderCalendarManagement(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  calendarSettingsRef: RefObject<CalendarSettingsRef>
): void {
  new Setting(containerEl)
    .setName(t('settings.calendars.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([
        { text: 'Calendar sources settings', path: 'user/settings/sources' },
        { text: 'Calendar types', path: 'user/calendars/' }
      ])
    );
  containerEl.createEl('hr', { cls: 'settings-view-new-divider' });
  const sourcesDiv = containerEl.createDiv();
  const root = ReactDOM.createRoot(sourcesDiv);
  root.render(
    createElement(CalendarSettings, {
      ref: calendarSettingsRef as React.Ref<CalendarSettings>,
      sources: PluginState.getProviderRegistry().getAllSources(),
      plugin: plugin,
      submit: (settings: CalendarInfo[]): void => {
        void (async () => {
          PluginState.getSettings().calendarSources = settings;
          await PluginState.saveSettings();
        })();
      }
    })
  );
  addCalendarButton(
    plugin,
    containerEl,
    (source: CalendarInfo): void => {
      calendarSettingsRef.current?.addSource(source);
    },
    () => calendarSettingsRef.current?.getUsedDirectories() ?? []
  );

  new Setting(containerEl).setDesc(
    createDocsLinksFragment(
      [
        { text: t('settings.calendars.docs.fullNote'), path: 'user/calendars/local' },
        { text: t('settings.calendars.docs.dailyNote'), path: 'user/calendars/dailynote' },
        { text: t('settings.calendars.docs.ics'), path: 'user/calendars/ics' },
        { text: t('settings.calendars.docs.caldav'), path: 'user/calendars/caldav' },
        { text: t('settings.calendars.docs.google'), path: 'user/calendars/gcal' },
        {
          text: t('settings.calendars.docs.tasks'),
          path: 'user/calendars/tasks-plugin-integration'
        },
        { text: t('settings.calendars.docs.bases'), path: 'user/calendars/bases' },
        { text: t('settings.calendars.docs.taskNotes'), path: 'user/calendars/tasknotes' }
      ],
      t('settings.calendars.docs.providerGuides')
    )
  );
}
