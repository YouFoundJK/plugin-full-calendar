/**
 * @file settings.tsx
 * @brief Implements the plugin's settings tab UI.
 *
 * @description
 * This file defines the `FullCalendarSettingTab` class, which uses Obsidian's
 * `PluginSettingTab` API to build the user-facing settings interface. It
 * combines native Obsidian UI components with the React-based `CalendarSettings`
 * component to manage and persist all plugin configurations.
 *
 * @exports FullCalendarSettingTab
 * @exports DEFAULT_SETTINGS
 *
 * @see components/CalendarSetting.tsx
 *
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../main';
import {
  App,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder
} from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement, createRef } from 'react';

import ReactModal from './ReactModal';
import { AddCalendarSource } from './components/AddCalendarSource';
import { importCalendars } from '../calendars/parsing/caldav/import';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { makeDefaultPartialCalendarSource, CalendarInfo } from '../types';
import { CalendarSettings, CalendarSettingsRef } from './components/CalendarSetting';

export interface FullCalendarSettings {
  calendarSources: CalendarInfo[];
  defaultCalendar: number;
  firstDay: number;
  initialView: {
    desktop: string;
    mobile: string;
  };
  timeFormat24h: boolean;
  clickToCreateEventFromMonthView: boolean;
  displayTimezone: string | null;
  lastSystemTimezone: string | null;
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
  calendarSources: [],
  defaultCalendar: 0,
  firstDay: 0,
  initialView: {
    desktop: 'timeGridWeek',
    mobile: 'timeGrid3Days'
  },
  timeFormat24h: false,
  clickToCreateEventFromMonthView: true,
  displayTimezone: null,
  lastSystemTimezone: null
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INITIAL_VIEW_OPTIONS = {
  DESKTOP: {
    timeGridDay: 'Day',
    timeGridWeek: 'Week',
    dayGridMonth: 'Month',
    listWeek: 'List'
  },
  MOBILE: {
    timeGrid3Days: '3 Days',
    timeGridDay: 'Day',
    listWeek: 'List'
  }
};

export function addCalendarButton(
  app: App,
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;
  const directories = app.vault
    .getAllLoadedFiles()
    .filter(f => f instanceof TFolder)
    .map(f => f.path);

  return new Setting(containerEl)
    .setName('Calendars')
    .setDesc('Add calendar')
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: 'Full note',
          dailynote: 'Daily Note',
          icloud: 'iCloud',
          caldav: 'CalDAV',
          ical: 'Remote (.ics format)'
        }))
    )
    .addExtraButton(button => {
      button.setTooltip('Add Calendar');
      button.setIcon('plus-with-circle');
      button.onClick(() => {
        let modal = new ReactModal(app, async () => {
          await plugin.loadSettings();
          const usedDirectories = (
            listUsedDirectories
              ? listUsedDirectories
              : () =>
                  plugin.settings.calendarSources
                    .map(s => s.type === 'local' && s.directory)
                    .filter((s): s is string => !!s)
          )();
          let headings: string[] = [];
          let { template } = getDailyNoteSettings();

          if (template) {
            if (!template.endsWith('.md')) {
              template += '.md';
            }
            const file = app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings = app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          return createElement(AddCalendarSource, {
            source: makeDefaultPartialCalendarSource(dropdown.getValue() as CalendarInfo['type']),
            directories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
            headings,
            submit: async (source: CalendarInfo) => {
              if (source.type === 'caldav') {
                try {
                  let sources = await importCalendars(
                    {
                      type: 'basic',
                      username: source.username,
                      password: source.password
                    },
                    source.url
                  );
                  sources.forEach(source => submitCallback(source));
                } catch (e) {
                  if (e instanceof Error) {
                    new Notice(e.message);
                  }
                }
              } else {
                submitCallback(source);
              }
              modal.close();
            }
          });
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Calendar Preferences' });
    new Setting(containerEl)
      .setName('Desktop Initial View')
      .setDesc('Choose the initial view range on desktop devices.')
      .addDropdown(dropdown => {
        Object.entries(INITIAL_VIEW_OPTIONS.DESKTOP).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.plugin.settings.initialView.desktop);
        dropdown.onChange(async initialView => {
          this.plugin.settings.initialView.desktop = initialView;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Mobile Initial View')
      .setDesc('Choose the initial view range on mobile devices.')
      .addDropdown(dropdown => {
        Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.plugin.settings.initialView.mobile);
        dropdown.onChange(async initialView => {
          this.plugin.settings.initialView.mobile = initialView;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Starting Day of the Week')
      .setDesc('Choose what day of the week to start.')
      .addDropdown(dropdown => {
        WEEKDAYS.forEach((day, code) => {
          dropdown.addOption(code.toString(), day);
        });
        dropdown.setValue(this.plugin.settings.firstDay.toString());
        dropdown.onChange(async codeAsString => {
          this.plugin.settings.firstDay = Number(codeAsString);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Display Timezone')
      .setDesc(
        'Choose the timezone for displaying events. Defaults to your system timezone. Changing this will reload the calendar.'
      )
      .addDropdown(dropdown => {
        const timezones = Intl.supportedValuesOf('timeZone');
        timezones.forEach(tz => {
          dropdown.addOption(tz, tz);
        });
        // Ensure displayTimezone is not null before setting the value
        dropdown.setValue(
          this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        );
        dropdown.onChange(async newTimezone => {
          this.plugin.settings.displayTimezone = newTimezone;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('24-hour format')
      .setDesc('Display the time in a 24-hour format.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.timeFormat24h);
        toggle.onChange(async val => {
          this.plugin.settings.timeFormat24h = val;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Click on a day in month view to create event')
      .setDesc('Switch off to open day view on click instead.')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.clickToCreateEventFromMonthView);
        toggle.onChange(async val => {
          this.plugin.settings.clickToCreateEventFromMonthView = val;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl('h2', { text: 'Manage Calendars' });

    const sourcesDiv = containerEl.createDiv();
    sourcesDiv.style.display = 'block';

    const calendarSettingsRef = createRef<CalendarSettings>();
    const root = ReactDOM.createRoot(sourcesDiv);
    root.render(
      <CalendarSettings
        ref={calendarSettingsRef}
        sources={this.plugin.settings.calendarSources}
        submit={async (settings: CalendarInfo[]) => {
          this.plugin.settings.calendarSources = settings;
          await this.plugin.saveSettings();
        }}
      />
    );

    addCalendarButton(
      this.app,
      this.plugin,
      containerEl,
      async (source: CalendarInfo) => {
        calendarSettingsRef.current?.addSource(source);
      },
      () => calendarSettingsRef.current?.getUsedDirectories() ?? []
    );
  }
}
