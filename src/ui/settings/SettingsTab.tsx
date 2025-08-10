/**
 * @file SettingsTab.tsx
 * @brief Implements the Full Calendar plugin's settings tab UI for Obsidian.
 *
 * @description
 * This file defines the `FullCalendarSettingTab` class, which extends Obsidian's
 * `PluginSettingTab`. It acts as an orchestrator, calling dedicated rendering
 * modules for each section of the settings UI and managing the top-level view
 * state (e.g., switching between main settings and the full changelog).
 *
 * @exports FullCalendarSettingTab
 * @exports ensureCalendarIds
 *
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../main';
import {
  App,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  Modal
} from 'obsidian';

import ReactModal from '../ReactModal';
import * as ReactDOM from 'react-dom/client';
import { createElement, createRef } from 'react';

import { getNextColor } from '../colors';
import { CalendarSettingsRef } from './components/CalendarSetting';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { importCalendars } from '../../calendars/parsing/caldav/import';
import { fetchGoogleCalendarList } from '../../calendars/parsing/google/api';
import { makeDefaultPartialCalendarSource, CalendarInfo } from '../../types/calendar_settings';
import { ProviderRegistry } from '../../core/ProviderRegistry';
import { ProviderConfigContext } from '../../providers/typesProvider';

// Import the new section renderers
import { renderGoogleSettings } from './sections/renderGoogle';
import { renderGeneralSettings } from './sections/renderGeneral';
import { renderCalendarManagement } from './sections/renderCalendars';
import { renderCategorizationSettings } from './sections/renderCategorization';
import { renderAppearanceSettings } from './sections/renderAppearance';
import { renderWorkspaceSettings } from './sections/renderWorkspaces';

// Import the new React components
import './changelog.css';
import { renderFooter } from './components/renderFooter';
import { Changelog } from './components/Changelog';
import { renderWhatsNew } from './sections/renderWhatsNew';

export function addCalendarButton(
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;
  const directories = plugin.app.vault
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
          ical: 'Remote (.ics format)',
          google: 'Google Calendar'
        }))
    )
    .addExtraButton(button => {
      button.setTooltip('Add Calendar');
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();
        const providerType = sourceType === 'icloud' ? 'caldav' : sourceType;

        const provider = plugin.providerRegistry.getProvider(providerType);
        if (!provider) {
          // This path should ideally not be hit if dropdown options are aligned with registered providers.
          new Notice(`${providerType} provider is not registered.`);
          return;
        }

        const ConfigComponent = provider.getConfigurationComponent();
        let modal = new ReactModal(plugin.app, async () => {
          await plugin.loadSettings();

          const usedDirectories = listUsedDirectories ? listUsedDirectories() : [];
          const directories = plugin.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .map(f => f.path);

          let headings: string[] = [];
          let { template } = getDailyNoteSettings();
          if (template) {
            if (!template.endsWith('.md')) template += '.md';
            const file = plugin.app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings =
                plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          const existingCalendarColors = plugin.settings.calendarSources.map(s => s.color);

          const initialConfig = sourceType === 'icloud' ? { url: 'https://caldav.icloud.com' } : {};

          // Base props for all provider components
          const componentProps: any = {
            config: initialConfig,
            context: {
              allDirectories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
              usedDirectories: usedDirectories,
              headings: headings
            },
            onClose: () => modal.close(),
            onSave: (finalConfigs: any | any[]) => {
              // `any` to handle single or array return
              const configs = Array.isArray(finalConfigs) ? finalConfigs : [finalConfigs];

              configs.forEach((finalConfig: any) => {
                const newColor = getNextColor(existingCalendarColors);
                existingCalendarColors.push(newColor);

                const finalSource = {
                  // FIX: This object is the new format, which is okay.
                  // The `submitCallback` will add it to settings.
                  // The adapter and legacy classes will handle parsing it.
                  provider: providerType,
                  config: finalConfig,
                  type: providerType,
                  name:
                    finalConfig.name ||
                    (finalConfig as any).directory ||
                    `Daily note under "${(finalConfig as any).heading}"`,
                  id: '', // Will be generated by ensureCalendarIds
                  // Use color from provider (Google/CalDAV) or generate a new one.
                  color: finalConfig.color || newColor
                };
                submitCallback(finalSource as unknown as CalendarInfo);
              });
              modal.close();
            }
          };

          // Add provider-specific props
          if (providerType === 'google') {
            componentProps.plugin = plugin;
          }

          return createElement(ConfigComponent, componentProps);
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;
  private showFullChangelog = false;
  private calendarSettingsRef: React.RefObject<CalendarSettingsRef | null> =
    createRef<CalendarSettingsRef>();
  registry: ProviderRegistry;

  constructor(app: App, plugin: FullCalendarPlugin, registry: ProviderRegistry) {
    super(app, plugin);
    this.plugin = plugin;
    this.registry = registry;
  }

  display(): void {
    this.containerEl.empty();
    if (this.showFullChangelog) {
      this._renderFullChangelog();
    } else {
      this._renderMainSettings();
    }
  }

  private _renderFullChangelog(): void {
    const root = ReactDOM.createRoot(this.containerEl);
    root.render(
      createElement(Changelog, {
        onBack: () => {
          this.showFullChangelog = false;
          this.display();
        }
      })
    );
  }

  private _renderMainSettings(): void {
    renderGeneralSettings(this.containerEl, this.plugin, () => this.display());
    renderAppearanceSettings(this.containerEl, this.plugin, () => this.display());
    renderWorkspaceSettings(this.containerEl, this.plugin, () => this.display());
    renderCategorizationSettings(this.containerEl, this.plugin, () => this.display());
    renderWhatsNew(this.containerEl, () => {
      this.showFullChangelog = true;
      this.display();
    });
    renderCalendarManagement(
      this.containerEl,
      this.plugin,
      this.calendarSettingsRef as unknown as React.RefObject<CalendarSettingsRef>
    );
    renderGoogleSettings(this.containerEl, this.plugin, () => this.display());
    this._renderInitialSetupNotice();
    renderFooter(this.containerEl);
  }

  private _renderInitialSetupNotice(): void {
    if (this.plugin.settings.calendarSources.length === 0) {
      const notice = this.containerEl.createDiv('full-calendar-initial-setup-notice');
      notice.createEl('h2', { text: 'Quick Start: Add Your First Calendar' });
      notice.createEl('p', {
        text: 'To begin, add a calendar source using the "+" button in the "Manage calendars" section.'
      });
    }
  }
}

// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.

class SelectGoogleCalendarsModal extends Modal {
  plugin: FullCalendarPlugin;
  calendars: any[];
  onSubmit: (selected: CalendarInfo[]) => void;
  googleCalendarSelection: Set<string>;

  constructor(
    plugin: FullCalendarPlugin,
    calendars: any[],
    onSubmit: (selected: CalendarInfo[]) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.calendars = calendars;
    this.onSubmit = onSubmit;
    this.googleCalendarSelection = new Set();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select Google Calendars to Add' });

    const existingGoogleCalendarIds = new Set(
      this.plugin.settings.calendarSources
        .filter(s => s.type === 'google')
        .map(s => (s as Extract<CalendarInfo, { type: 'google' }>).id)
    );

    this.calendars.forEach(cal => {
      if (!cal.id || existingGoogleCalendarIds.has(cal.id)) {
        return;
      }

      new Setting(contentEl)
        .setName(cal.summary || cal.id)
        .setDesc(cal.description || '')
        .addToggle(toggle =>
          toggle.onChange(value => {
            if (value) {
              this.googleCalendarSelection.add(cal.id);
            } else {
              this.googleCalendarSelection.delete(cal.id);
            }
          })
        );
    });

    new Setting(contentEl).addButton(button =>
      button
        .setButtonText('Add Selected Calendars')
        .setCta()
        .onClick(() => {
          const existingColors = this.plugin.settings.calendarSources.map(s => s.color);

          const selectedCalendars = this.calendars
            .filter(cal => this.googleCalendarSelection.has(cal.id))
            .map(cal => {
              const newColor = getNextColor(existingColors);
              existingColors.push(newColor);

              const newCalendar: Extract<CalendarInfo, { type: 'google' }> = {
                type: 'google',
                id: cal.id,
                name: cal.summary,
                color: cal.backgroundColor || newColor
              };
              return newCalendar;
            });

          this.onSubmit(selectedCalendars);
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
