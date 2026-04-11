/**
 * @file renderGeneral.ts
 * @brief Renders the general settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs } from '../docsLinks';

const INITIAL_VIEW_OPTIONS = {
  DESKTOP: {
    timeGridDay: 'settings.viewOptions.day',
    timeGridWeek: 'settings.viewOptions.week',
    dayGridMonth: 'settings.viewOptions.month',
    listWeek: 'settings.viewOptions.list'
  },
  MOBILE: {
    dayGridMonth: 'settings.viewOptions.month',
    timeGrid3Days: 'settings.viewOptions.threeDays',
    timeGridDay: 'settings.viewOptions.day',
    listWeek: 'settings.viewOptions.list'
  }
};

export function renderGeneralSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const desktopViewOptions: { [key: string]: string } = { ...INITIAL_VIEW_OPTIONS.DESKTOP };
  if (plugin.settings.enableAdvancedCategorization) {
    desktopViewOptions['resourceTimelineWeek'] = 'settings.viewOptions.timelineWeek';
    desktopViewOptions['resourceTimelineDay'] = 'settings.viewOptions.timelineDay';
  }

  new Setting(containerEl)
    .setName(t('settings.general.desktopInitialView.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.desktopInitialView.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    )
    .addDropdown(dropdown => {
      Object.entries(desktopViewOptions).forEach(([value, labelKey]) => {
        dropdown.addOption(value, t(labelKey));
      });
      dropdown.setValue(plugin.settings.initialView.desktop);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.desktop = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.mobileInitialView.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.mobileInitialView.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    )
    .addDropdown(dropdown => {
      Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, labelKey]) => {
        dropdown.addOption(value, t(labelKey));
      });
      dropdown.setValue(plugin.settings.initialView.mobile);
      dropdown.onChange(async initialView => {
        plugin.settings.initialView.mobile = initialView;
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.displayTimezone.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.displayTimezone.description'), [
        { text: 'Timezone support', path: 'user/events/timezones' }
      ])
    )
    .addDropdown(dropdown => {
      const timezones = Intl.supportedValuesOf('timeZone'); // ['Europe/Bucharest', 'Europe/Zagreb'];
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
    .setName(t('settings.general.clickToCreateEvent.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.clickToCreateEvent.description'), [
        { text: 'Interactions and gestures', path: 'user/guides/interactions' },
        { text: 'Event management', path: 'user/events/manage' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.clickToCreateEventFromMonthView);
      toggle.onChange(async val => {
        plugin.settings.clickToCreateEventFromMonthView = val;
        await plugin.saveSettings();
      });
    });
}
