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
  setIcon,
  Setting,
  TFile,
  TFolder
} from 'obsidian';

import ReactModal from '../ReactModal';
import * as ReactDOM from 'react-dom/client';
import React, { createElement, createRef } from 'react';

import { CalendarSettingsRef } from './sections/calendars/CalendarSetting';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { CalendarInfo } from '../../types/calendar_settings';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { makeDefaultPartialCalendarSource } from '../../types/calendar_settings';

import { generateCalendarId } from '../../types/calendar_settings';
import { t } from '../../features/i18n/i18n';
import { createDocsLinksFragment } from './docsLinks';

// Import the new React components
import './changelogs/changelog.css';

type SettingsCategoryId = 'general' | 'appearance' | 'calendars' | 'organization' | 'integrations';

interface SettingsCategory {
  id: SettingsCategoryId;
}

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'general'
  },
  {
    id: 'appearance'
  },
  {
    id: 'calendars'
  },
  {
    id: 'organization'
  },
  {
    id: 'integrations'
  }
];

function getCategoryLabel(id: SettingsCategoryId): string {
  switch (id) {
    case 'general':
      return t('settings.categories.general.label');
    case 'appearance':
      return t('settings.categories.appearance.label');
    case 'calendars':
      return t('settings.categories.calendars.label');
    case 'organization':
      return t('settings.categories.organization.label');
    case 'integrations':
      return t('settings.categories.integrations.label');
  }
}

function getCategoryDescription(id: SettingsCategoryId): string {
  switch (id) {
    case 'general':
      return t('settings.categories.general.description');
    case 'appearance':
      return t('settings.categories.appearance.description');
    case 'calendars':
      return t('settings.categories.calendars.description');
    case 'organization':
      return t('settings.categories.organization.description');
    case 'integrations':
      return t('settings.categories.integrations.description');
  }
}

export function addCalendarButton(
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;

  return new Setting(containerEl)
    .setName(t('settings.calendars.title'))
    .setDesc(t('settings.calendars.addCalendar'))
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: t('settings.calendars.types.local'),
          dailynote: t('settings.calendars.types.dailynote'),
          icloud: t('settings.calendars.types.icloud'),
          caldav: t('settings.calendars.types.caldav'),
          ical: t('settings.calendars.types.ical'),
          google: t('settings.calendars.types.google'),
          tasks: t('settings.calendars.types.tasks'),
          bases: t('settings.calendars.types.bases')
        }))
    )
    .addExtraButton(button => {
      button.setTooltip(t('settings.calendars.addCalendarTooltip'));
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();

        if (sourceType === 'bases') {
          const app = plugin.app as unknown as {
            internalPlugins?: { getPluginById: (id: string) => unknown };
            plugins?: { getPlugin: (id: string) => unknown };
          };
          const basesPlugin =
            app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases');
          if (!basesPlugin) {
            new Notice(t('modals.workspace.fields.notices.enableBases'));
            return;
          }
        }

        const providerType = sourceType === 'icloud' ? 'caldav' : sourceType;

        const providerClass = await plugin.providerRegistry.getProviderForType(providerType);
        if (!providerClass) {
          new Notice(t('notices.providerNotRegistered', { providerType }));
          return;
        }
        // Provider classes expose a static getConfigurationComponent; keep a loose unknown cast locally.
        const ConfigComponent = (
          providerClass as unknown as {
            // Providers expose a static method returning a React component.
            getConfigurationComponent(): React.ComponentType<Record<string, unknown>>;
          }
        ).getConfigurationComponent();

        const modal = new ReactModal(plugin.app, async () => {
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
          // Minimal shared config component props; provider-specific components can accept additional fields.
          interface BaseConfigProps {
            plugin: FullCalendarPlugin;
            config: Record<string, unknown>;
            context: {
              allDirectories: string[];
              usedDirectories: string[];
              headings: string[];
            };
            onClose: () => void;
            onConfigChange: (c: Record<string, unknown>) => void;
            onSave: (
              finalConfigs: Record<string, unknown> | Record<string, unknown>[],
              accountId?: string
            ) => void;
          }
          const componentProps: BaseConfigProps = {
            plugin: plugin, // Pass plugin for GoogleConfigComponent
            config: initialConfig,
            context: {
              allDirectories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
              usedDirectories: usedDirectories,
              headings: headings
            },
            onClose: () => modal.close(),
            onConfigChange: (): void => {
              /* no-op */
            },
            onSave: (
              finalConfigs: Record<string, unknown> | Record<string, unknown>[],
              accountId?: string
            ): void => {
              void (async () => {
                const configs = Array.isArray(finalConfigs) ? finalConfigs : [finalConfigs];
                const existingIds = plugin.settings.calendarSources.map(s => s.id);

                for (const finalConfig of configs) {
                  const newSettingsId = generateCalendarId(
                    providerType as CalendarInfo['type'],
                    existingIds
                  );
                  existingIds.push(newSettingsId);

                  const partialSource = makeDefaultPartialCalendarSource(
                    providerType as CalendarInfo['type'],
                    existingCalendarColors
                  );

                  // Create the full, valid CalendarInfo object first.
                  const finalSource = {
                    ...partialSource,
                    ...finalConfig,
                    id: newSettingsId,
                    ...(accountId && { googleAccountId: accountId }),
                    // For Google, the config's 'id' is the calendarId for the API.
                    ...(providerType === 'google' && { calendarId: finalConfig.id as string })
                  } as CalendarInfo;

                  // Add the provider instance to the registry BEFORE updating the UI.
                  await plugin.providerRegistry.addInstance(finalSource);

                  // Now, submit the complete source to the React component.
                  submitCallback(finalSource);
                  existingCalendarColors.push(finalSource.color);
                }
                modal.close();
              })();
            }
          };

          return createElement(
            ConfigComponent,
            componentProps as unknown as Record<string, unknown>
          );
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;
  private showFullChangelog = false;
  private activeCategory: SettingsCategoryId = 'general';
  private searchQuery = '';
  private searchExpanded = false;
  private searchDebounceId: number | null = null;
  private calendarSettingsRef: React.RefObject<CalendarSettingsRef | null> =
    createRef<CalendarSettingsRef>();
  registry: ProviderRegistry;

  constructor(app: App, plugin: FullCalendarPlugin, registry: ProviderRegistry) {
    super(app, plugin);
    this.plugin = plugin;
    this.registry = registry;
  }

  display(): void {
    void (async () => {
      this.containerEl.empty();
      if (this.showFullChangelog) {
        await this._renderFullChangelog();
      } else {
        await this._renderMainSettings();
      }
    })();
  }

  public showChangelog(): void {
    this.showFullChangelog = true;
    void this.display();
  }

  private async _renderFullChangelog(): Promise<void> {
    const root = ReactDOM.createRoot(this.containerEl);
    const { Changelog } = await import('./changelogs/Changelog');
    root.render(
      createElement(Changelog, {
        onBack: () => {
          this.showFullChangelog = false;
          void this.display();
        }
      })
    );
  }

  private async _renderMainSettings(): Promise<void> {
    const shellEl = this.containerEl.createDiv('full-calendar-settings-shell');
    const headerEl = shellEl.createDiv('full-calendar-settings-header');
    headerEl.createEl('p', {
      text: 'Switch between focused setting groups to keep configuration lighter and easier to scan.'
    });

    const tabsRowEl = shellEl.createDiv('full-calendar-settings-tabs-row');
    tabsRowEl.setCssProps({
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: '12px'
    });

    const tabsEl = tabsRowEl.createDiv('full-calendar-settings-tabs');
    SETTINGS_CATEGORIES.forEach(category => {
      const isActive = category.id === this.activeCategory;
      const button = tabsEl.createEl('button', {
        cls: `full-calendar-settings-tab${isActive ? ' is-active' : ''}`,
        text: getCategoryLabel(category.id)
      });
      button.type = 'button';
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (this.activeCategory === category.id) {
          return;
        }
        this.activeCategory = category.id;
        void this.display();
      });
    });

    const contentEl = shellEl.createDiv('full-calendar-settings-content');

    const searchWrapEl = tabsRowEl.createDiv('full-calendar-settings-search-wrap');
    searchWrapEl.setCssProps({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      position: 'relative'
    });

    const searchButtonEl = searchWrapEl.createEl('button', {
      cls: 'clickable-icon full-calendar-settings-search-trigger'
    });
    searchButtonEl.type = 'button';
    searchButtonEl.ariaLabel = 'Search settings';
    searchButtonEl.setCssProps({
      border: '1px solid var(--background-modifier-border)',
      'border-radius': '8px',
      padding: '4px',
      'background-color': 'var(--background-secondary-alt)'
    });
    setIcon(searchButtonEl, 'search');

    const inputWrapEl = searchWrapEl.createDiv('full-calendar-settings-search-input-wrap');
    inputWrapEl.setCssProps({
      position: 'relative',
      width: this.searchExpanded || this.searchQuery ? '170px' : '0px',
      overflow: 'hidden',
      transition: 'width 140ms ease'
    });

    const searchInputEl = inputWrapEl.createEl('input', {
      cls: 'full-calendar-settings-search-input'
    });
    searchInputEl.type = 'text';
    searchInputEl.placeholder = 'Search settings...';
    searchInputEl.value = this.searchQuery;
    searchInputEl.setCssProps({
      width: '100%',
      padding: '6px 28px 6px 10px',
      'border-radius': '8px',
      border: '1px solid var(--background-modifier-border)'
    });

    const clearButtonEl = inputWrapEl.createEl('button', {
      cls: 'clickable-icon full-calendar-settings-search-clear'
    });
    clearButtonEl.type = 'button';
    clearButtonEl.ariaLabel = 'Clear search';
    clearButtonEl.setCssProps({
      position: 'absolute',
      right: '6px',
      top: '50%',
      transform: 'translateY(-50%)',
      display: this.searchQuery ? 'inline-flex' : 'none'
    });
    setIcon(clearButtonEl, 'x');

    const renderSearchResults = () => {
      void this._renderSettingsContent(contentEl);
      clearButtonEl.setCssProps({ display: this.searchQuery ? 'inline-flex' : 'none' });
      searchButtonEl.setCssProps({
        display: this.searchExpanded || !!this.searchQuery ? 'none' : 'inline-flex'
      });
      searchButtonEl.toggleClass('is-active', this.searchExpanded || !!this.searchQuery);
      inputWrapEl.toggleClass('is-active-query', !!this.searchQuery);
    };

    searchButtonEl.addEventListener('click', () => {
      this.searchExpanded = true;
      inputWrapEl.setCssProps({ width: '170px' });
      searchButtonEl.setCssProps({ display: 'none' });
      searchInputEl.focus();
      searchButtonEl.toggleClass('is-active', true);
    });

    searchInputEl.addEventListener('blur', () => {
      if (this.searchQuery) return;
      this.searchExpanded = false;
      inputWrapEl.setCssProps({ width: '0px' });
      searchButtonEl.setCssProps({ display: 'inline-flex' });
      searchButtonEl.toggleClass('is-active', false);
    });

    searchInputEl.addEventListener('input', () => {
      this.searchQuery = searchInputEl.value;
      if (this.searchDebounceId !== null) {
        window.clearTimeout(this.searchDebounceId);
      }
      this.searchDebounceId = window.setTimeout(renderSearchResults, 80);
    });

    clearButtonEl.addEventListener('mousedown', evt => {
      evt.preventDefault();
      this.searchQuery = '';
      searchInputEl.value = '';
      renderSearchResults();
      searchInputEl.focus();
    });

    await this._renderSettingsContent(contentEl);

    const { renderFooter } = await import('./sections/calendars/renderFooter');
    renderFooter(shellEl);
  }

  private async _renderSettingsContent(containerEl: HTMLElement): Promise<void> {
    containerEl.empty();
    const query = this.searchQuery.trim();

    if (!query) {
      const activeCategory = SETTINGS_CATEGORIES.find(
        category => category.id === this.activeCategory
      );
      const introEl = containerEl.createDiv('full-calendar-settings-category-intro');
      if (activeCategory) {
        introEl.createEl('p', { text: getCategoryDescription(activeCategory.id) });
      }
      const panelEl = containerEl.createDiv('full-calendar-settings-panel');
      await this._renderActiveCategory(panelEl, this.activeCategory);
      return;
    }

    let hasAnyMatches = false;
    for (const category of SETTINGS_CATEGORIES) {
      const sectionEl = containerEl.createDiv('full-calendar-settings-search-section');
      const introEl = sectionEl.createDiv('full-calendar-settings-category-intro');
      new Setting(introEl).setName(getCategoryLabel(category.id)).setHeading();
      introEl.createEl('p', { text: getCategoryDescription(category.id) });

      const panelEl = sectionEl.createDiv('full-calendar-settings-panel');
      await this._renderActiveCategory(panelEl, category.id);

      const sectionHasMatches = this._applySearchFilter(panelEl, query);
      if (!sectionHasMatches) {
        sectionEl.remove();
      } else {
        hasAnyMatches = true;
      }
    }

    if (!hasAnyMatches) {
      const emptyEl = containerEl.createDiv('full-calendar-settings-search-empty');
      emptyEl.createEl('p', {
        text: `No settings match "${query}".`
      });
    }
  }

  private _applySearchFilter(containerEl: HTMLElement, query: string): boolean {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const settingEls = Array.from(containerEl.querySelectorAll<HTMLElement>('.setting-item'));

    let visibleCount = 0;
    settingEls.forEach(settingEl => {
      const titleEl = settingEl.querySelector<HTMLElement>('.setting-item-name');
      const descriptionEl = settingEl.querySelector<HTMLElement>('.setting-item-description');
      const title = titleEl?.textContent ?? '';
      const description = descriptionEl?.textContent ?? '';
      const haystack = `${title} ${description}`.toLowerCase();

      // Strict search: every token must appear in visible title/description text.
      const isMatch = tokens.every(token => haystack.includes(token));
      settingEl.setCssProps({ display: isMatch ? '' : 'none' });
      if (isMatch) {
        this._highlightSearchTokens(titleEl, tokens);
        this._highlightSearchTokens(descriptionEl, tokens);
        visibleCount += 1;
      }
    });

    return visibleCount > 0;
  }

  private _highlightSearchTokens(el: HTMLElement | null, tokens: string[]): void {
    if (!el) {
      return;
    }
    const rawText = el.textContent ?? '';
    if (!rawText || tokens.length === 0) {
      return;
    }

    const escapedTokens = tokens
      .filter(Boolean)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escapedTokens.length === 0) {
      return;
    }

    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of rawText.matchAll(regex)) {
      const matchText = match[0];
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) {
        continue;
      }

      if (matchIndex > lastIndex) {
        fragment.append(rawText.slice(lastIndex, matchIndex));
      }

      const markEl = document.createElement('mark');
      markEl.textContent = matchText;
      fragment.append(markEl);
      lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < rawText.length) {
      fragment.append(rawText.slice(lastIndex));
    }

    el.empty();
    el.append(fragment);
  }

  private async _renderActiveCategory(
    containerEl: HTMLElement,
    categoryId: SettingsCategoryId
  ): Promise<void> {
    switch (categoryId) {
      case 'general': {
        const [{ renderGeneralSettings }, { renderRemindersSettings }, { renderWhatsNew }] =
          await Promise.all([
            import('./sections/renderGeneral'),
            import('../../features/notifications/ui/renderReminders'),
            import('./changelogs/renderWhatsNew')
          ]);

        this._renderInitialSetupNotice(containerEl);
        renderGeneralSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        renderRemindersSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        renderWhatsNew(containerEl, () => {
          this.showFullChangelog = true;
          void this.display();
        });
        break;
      }
      case 'appearance': {
        const [{ renderAppearanceSettings }] = await Promise.all([
          import('./sections/renderAppearance')
        ]);
        renderAppearanceSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        break;
      }
      case 'calendars': {
        const [{ renderCalendarManagement }] = await Promise.all([
          import('./sections/renderCalendars')
        ]);
        renderCalendarManagement(
          containerEl,
          this.plugin,
          this.calendarSettingsRef as unknown as React.RefObject<CalendarSettingsRef>
        );
        break;
      }
      case 'organization': {
        const [{ renderWorkspaceSettings }, { renderCategorizationSettings }] = await Promise.all([
          import('../../features/workspaces/ui/renderWorkspaces'),
          import('../../features/category/ui/renderCategorization')
        ]);

        renderWorkspaceSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        renderCategorizationSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        break;
      }
      case 'integrations': {
        const [{ renderActivityWatchSettings }, { renderGoogleSettings }] = await Promise.all([
          import('../../features/activitywatch/ui/renderActivityWatch'),
          import('../../providers/google/ui/renderGoogle')
        ]);

        renderActivityWatchSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        renderGoogleSettings(containerEl, this.plugin, () => {
          void this.display();
        });
        break;
      }
    }
  }

  private _renderInitialSetupNotice(containerEl: HTMLElement): void {
    if (this.plugin.settings.calendarSources.length === 0) {
      const notice = containerEl.createDiv('full-calendar-initial-setup-notice');
      new Setting(notice).setName('').setHeading();
      notice.createEl('p', {
        text: t('settings.quickStart.description')
      });
      const docsPara = notice.createEl('p');
      docsPara.append(
        createDocsLinksFragment([
          { text: 'Onboarding and daily use', path: 'user/guides/onboarding-and-daily-use' },
          { text: 'Calendar types', path: 'user/calendars/index' },
          { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
        ])
      );
    }
  }
}

// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
