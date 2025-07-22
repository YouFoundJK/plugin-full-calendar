/**
 * @file main.ts
 * @brief Main plugin entry point for Obsidian Full Calendar.
 *
 * @description
 * This file contains the `FullCalendarPlugin` class, which is the primary
 * controller for the entire plugin. It manages the plugin's lifecycle,
 * including loading/unloading, settings management, command registration,
 * and view initialization. It serves as the central hub that wires together
 * the event cache, UI components, and Obsidian's application workspace.
 *
 * @license See LICENSE.md
 */

import { Notice, Plugin, TFile, TFolder, TAbstractFile } from 'obsidian';
import { CalendarView, FULL_CALENDAR_SIDEBAR_VIEW_TYPE, FULL_CALENDAR_VIEW_TYPE } from './ui/view';
import { renderCalendar } from './ui/calendar';
import { toEventInput } from './ui/interop';
import { DEFAULT_SETTINGS, FullCalendarSettings, FullCalendarSettingTab } from './ui/settings';
import { PLUGIN_SLUG } from './types';
import EventCache from './core/EventCache';
import { ObsidianIO } from './ObsidianAdapter';
import { launchCreateModal } from './ui/event_modal';
import FullNoteCalendar from './calendars/FullNoteCalendar';
import DailyNoteCalendar from './calendars/DailyNoteCalendar';
import ICSCalendar from './calendars/ICSCalendar';
import CalDAVCalendar from './calendars/CalDAVCalendar';
import { manageTimezone } from './core/Timezone';
import { constructTitle, parseTitle } from './core/categoryParser';
import { AnalysisView, ANALYSIS_VIEW_TYPE } from './chrono_analyser/AnalysisView';

export default class FullCalendarPlugin extends Plugin {
  settings: FullCalendarSettings = DEFAULT_SETTINGS;

  // To parse `data.json` file.`
  cache: EventCache = new EventCache(this, {
    local: (info, settings) =>
      info.type === 'local'
        ? new FullNoteCalendar(new ObsidianIO(this.app), info.color, info.directory, settings)
        : null,
    dailynote: (info, settings) =>
      info.type === 'dailynote'
        ? new DailyNoteCalendar(new ObsidianIO(this.app), info.color, info.heading, settings)
        : null,
    ical: (info, settings) =>
      info.type === 'ical' ? new ICSCalendar(info.color, info.url, settings) : null,
    caldav: (info, settings) =>
      info.type === 'caldav'
        ? new CalDAVCalendar(
            info.color,
            info.name,
            {
              type: 'basic',
              username: info.username,
              password: info.password
            },
            info.url,
            info.homeUrl,
            settings
          )
        : null,
    FOR_TEST_ONLY: () => null
  });

  renderCalendar = renderCalendar;
  processFrontmatter = toEventInput;

  /**
   * Activates the Full Calendar view.
   * If a calendar view is already open in a main tab, it focuses that view.
   * Otherwise, it opens a new calendar view in a new tab.
   * This prevents opening multiple duplicate calendar tabs.
   */
  async activateView() {
    const leaves = this.app.workspace
      .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
      .filter(l => (l.view as CalendarView).inSidebar === false);
    if (leaves.length === 0) {
      // if not open in main view, open a new one
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: FULL_CALENDAR_VIEW_TYPE,
        active: true
      });
    } else {
      // if already open, just focus it
      await Promise.all(leaves.map(l => (l.view as CalendarView).onOpen()));
    }
  }

  /**
   * Plugin load lifecycle method.
   * This method is called when the plugin is enabled.
   * It initializes settings, sets up the EventCache, registers the calendar
   * and sidebar views, adds the ribbon icon and commands, and sets up
   * listeners for Vault file changes (create, rename, delete).
   */
  async onload() {
    await this.loadSettings();
    await manageTimezone(this);

    this.cache.reset(this.settings.calendarSources);

    // Respond to obsidian events
    this.registerEvent(
      this.app.metadataCache.on('changed', file => {
        this.cache.fileUpdated(file);
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          console.debug('FILE RENAMED', file.path);
          this.cache.deleteEventsAtPath(oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', file => {
        if (file instanceof TFile) {
          console.debug('FILE DELETED', file.path);
          this.cache.deleteEventsAtPath(file.path);
        }
      })
    );

    // @ts-ignore
    window.cache = this.cache;

    this.registerView(FULL_CALENDAR_VIEW_TYPE, leaf => new CalendarView(leaf, this, false));

    this.registerView(FULL_CALENDAR_SIDEBAR_VIEW_TYPE, leaf => new CalendarView(leaf, this, true));

    this.registerView(ANALYSIS_VIEW_TYPE, leaf => new AnalysisView(leaf, this));
    // Register the calendar icon on left-side bar
    this.addRibbonIcon('calendar-glyph', 'Open Full Calendar', async (_: MouseEvent) => {
      await this.activateView();
    });

    this.addSettingTab(new FullCalendarSettingTab(this.app, this));

    // Commands visible in the command palette
    this.addCommand({
      id: 'full-calendar-new-event',
      name: 'New Event',
      callback: () => {
        launchCreateModal(this, {});
      }
    });
    this.addCommand({
      id: 'full-calendar-reset',
      name: 'Reset Event Cache',
      callback: () => {
        this.cache.reset(this.settings.calendarSources);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
        new Notice('Full Calendar has been reset.');
      }
    });
    this.addCommand({
      id: 'full-calendar-revalidate',
      name: 'Revalidate remote calendars',
      callback: () => {
        this.cache.revalidateRemoteCalendars(true);
      }
    });
    this.addCommand({
      id: 'full-calendar-open',
      name: 'Open Calendar',
      callback: () => {
        this.activateView();
      }
    });
    this.addCommand({
      id: 'full-calendar-open-sidebar',
      name: 'Open in sidebar',
      callback: () => {
        if (this.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
          return;
        }
        const targetLeaf = this.app.workspace.getRightLeaf(false);
        if (targetLeaf) {
          targetLeaf.setViewState({
            type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
          });
          this.app.workspace.revealLeaf(targetLeaf);
        } else {
          console.warn('Right leaf not found for calendar view!');
        }
      }
    });

    // Register view content on hover
    (this.app.workspace as any).registerHoverLinkSource(PLUGIN_SLUG, {
      display: 'Full Calendar',
      defaultMod: true
    });
  }

  /**
   * Plugin unload lifecycle method.
   * This method is called when the plugin is disabled.
   * It cleans up by detaching all calendar and sidebar views.
   */
  onunload() {
    this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
  }

  /**
   * Loads plugin settings from disk, merging them with default values.
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Saves the current plugin settings to disk.
   * After saving, it triggers a reset and repopulation of the event cache
   * to ensure all calendars are using the new settings.
   */
  async saveSettings() {
    new Notice('Resetting the event cache with new settings...');
    await this.saveData(this.settings);
    this.cache.reset(this.settings.calendarSources);
    await this.cache.populate();
    this.cache.resync();
  }

  /**
   * Performs a non-blocking iteration over a list of files to apply a processor function.
   * Shows a progress notice to the user.
   * @param files The array of TFile objects to process.
   * @param processor The async function to apply to each file.
   * @param description A description of the operation for the notice.
   */
  async nonBlockingProcess(
    files: TFile[],
    processor: (file: TFile) => Promise<void>,
    description: string
  ) {
    const BATCH_SIZE = 10;
    let index = 0;
    const notice = new Notice('', 0); // Indefinite notice

    const processBatch = () => {
      // End condition
      if (index >= files.length) {
        notice.hide();
        new Notice('Bulk update complete!');
        return;
      }

      notice.setMessage(`${description}: ${index}/${files.length}`);
      const batch = files.slice(index, index + BATCH_SIZE);

      Promise.all(batch.map(processor))
        .then(() => {
          index += BATCH_SIZE;
          // Yield to the main thread before processing the next batch
          setTimeout(processBatch, 0);
        })
        .catch(err => {
          console.error('Error during bulk processing batch', err);
          notice.hide();
          new Notice('Error during bulk update. Check console for details.');
        });
    };

    processBatch();
  }

  // Helper function to get all TFiles from local calendars
  private async getAllLocalEventFiles(): Promise<TFile[]> {
    const localCalendars = [...this.cache.calendars.values()].flatMap(c =>
      c instanceof FullNoteCalendar ? c : []
    );
    let allFiles: TFile[] = [];
    for (const calendar of localCalendars) {
      const folder = this.app.vault.getAbstractFileByPath(calendar.directory);
      if (folder instanceof TFolder) {
        allFiles.push(
          ...folder.children.flatMap((f: TAbstractFile) => (f instanceof TFile ? [f] : []))
        );
      }
    }
    return allFiles;
  }

  /**
   * OPTION 1: Smartly prepends parent folder names to uncategorized event titles.
   */
  async bulkSmartUpdateFromFolders() {
    const allFiles = await this.getAllLocalEventFiles();
    const processor = async (file: TFile) => {
      const parentName = file.parent?.name;
      if (!parentName || parentName === '/' || parentName === this.app.vault.getRoot().name) return;
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;
        const { category, title } = parseTitle(frontmatter.title);
        if (category) return; // The "smart" part: skip if category exists.
        frontmatter.title = constructTitle(parentName, title);
      });
    };
    this.nonBlockingProcess(allFiles, processor, 'Smart-updating titles from folders');
  }

  /**
   * OPTION 2: Forcibly prepends parent folder names to ALL event titles.
   * This will create nested categories if a category already exists.
   */
  async bulkForceUpdateFromFolders() {
    const allFiles = await this.getAllLocalEventFiles();
    const processor = async (file: TFile) => {
      const parentName = file.parent?.name;
      if (!parentName || parentName === '/' || parentName === this.app.vault.getRoot().name) return;
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;

        // CORRECTED LOGIC: Prepend to the FULL existing title.
        // `constructTitle` will correctly create "Parent - Old Category - Title".
        frontmatter.title = constructTitle(parentName, frontmatter.title);
      });
    };
    this.nonBlockingProcess(allFiles, processor, 'Forcing folder categories on titles');
  }

  /**
   * OPTION 3: Forcibly prepends a default category name to ALL event titles.
   * This will create nested categories if a category already exists.
   */
  async bulkForceUpdateWithDefault(defaultCategory: string) {
    // The check for empty category will now be handled in the UI,
    // but keeping it here is a good defensive measure.
    if (!defaultCategory || defaultCategory.trim() === '') {
      new Notice('Cannot add an empty category.');
      return;
    }
    const allFiles = await this.getAllLocalEventFiles();
    const processor = async (file: TFile) => {
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;

        // CORRECTED LOGIC: Prepend to the FULL existing title.
        frontmatter.title = constructTitle(defaultCategory, frontmatter.title);
      });
    };
    this.nonBlockingProcess(allFiles, processor, `Forcing "${defaultCategory}" category on titles`);
  }

  /**
   * BULK ACTION - REMOVE: Iterates through all local event files and removes known
   * category prefixes from their titles.
   */
  async bulkRemoveCategoriesFromTitles() {
    // Get all possible category names: from settings and from folder names.
    const definedCategories = new Set(this.settings.categorySettings.map(s => s.name));
    [...this.cache.calendars.values()].forEach(c => {
      if (c instanceof FullNoteCalendar) {
        const dir = c.directory.split('/').pop();
        if (dir) definedCategories.add(dir);
      }
    });

    const allFiles = await this.getAllLocalEventFiles();
    const processor = async (file: TFile) => {
      await this.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;
        const { category, title } = parseTitle(frontmatter.title);
        if (category && definedCategories.has(category)) {
          // If the parsed category is a known one, strip it.
          frontmatter.title = title;
        }
      });
    };

    this.nonBlockingProcess(allFiles, processor, 'Removing categories from titles');
  }
}
