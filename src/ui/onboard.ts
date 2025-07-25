/**
 * @file onboard.ts
 * @brief Renders the initial onboarding screen for new users.
 *
 * @description
 * This file contains the logic to display a helpful message and a call-to-action
 * when a user has the plugin enabled but has not yet configured any calendar
 * sources. It guides the user to create their first calendar.
 *
 * @license See LICENSE.md
 */

import { App } from 'obsidian';
import FullCalendarPlugin from '../main';
import { addCalendarButton } from './settings';
import { CalendarInfo } from '../types';

export function renderOnboarding(app: App, plugin: FullCalendarPlugin, el: HTMLElement) {
  el.style.height = '100%';
  const nocal = el.createDiv();
  nocal.style.height = '100%';
  nocal.style.display = 'flex';
  nocal.style.alignItems = 'center';
  nocal.style.justifyContent = 'center';
  const notice = nocal.createDiv();
  notice.createEl('h1').textContent = 'No calendar available';
  notice.createEl('p').textContent =
    'Thanks for downloading Full Calendar! Create a calendar below to begin.';

  const container = notice.createDiv();
  container.style.position = 'fixed';
  addCalendarButton(app, plugin, container, async (source: CalendarInfo) => {
    const { calendarSources } = plugin.settings;
    calendarSources.push(source);
    await plugin.saveSettings();
    await plugin.activateView();
  });
}
