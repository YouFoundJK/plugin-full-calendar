/**
 * @file renderCalendars.ts
 * @brief Renders the calendar management section of the settings tab.
 * @license See LICENSE.md
 */

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
      sources: plugin.providerRegistry.getAllSources(),
      plugin: plugin,
      submit: (settings: CalendarInfo[]): void => {
        void (async () => {
          plugin.settings.calendarSources = settings;
          await plugin.saveSettings();
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
        { text: 'Full Note calendar', path: 'user/calendars/local' },
        { text: 'Daily Note calendar', path: 'user/calendars/dailynote' },
        { text: 'ICS calendars', path: 'user/calendars/ics' },
        { text: 'CalDAV calendars', path: 'user/calendars/caldav' },
        { text: 'Google calendar', path: 'user/calendars/gcal' },
        { text: 'Tasks integration', path: 'user/calendars/tasks-plugin-integration' },
        { text: 'Bases calendar', path: 'user/calendars/bases' }
      ],
      'Provider guides: '
    )
  );
}
