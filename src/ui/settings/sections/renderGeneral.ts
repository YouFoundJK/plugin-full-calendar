/**
 * @file renderGeneral.ts
 * @brief Renders the general settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';

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

export function renderGeneralSettings(containerEl: HTMLElement, plugin: FullCalendarPlugin): void {
  const desktopViewOptions: { [key: string]: string } = { ...INITIAL_VIEW_OPTIONS.DESKTOP };
  if (plugin.settings.enableAdvancedCategorization) {
    desktopViewOptions['resourceTimelineWeek'] = 'Timeline Week';
    desktopViewOptions['resourceTimelineDay'] = 'Timeline Day';
  }

  new Setting(containerEl)
    .setName('Desktop initial view')
    .setDesc('Choose the initial view range on desktop devices.')
    .addDropdown(dropdown => {
      Object.entries(desktopViewOptions).forEach(([value, display]) => {
        dropdown.addOption(value, display);
      });
      dropdown.setValue(plugin.settings.initialView.desktop);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.desktop = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Mobile initial view')
    .setDesc('Choose the initial view range on mobile devices.')
    .addDropdown(dropdown => {
      Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, display]) => {
        dropdown.addOption(value, display);
      });
      dropdown.setValue(plugin.settings.initialView.mobile);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.mobile = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Starting day of the week')
    .setDesc('Choose what day of the week to start.')
    .addDropdown(dropdown => {
      WEEKDAYS.forEach((day, code) => {
        dropdown.addOption(code.toString(), day);
      });
      dropdown.setValue(plugin.settings.firstDay.toString());
      dropdown.onChange(async codeAsString => {
        plugin.settings.firstDay = Number(codeAsString);
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Daily note timezone')
    .setDesc(
      'Choose how times in daily notes are handled. "Local" means times are relative to your computer\'s current timezone. "Strict" will anchor events to the display timezone, writing it to the note.'
    )
    .addDropdown(dropdown => {
      dropdown
        .addOption('local', 'Local (Flexible)')
        .addOption('strict', 'Strict (Anchored to display timezone)');
      dropdown.setValue(plugin.settings.dailyNotesTimezone);
      dropdown.onChange(async value => {
        plugin.settings.dailyNotesTimezone = value as 'local' | 'strict';
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Display timezone')
    .setDesc(
      'Choose the timezone for displaying events. Defaults to your system timezone. Changing this will reload the calendar.'
    )
    .addDropdown(dropdown => {
      const timezones = Intl.supportedValuesOf('timeZone');
      timezones.forEach(tz => {
        dropdown.addOption(tz, tz);
      });
      dropdown.setValue(
        plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      dropdown.onChange(async newTimezone => {
        plugin.settings.displayTimezone = newTimezone;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('24-hour format')
    .setDesc('Display the time in a 24-hour format.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.timeFormat24h);
      toggle.onChange(async val => {
        plugin.settings.timeFormat24h = val;
        await plugin.saveSettings();
      });
    });

  // Business Hours Settings
  new Setting(containerEl)
    .setName('Enable business hours')
    .setDesc('Highlight your working hours in time-grid views to distinguish work time from personal time.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.businessHours.enabled);
      toggle.onChange(async val => {
        plugin.settings.businessHours.enabled = val;
        await plugin.saveSettings();
      });
    });

  if (plugin.settings.businessHours.enabled) {
    new Setting(containerEl)
      .setName('Business days')
      .setDesc('Select which days of the week are business days.')
      .addDropdown(dropdown => {
        dropdown
          .addOption('1,2,3,4,5', 'Monday - Friday')
          .addOption('0,1,2,3,4,5,6', 'Every day')
          .addOption('1,2,3,4', 'Monday - Thursday')
          .addOption('2,3,4,5,6', 'Tuesday - Saturday');
        
        const currentDays = plugin.settings.businessHours.daysOfWeek.join(',');
        dropdown.setValue(currentDays);
        dropdown.onChange(async value => {
          plugin.settings.businessHours.daysOfWeek = value.split(',').map(Number);
          await plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Business hours start time')
      .setDesc('When your working day begins (format: HH:mm)')
      .addText(text => {
        text.setValue(plugin.settings.businessHours.startTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            plugin.settings.businessHours.startTime = value;
            await plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName('Business hours end time')
      .setDesc('When your working day ends (format: HH:mm)')
      .addText(text => {
        text.setValue(plugin.settings.businessHours.endTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            plugin.settings.businessHours.endTime = value;
            await plugin.saveSettings();
          }
        });
      });
  }

  new Setting(containerEl)
    .setName('Enable background events')
    .setDesc('Allow events to be displayed as background elements for things like vacations, focus time, or class schedules.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.enableBackgroundEvents);
      toggle.onChange(async val => {
        plugin.settings.enableBackgroundEvents = val;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName('Click on a day in month view to create event')
    .setDesc('Switch off to open day view on click instead.')
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.clickToCreateEventFromMonthView);
      toggle.onChange(async val => {
        plugin.settings.clickToCreateEventFromMonthView = val;
        await plugin.saveSettings();
      });
    });
}
