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

import { LazySettingsTab } from './ui/settings/LazySettingsTab';
import type { FullCalendarSettingTab } from './ui/settings/SettingsTab';
import { ensureCalendarIds, sanitizeInitialView } from './ui/settings/utilsSettings';
import { PLUGIN_SLUG } from './types';
import EventCache from './core/EventCache';
import { toEventInput } from './core/interop';
import { FullNoteProvider } from './providers/fullnote/FullNoteProvider';
import { DailyNoteProvider } from './providers/dailynote/DailyNoteProvider';
import { ObsidianIO } from './ObsidianAdapter';
import { renderCalendar } from './ui/calendar';
import { manageTimezone } from './calendars/utils/Timezone';
import { Notice, Plugin, TFile, App } from 'obsidian';
// Heavy calendar classes are loaded lazily in the initializer map below
import { CategorizationManager } from './core/CategorizationManager';
import type { CalendarView } from './ui/view';
import { FullCalendarSettings, DEFAULT_SETTINGS } from './types/settings';
import { ProviderRegistry } from './core/ProviderRegistry';

// Inline the view type constants to avoid loading the heavy view module at startup
const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

export default class FullCalendarPlugin extends Plugin {
  settings: FullCalendarSettings = DEFAULT_SETTINGS;
  categorizationManager!: CategorizationManager;
  isMobile: boolean = false;
  settingsTab?: LazySettingsTab;
  providerRegistry!: ProviderRegistry;

  // To parse `data.json` file.`
  cache: EventCache = new EventCache(this, {
    local: (info, settings) =>
      info.type === 'local'
        ? new (require('./calendars/FullNoteCalendar').default)(
            new ObsidianIO(this.app),
            this,
            info,
            settings
          )
        : null,
    dailynote: (info, settings) =>
      info.type === 'dailynote'
        ? new (require('./calendars/DailyNoteCalendar').default)(
            new ObsidianIO(this.app),
            this,
            info,
            settings
          )
        : null,
    ical: (info, settings) =>
      info.type === 'ical'
        ? new (require('./calendars/ICSCalendar').default)(info, settings)
        : null,
    caldav: (info, settings) =>
      info.type === 'caldav'
        ? new (require('./calendars/CalDAVCalendar').default)(info, settings)
        : null,
    google: (info, settings) =>
      info.type === 'google'
        ? new (require('./calendars/GoogleCalendar').default)(this, info, settings)
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
    this.isMobile = (this.app as App & { isMobile: boolean }).isMobile;
    this.providerRegistry = new ProviderRegistry();

    // Register the providers
    this.providerRegistry.register(new FullNoteProvider(new ObsidianIO(this.app), this));
    this.providerRegistry.register(
      new DailyNoteProvider(new ObsidianIO(this.app), this, this.settings)
    );

    this.categorizationManager = new CategorizationManager(this);
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
          // console.debug('FILE RENAMED', file.path);
          this.cache.deleteEventsAtPath(oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', file => {
        if (file instanceof TFile) {
          // console.debug('FILE DELETED', file.path);
          this.cache.deleteEventsAtPath(file.path);
        }
      })
    );

    // @ts-ignore
    window.cache = this.cache;

    this.registerView(
      FULL_CALENDAR_VIEW_TYPE,
      leaf => new (require('./ui/view').CalendarView)(leaf, this, false)
    );

    this.registerView(
      FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
      leaf => new (require('./ui/view').CalendarView)(leaf, this, true)
    );

    if (!this.isMobile) {
      // Lazily import the view to avoid loading plotly on mobile.
      import('./chrono_analyser/AnalysisView')
        .then(({ AnalysisView, ANALYSIS_VIEW_TYPE }) => {
          this.registerView(ANALYSIS_VIEW_TYPE, leaf => new AnalysisView(leaf, this));
        })
        .catch(err => {
          console.error('Full Calendar: Failed to load Chrono Analyser view', err);
          new Notice('Failed to load Chrono Analyser. Please check the console.');
        });
    }

    // Register the calendar icon on left-side bar
    this.addRibbonIcon('calendar-glyph', 'Open Full Calendar', async (_: MouseEvent) => {
      await this.activateView();
    });

    this.settingsTab = new LazySettingsTab(this.app, this, this.providerRegistry);
    this.addSettingTab(this.settingsTab);

    // Commands visible in the command palette
    this.addCommand({
      id: 'full-calendar-new-event',
      name: 'New Event',
      callback: async () => {
        const { launchCreateModal } = await import('./ui/event_modal');
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
    // vvv ADD THIS BLOCK vvv
    if (this.isMobile) {
      this.addCommand({
        id: 'full-calendar-open-analysis-mobile-disabled',
        name: 'Open Chrono Analyser (Desktop Only)',
        callback: () => {
          new Notice(
            'The Chrono Analyser feature is only available on the desktop version of Obsidian.'
          );
        }
      });
    }
    // ^^^ END OF BLOCK ^^^
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

    this.registerObsidianProtocolHandler('full-calendar-google-auth', async params => {
      if (params.code && params.state) {
        const { exchangeCodeForToken } = await import('./calendars/parsing/google/auth');
        await exchangeCodeForToken(params.code, params.state, this);
        if (this.settingsTab) {
          await this.settingsTab.display();
        }
      } else {
        new Notice('Google authentication failed. Please try again.');
        console.error('Google Auth Callback Error: Missing code or state.', params);
      }
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
    let loadedSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Sanitize settings using pure functions
    loadedSettings = sanitizeInitialView(loadedSettings);

    const { updated, sources } = ensureCalendarIds(loadedSettings.calendarSources);
    this.settings = { ...loadedSettings, calendarSources: sources };

    if (updated) {
      new Notice('Full Calendar has updated your calendar settings to a new format.');
      await this.saveData(this.settings);
    }
  }

  /**
   * Saves the current plugin settings to disk.
   * After saving, it triggers a reset and repopulation of the event cache
   * to ensure all calendars are using the new settings.
   */
  async saveSettings() {
    await this.saveData(this.settings);
    // If calendarSources changed, rebuild cache; otherwise use lightweight resync
    // This is a heuristic: callers that mutate calendarSources will trigger reset via Settings UI.
    if (this.cache && this.cache.initialized) {
      this.cache.resync();
    } else {
      this.cache.reset(this.settings.calendarSources);
      await this.cache.populate();
      this.cache.resync();
    }
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
        // The calling function will show the final completion notice.
        return;
      }

      notice.setMessage(`${description}: ${index}/${files.length}`);
      const batch = files.slice(index, index + BATCH_SIZE);

      Promise.all(batch.map(processor))
        .then(() => {
          index += BATCH_SIZE;
          // Yield to the main thread before processing the next batch
          setTimeout(processBatch, 20);
        })
        .catch(err => {
          console.error('Error during bulk processing batch', err);
          notice.hide();
          new Notice('Error during bulk update. Check console for details.');
        });
    };

    processBatch();
  }
}
