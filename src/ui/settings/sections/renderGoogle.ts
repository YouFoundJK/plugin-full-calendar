// src/ui/settings/sections/renderGoogle.ts

/**
 * @file renderGoogle.ts
 * @brief Renders the Google Calendar integration settings section.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';

export function renderGoogleSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName('Google calendar integration').setHeading();

  new Setting(containerEl)
    .setName('Use custom Google Cloud credentials')
    .setDesc(
      (() => {
        const fragment = document.createDocumentFragment();
        fragment.appendText(
          'Use your own Google Cloud project for authentication for privacy and avoiding rate limits. '
        );
        fragment.createEl('a', {
          text: 'Check here ',
          href: 'https://youfoundjk.github.io/plugin-full-calendar/calendars/gcal'
        });
        fragment.appendText('on how to set it up.');
        return fragment;
      })()
    )
    .addToggle(toggle => {
      toggle.setValue(plugin.settings.useCustomGoogleClient).onChange(async value => {
        plugin.settings.googleAuth = null;
        plugin.settings.useCustomGoogleClient = value;
        await plugin.saveSettings();
        rerender();
      });
    });

  if (plugin.settings.useCustomGoogleClient) {
    new Setting(containerEl).setName('Google Client ID').addText(text =>
      text
        .setPlaceholder('Enter your Client ID')
        .setValue(plugin.settings.googleClientId)
        .onChange(async value => {
          plugin.settings.googleClientId = value.trim();
          await plugin.saveData(plugin.settings);
        })
    );
    new Setting(containerEl).setName('Google Client Secret').addText(text =>
      text
        .setPlaceholder('Enter your Client Secret')
        .setValue(plugin.settings.googleClientSecret)
        .onChange(async value => {
          plugin.settings.googleClientSecret = value.trim();
          await plugin.saveData(plugin.settings);
        })
    );
  }
}
