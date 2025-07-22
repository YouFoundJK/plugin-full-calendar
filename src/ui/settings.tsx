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
  TFolder,
  Modal, // Import Modal
  TextComponent // Import TextComponent
} from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement, createRef } from 'react';

import ReactModal from './ReactModal';
import { AddCalendarSource } from './components/AddCalendarSource';
import { importCalendars } from '../calendars/parsing/caldav/import';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { makeDefaultPartialCalendarSource, CalendarInfo } from '../types';
import { CalendarSettings, CalendarSettingsRef } from './components/CalendarSetting';
import { changelogData } from './changelogData';
import './changelog.css';
import { CategorySettingsManager } from './components/CategorySetting';

export interface FullCalendarSettings {
  calendarSources: CalendarInfo[];
  defaultCalendar: number;
  firstDay: number;
  initialView: {
    desktop: string;
    mobile: string;
  };
  timeFormat24h: boolean;
  dailyNotesTimezone: 'local' | 'strict';
  clickToCreateEventFromMonthView: boolean;
  displayTimezone: string | null;
  lastSystemTimezone: string | null;
  enableCategoryColoring: boolean;
  categorySettings: { name: string; color: string }[];
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
  dailyNotesTimezone: 'local',
  clickToCreateEventFromMonthView: true,
  displayTimezone: null,
  lastSystemTimezone: null,
  enableCategoryColoring: false,
  categorySettings: []
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

// This modal presents the 3 bulk-update choices to the user.
class BulkCategorizeModal extends Modal {
  onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void;

  constructor(
    app: App,
    onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Choose a Bulk-Update Method' });
    contentEl.createEl('p', {
      text: 'How would you like to automatically categorize existing events in your local calendars?'
    });

    // Option 1: Smart Folder Update
    new Setting(contentEl)
      .setName('Smart Update')
      .setDesc(
        "Use parent folder names as the category for UN-categorized events. Events that already look like 'Category - Title' will be skipped."
      )
      .addButton(button =>
        button
          .setButtonText('Run Smart Update')
          .setCta()
          .onClick(() => {
            this.onSubmit('smart');
            this.close();
          })
      );

    // Option 2: Forced Folder Update
    new Setting(contentEl)
      .setName('Forced Folder Update')
      .setDesc(
        'Re-categorize ALL events using their parent folder name. This will OVERWRITE any existing categories in event titles. This is the only guarenteed reversible option if you wish to toggle it off later!'
      )
      .addButton(button =>
        button
          .setButtonText('Run Forced Update')
          .setWarning()
          .onClick(() => {
            this.onSubmit('force_folder');
            this.close();
          })
      );

    // Option 3: Forced Default Update
    let textInput: TextComponent;
    new Setting(contentEl)
      .setName('Forced Default Update')
      .setDesc(
        'Re-categorize ALL events with a single category you provide below. This will OVERWRITE existing categories.'
      )
      .addText(text => {
        textInput = text;
        text.setPlaceholder('Enter default category');
      })
      .addButton(button =>
        button
          .setButtonText('Run Forced Update')
          .setWarning()
          .onClick(() => {
            this.onSubmit('force_default', textInput.getValue());
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

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
    let showFullChangelog = false;

    const render = () => {
      containerEl.empty(); // Clear the entire settings tab on re-render

      // ====================================================================
      // Full Changelog View (Conditional)
      // ====================================================================
      if (showFullChangelog) {
        const changelogWrapper = containerEl.createDiv('full-calendar-changelog-wrapper');

        const header = changelogWrapper.createDiv('full-calendar-changelog-header');
        const backButton = header.createEl('button', { text: '<' });
        backButton.addEventListener('click', () => {
          showFullChangelog = false;
          render(); // Re-render the settings view
        });
        header.createEl('h2', { text: 'Changelog' });

        changelogData.forEach((version, index) => {
          const versionContainer = changelogWrapper.createDiv('full-calendar-version-container');

          // This is our new clickable header
          const header = versionContainer.createDiv('full-calendar-version-header');
          header.createEl('h3', { text: `Version ${version.version}` });

          // This is our new collapsible content area
          const content = versionContainer.createDiv('full-calendar-version-content');

          // Set the initial collapsed/expanded state
          if (index === 0) {
            header.addClass('is-open'); // Mark the header as open
          } else {
            content.addClass('is-collapsed'); // Hide the content
          }

          // Add the click handler to toggle the state
          header.addEventListener('click', () => {
            header.toggleClass('is-open', !header.hasClass('is-open'));
            content.toggleClass('is-collapsed', !content.hasClass('is-collapsed'));
          });

          // Populate the content area with the changes
          version.changes.forEach(change => {
            const changeEl = content.createDiv(
              `full-calendar-change-item change-type-${change.type}`
            );
            const iconEl = changeEl.createDiv('change-icon');
            if (change.type === 'new') iconEl.setText('✨');
            if (change.type === 'improvement') iconEl.setText('🔧');
            if (change.type === 'fix') iconEl.setText('🐛');
            const contentEl = changeEl.createDiv('change-content');
            contentEl.createEl('div', { cls: 'change-title', text: change.title });
            contentEl.createEl('div', { cls: 'change-description', text: change.description });
          });
        });

        return; // Stop here to only show the changelog
      }

      // ====================================================================
      // Standard Settings View
      // ====================================================================

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
        .setName('Daily Note Timezone')
        .setDesc(
          'Choose how times in daily notes are handled. "Local" means times are relative to your computer\'s current timezone. "Strict" will anchor events to the display timezone, writing it to the note.'
        )
        .addDropdown(dropdown => {
          dropdown
            .addOption('local', 'Local (Flexible)')
            .addOption('strict', 'Strict (Anchored to Display Timezone)');

          dropdown.setValue(this.plugin.settings.dailyNotesTimezone);

          dropdown.onChange(async value => {
            this.plugin.settings.dailyNotesTimezone = value as 'local' | 'strict';
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

      // ====================================================================
      // CATEGORY COLORING SECTION
      // ====================================================================
      containerEl.createEl('h2', { text: 'Category Coloring' });

      new Setting(containerEl)
        .setName('Enable Category Coloring')
        .setDesc('Color events based on a category in their title (e.g., "Work - My Event").')
        .addToggle(toggle => {
          toggle.setValue(this.plugin.settings.enableCategoryColoring).onChange(async value => {
            const isTogglingOn = value;
            const warningMessage = isTogglingOn
              ? 'This will permanently modify event notes in your vault by prepending a category to the event title. This action cannot be undone.'
              : 'This will permanently modify event notes by removing known category prefixes from titles. This action cannot be undone.';

            const confirmModal = new Modal(this.app);
            confirmModal.contentEl.createEl('h2', { text: 'Warning: Bulk File Modification' });
            confirmModal.contentEl.createEl('p', { text: warningMessage });
            confirmModal.contentEl.createEl('p', {
              text: 'It is highly recommended to back up your vault before continuing.'
            });

            new Setting(confirmModal.contentEl)
              .addButton(btn =>
                btn
                  .setButtonText('Proceed')
                  .setWarning()
                  // ADD `async` HERE
                  .onClick(async () => {
                    confirmModal.close();

                    if (isTogglingOn) {
                      new BulkCategorizeModal(this.app, async (choice, defaultCategory) => {
                        this.plugin.settings.enableCategoryColoring = true;
                        await this.plugin.saveData(this.plugin.settings);

                        if (choice === 'smart') {
                          await this.plugin.bulkSmartUpdateFromFolders();
                        } else if (choice === 'force_folder') {
                          await this.plugin.bulkForceUpdateFromFolders();
                        } else if (choice === 'force_default' && defaultCategory) {
                          await this.plugin.bulkForceUpdateWithDefault(defaultCategory);
                        }
                        this.display();
                      }).open();
                    } else {
                      // Toggling OFF
                      this.plugin.settings.enableCategoryColoring = false;
                      await this.plugin.saveData(this.plugin.settings);
                      await this.plugin.bulkRemoveCategoriesFromTitles();
                      this.display();
                    }
                  })
              )
              .addButton(btn =>
                btn.setButtonText('Cancel').onClick(() => {
                  toggle.setValue(!value);
                  confirmModal.close();
                })
              );
            confirmModal.open();
          });
        });

      if (this.plugin.settings.enableCategoryColoring) {
        const categoryDiv = containerEl.createDiv();
        const categoryRoot = ReactDOM.createRoot(categoryDiv);
        categoryRoot.render(
          createElement(CategorySettingsManager, {
            settings: this.plugin.settings.categorySettings,
            onSave: async newSettings => {
              this.plugin.settings.categorySettings = newSettings;
              await this.plugin.saveSettings();
            }
          })
        );
      }

      // ====================================================================
      // "What's New" Section
      // ====================================================================
      const whatsNewContainer = containerEl.createDiv('full-calendar-whats-new-container');
      const latestVersion = changelogData[0];

      const headerEl = whatsNewContainer.createDiv('full-calendar-whats-new-header');
      headerEl.createEl('h2', { text: "What's New" });
      new Setting(headerEl).addExtraButton(button => {
        button
          .setIcon('ellipsis')
          .setTooltip('View full changelog')
          .onClick(() => {
            showFullChangelog = true;
            render();
          });
      });

      whatsNewContainer.createEl('p', {
        text: `Version ${latestVersion.version}`,
        cls: 'full-calendar-whats-new-version'
      });

      whatsNewContainer.createEl('hr', { cls: 'settings-view-new-divider' });

      const whatsNewList = whatsNewContainer.createDiv('full-calendar-whats-new-list');
      latestVersion.changes.forEach(change => {
        const item = new Setting(whatsNewList).setName(change.title).setDesc(change.description);

        // --- ICON INJECTION LOGIC (Corrected) ---
        const iconEl = createEl('span', { cls: `change-icon-settings change-type-${change.type}` });
        if (change.type === 'new') {
          iconEl.setText('+');
        } else if (change.type === 'improvement') {
          iconEl.setText('🔧');
        } else if (change.type === 'fix') {
          iconEl.setText('🐛');
        }

        // This is the key: We set the name first, which creates the DOM element,
        // and THEN we prepend our custom icon to that existing element.
        item.nameEl.prepend(iconEl);

        item.settingEl.addClass('full-calendar-whats-new-item');
        item.controlEl.empty();
      });

      // ====================================================================
      // Manage Calendars Section
      // ====================================================================
      containerEl.createEl('h2', { text: 'Manage Calendars' });
      containerEl.createEl('hr', { cls: 'settings-view-new-divider' });
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
    };

    render(); // Initial render
  }
}
