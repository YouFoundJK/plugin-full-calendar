/**
 * @file view.ts
 * @brief Defines the `CalendarView`, the main component for displaying the calendar.
 *
 * @description
 * This file contains the `CalendarView` class, which extends Obsidian's `ItemView`.
 * It is responsible for creating and managing the DOM element that hosts the
 * calendar, initializing FullCalendar.js, and subscribing to the `EventCache`
 * for updates. It handles all direct user interactions with the calendar and
 * translates them into actions on the `EventCache`.
 *
 * @exports CalendarView
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';

import { ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';

import type { Calendar, EventInput } from '@fullcalendar/core';

import './overrides.css';
import FullCalendarPlugin from '../main';
import { renderCalendar } from './calendar';
import { renderOnboarding } from './onboard';
import { PLUGIN_SLUG, CalendarInfo } from '../types';
import { UpdateViewCallback, CachedEvent } from '../core/EventCache';

// Lazy-import heavy modules at point of use to reduce initial load time
import { dateEndpointsToFrontmatter, fromEventApi, toEventInput } from '../core/interop';
import { ViewEnhancer } from '../core/ViewEnhancer';

export const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
export const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

export function getCalendarColors(color: string | null | undefined): {
  color: string;
  textColor: string;
} {
  let textVar = getComputedStyle(document.body).getPropertyValue('--text-on-accent');
  if (color) {
    const m = color.slice(1).match(color.length == 7 ? /(\S{2})/g : /(\S{1})/g);
    if (m) {
      const r = parseInt(m[0], 16),
        g = parseInt(m[1], 16),
        b = parseInt(m[2], 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness > 150) {
        textVar = 'black';
      }
    }
  }

  return {
    color: color || getComputedStyle(document.body).getPropertyValue('--interactive-accent'),
    textColor: textVar
  };
}

export class CalendarView extends ItemView {
  plugin: FullCalendarPlugin;
  inSidebar: boolean;
  fullCalendarView: Calendar | null = null;
  callback: UpdateViewCallback | null = null;
  private viewEnhancer: ViewEnhancer | null = null;
  private timelineResources:
    | { id: string; title: string; parentId?: string; eventColor?: string; extendedProps?: any }[]
    | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin, inSidebar = false) {
    super(leaf);
    this.plugin = plugin;
    this.inSidebar = inSidebar;
  }

  getIcon(): string {
    return 'calendar-glyph';
  }

  getViewType() {
    return this.inSidebar ? FULL_CALENDAR_SIDEBAR_VIEW_TYPE : FULL_CALENDAR_VIEW_TYPE;
  }

  getDisplayText() {
    return this.inSidebar ? 'Full Calendar' : 'Calendar';
  }

  /**
   * Switch to a specific workspace by ID.
   * @param workspaceId - The workspace ID to switch to, or null for default view
   */
  async switchToWorkspace(workspaceId: string | null) {
    this.plugin.settings.activeWorkspace = workspaceId;
    await this.plugin.saveSettings();
    await this.onOpen(); // Re-render the calendar with new settings
  }

  /**
   * Get the text to display in the workspace switcher button.
   */
  getWorkspaceSwitcherText(): string {
    // REPLACE:
    // const activeWorkspace = this.workspaceManager?.getActiveWorkspace();
    // WITH:
    const activeWorkspace = this.viewEnhancer?.getActiveWorkspace();
    if (!activeWorkspace) {
      return 'Workspace ▾';
    }

    // Truncate long workspace names for UI
    const name =
      activeWorkspace.name.length > 12
        ? activeWorkspace.name.substring(0, 12) + '...'
        : activeWorkspace.name;

    return `${name} ▾`;
  }

  /**
   * Show the workspace switcher dropdown menu.
   */
  showWorkspaceSwitcher(ev: MouseEvent) {
    const menu = new Menu();

    // Default view option
    menu.addItem(item => {
      item
        .setTitle('Default View')
        .setIcon(this.plugin.settings.activeWorkspace === null ? 'check' : '')
        .onClick(async () => {
          await this.switchToWorkspace(null);
        });
    });

    if (this.plugin.settings.workspaces.length > 0) {
      menu.addSeparator();

      // Workspace options
      this.plugin.settings.workspaces.forEach(workspace => {
        menu.addItem(item => {
          item
            .setTitle(workspace.name)
            .setIcon(this.plugin.settings.activeWorkspace === workspace.id ? 'check' : '')
            .onClick(async () => {
              await this.switchToWorkspace(workspace.id);
            });
        });
      });
    }

    menu.showAtMouseEvent(ev);
  }

  /**
   * Generates shadow events for parent categories in timeline views.
   * Shadow events provide visual aggregation of child subcategory events.
   */
  generateShadowEvents(mainEvents: EventInput[], forceTimeline = false): EventInput[] {
    const shadowEvents: EventInput[] = [];

    // Only generate shadow events if advanced categorization is enabled
    if (!this.plugin.settings.enableAdvancedCategorization) {
      return shadowEvents;
    }

    // Only generate shadow events if we're in a timeline view
    // During initial load, forceTimeline can be used to include shadows for timeline views
    const currentView = this.fullCalendarView?.view?.type;
    if (!forceTimeline && currentView && !currentView.includes('resourceTimeline')) {
      return shadowEvents;
    }

    for (const event of mainEvents) {
      if (event.resourceId && event.resourceId.includes('::')) {
        // This is a subcategory event, create a shadow event for the parent
        const parentCategory = event.resourceId.split('::')[0];
        const shadowEvent: EventInput = {
          ...event,
          id: `${event.id}-shadow`,
          resourceId: parentCategory,
          extendedProps: {
            ...event.extendedProps,
            isShadow: true,
            originalEventId: event.id
          },
          className: 'fc-event-shadow',
          editable: false,
          durationEditable: false,
          startEditable: false
        };
        shadowEvents.push(shadowEvent);
      }
    }

    return shadowEvents;
  }

  /**
   * Adds shadow events to the current view (for timeline views)
   */
  addShadowEventsToView() {
    if (!this.plugin.settings.enableAdvancedCategorization || !this.fullCalendarView) {
      return;
    }

    // Get all events from each source and generate shadow events
    for (const source of this.fullCalendarView.getEventSources()) {
      const calendarId = source.id;
      const cachedSource = this.plugin.cache.getAllEvents().find(s => s.id === calendarId);
      if (!cachedSource) continue;

      const { events } = cachedSource;
      const settings = this.plugin.settings;

      const mainEvents = events
        .map((e: CachedEvent) => toEventInput(e.id, e.event, settings))
        .filter((e): e is EventInput => !!e);

      const shadowEvents = this.generateShadowEvents(mainEvents, true);

      shadowEvents.forEach(shadowEvent => {
        this.fullCalendarView?.addEvent(shadowEvent, calendarId);
      });
    }
  }

  /**
   * Lazily build resources for timeline views based on current settings and cache.
   */
  private buildTimelineResources(): {
    id: string;
    title: string;
    parentId?: string;
    eventColor?: string;
    extendedProps?: any;
  }[] {
    const resources: {
      id: string;
      title: string;
      parentId?: string;
      eventColor?: string;
      extendedProps: any;
    }[] = [];
    if (!this.plugin.settings.enableAdvancedCategorization) {
      return resources;
    }

    const categorySettings = this.plugin.settings.categorySettings || [];
    if (!this.viewEnhancer) {
      return resources;
    }
    const allCachedSources = this.plugin.cache.getAllEvents();
    const allSources = this.viewEnhancer.getFilteredSources(allCachedSources);
    const workspace = this.viewEnhancer?.getActiveWorkspace(); // You can now safely get the active workspace if needed for other logic.

    const isCategoryVisible = (name: string) => {
      if (!workspace?.categoryFilter) return true;
      const { mode, categories } = workspace.categoryFilter;
      if (mode === 'show-only' && categories.length === 0) return true;
      if (mode === 'show-only') return categories.includes(name);
      return !categories.includes(name);
    };

    const filteredCategorySettings = workspace?.categoryFilter
      ? categorySettings.filter(cat => isCategoryVisible(cat.name))
      : categorySettings;

    filteredCategorySettings.forEach((cat: { name: string; color: string }) => {
      resources.push({
        id: cat.name,
        title: cat.name,
        eventColor: cat.color,
        extendedProps: { isParent: true }
      });
    });

    const categoryMap = new Map<string, Set<string>>();
    for (const source of allSources) {
      for (const cachedEvent of source.events) {
        const { category, subCategory } = cachedEvent.event;
        if (category) {
          if (!isCategoryVisible(category)) continue;
          if (!categoryMap.has(category)) categoryMap.set(category, new Set());
          const sub = subCategory || '__NONE__';
          categoryMap.get(category)!.add(sub);
        }
      }
    }

    for (const [category, subCategories] of categoryMap.entries()) {
      if (!isCategoryVisible(category)) continue;
      if (!resources.find(r => r.id === category)) {
        resources.push({ id: category, title: category, extendedProps: { isParent: true } });
      }
      for (const subCategory of subCategories) {
        resources.push({
          id: `${category}::${subCategory}`,
          title: subCategory === '__NONE__' ? '(none)' : subCategory,
          parentId: category,
          extendedProps: {}
        });
      }
    }
    return resources;
  }

  /**
   * Removes shadow events from the current view
   */
  removeShadowEventsFromView() {
    if (!this.fullCalendarView) {
      return;
    }

    // Find and remove all shadow events
    const allEvents = this.fullCalendarView.getEvents();
    allEvents.forEach(event => {
      if (event.extendedProps.isShadow) {
        event.remove();
      }
    });
  }

  /**
   * Called when the view is opened or re-focused.
   * This is the main rendering method. It clears any existing calendar,
   * fetches all event sources from the cache, and initializes a new FullCalendar
   * instance with all the necessary options and interaction callbacks (e.g., for
   * event clicking, dragging, and creating new events). It also registers a
   * callback with the EventCache to listen for updates.
   */
  async onOpen() {
    await this.plugin.loadSettings();
    if (!this.plugin.cache) {
      new Notice('Full Calendar event cache not loaded.');
      return;
    }
    if (!this.plugin.cache.initialized) {
      await this.plugin.cache.populate();
    }

    this.viewEnhancer = new ViewEnhancer(this.plugin.settings);

    const container = this.containerEl.children[1];
    container.empty();
    let calendarEl = container.createEl('div');

    if (
      this.plugin.settings.calendarSources.filter((s: CalendarInfo) => s.type !== 'FOR_TEST_ONLY')
        .length === 0
    ) {
      renderOnboarding(this.plugin, calendarEl);
      return;
    }

    if (!this.viewEnhancer) {
      // This should not happen if onOpen is called correctly.
      new Notice('Full Calendar view enhancer not initialized.');
      return;
    }
    const allSources = this.plugin.cache.getAllEvents();
    const { sources, config: calendarConfig } = this.viewEnhancer.getEnhancedData(allSources);

    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }

    let currentViewType = '';
    const handleViewChange = () => {
      const newViewType = this.fullCalendarView?.view?.type || '';
      const wasTimeline = currentViewType.includes('resourceTimeline');
      const isTimeline = newViewType.includes('resourceTimeline');

      if (wasTimeline !== isTimeline) {
        if (isTimeline) {
          if (!this.timelineResources) {
            this.timelineResources = this.buildTimelineResources();
            this.fullCalendarView?.setOption('resources', this.timelineResources);
            this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
          }
          this.addShadowEventsToView();
        } else {
          this.removeShadowEventsFromView();
        }
      }
      currentViewType = newViewType;
    };

    this.fullCalendarView = await renderCalendar(calendarEl, sources, {
      // timeZone:
      //   this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      forceNarrow: this.inSidebar,
      // resources added lazily when entering timeline view
      enableAdvancedCategorization: this.plugin.settings.enableAdvancedCategorization,
      onViewChange: handleViewChange,
      initialView: calendarConfig.initialView, // Use workspace-aware initial view
      businessHours: (() => {
        // Use workspace business hours if set, otherwise use global settings
        const businessHours = calendarConfig.businessHours || this.plugin.settings.businessHours;
        return businessHours.enabled
          ? {
              daysOfWeek: businessHours.daysOfWeek,
              startTime: businessHours.startTime,
              endTime: businessHours.endTime
            }
          : false;
      })(),
      customButtons: {
        workspace: {
          text: this.getWorkspaceSwitcherText(),
          click: (ev?: MouseEvent) => {
            if (ev) this.showWorkspaceSwitcher(ev);
          }
        },
        analysis: {
          text: 'Analysis',
          click: async () => {
            if (this.plugin.isMobile) {
              new Notice('The Chrono Analyser is only available on desktop.');
              return;
            }
            try {
              const { activateAnalysisView } = await import('../chrono_analyser/AnalysisView');
              activateAnalysisView(this.plugin.app);
            } catch (err) {
              console.error('Full Calendar: Failed to activate Chrono Analyser view', err);
              new Notice('Failed to open Chrono Analyser. Please check the console.');
            }
          }
        }
      },
      eventClick: async info => {
        try {
          if (info.jsEvent.getModifierState('Control') || info.jsEvent.getModifierState('Meta')) {
            const { openFileForEvent } = await import('../utils/eventActions');
            await openFileForEvent(this.plugin.cache, this.app, info.event.id);
          } else {
            if (!this.plugin.cache.isEventEditable(info.event.id)) {
              new Notice('This event belongs to a read-only calendar.');
              return;
            }

            const { launchEditModal } = await import('./event_modal');
            launchEditModal(this.plugin, info.event.id);
          }
        } catch (e) {
          if (e instanceof Error) {
            console.warn(e);
            new Notice(e.message);
          }
        }
      },
      select: async (start, end, allDay, viewType) => {
        if (viewType === 'dayGridMonth') {
          // Month view will set the end day to the next day even on a single-day event.
          // This is problematic when moving an event created in the month view to the
          // time grid to give it a time.

          // The fix is just to subtract 1 from the end date before processing.
          end.setDate(end.getDate() - 1);
        }
        const partialEvent = dateEndpointsToFrontmatter(start, end, allDay);
        try {
          if (this.plugin.settings.clickToCreateEventFromMonthView || viewType !== 'dayGridMonth') {
            const { launchCreateModal } = await import('./event_modal');
            launchCreateModal(this.plugin, partialEvent);
          } else {
            this.fullCalendarView?.changeView('timeGridDay');
            this.fullCalendarView?.gotoDate(start);
          }
        } catch (e) {
          if (e instanceof Error) {
            console.error(e);
            new Notice(e.message);
          }
        }
      },
      modifyEvent: async (newEvent, oldEvent, newResource) => {
        try {
          const originalEvent = this.plugin.cache.getEventById(oldEvent.id);
          if (!originalEvent) {
            throw new Error('Original event not found in cache.');
          }

          // ====================================================================
          // NEW LOGIC: Prevent moving child overrides to a different day.
          // ====================================================================
          if (originalEvent.type === 'single' && originalEvent.recurringEventId) {
            const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
            const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

            if (oldDate && newDate && oldDate !== newDate) {
              new Notice(
                'Cannot move a recurring instance to a different day. Modify the time only or edit the main recurring event.',
                6000
              );
              return false; // Reverts the event to its original position.
            }
          }
          // ====================================================================

          // Check if the event being dragged is part of a recurring series.
          // We must check the original event from the cache, because `oldEvent` from FullCalendar
          // is just an instance and doesn't have our `type` property.
          if (originalEvent.type === 'rrule' || originalEvent.type === 'recurring') {
            // ====================================================================
            // NEW LOGIC: Prevent moving the master instance to a different day.
            // ====================================================================
            const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
            const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

            if (oldDate && newDate && oldDate !== newDate) {
              new Notice(
                'Cannot move a recurring instance to a different day. You can only change the time.',
                6000
              );
              return false; // Revert the change.
            }
            // ====================================================================

            if (!oldEvent.start) {
              throw new Error('Recurring instance is missing original start date.');
            }

            // This is a recurring instance. We need to create an override.
            const instanceDate = DateTime.fromJSDate(oldEvent.start).toISODate();
            if (!instanceDate) {
              throw new Error('Could not determine instance date from recurring event.');
            }

            const modifiedEvent = fromEventApi(newEvent, newResource);

            await this.plugin.cache.modifyRecurringInstance(
              oldEvent.id,
              instanceDate,
              modifiedEvent
            );
            // Return true because we have successfully handled the modification.
            return true;
          } else {
            // This is a standard single event or an existing override.
            // Let it update normally.
            const didModify = await this.plugin.cache.updateEventWithId(
              oldEvent.id,
              fromEventApi(newEvent, newResource)
            );
            return !!didModify;
          }
        } catch (e: any) {
          console.error(e);
          new Notice(e.message);
          return false;
        }
      },

      eventMouseEnter: async info => {
        try {
          const location = this.plugin.cache.store.getEventDetails(info.event.id)?.location;
          if (location) {
            this.app.workspace.trigger('hover-link', {
              event: info.jsEvent,
              source: PLUGIN_SLUG,
              hoverParent: calendarEl,
              targetEl: info.jsEvent.target,
              linktext: location.path,
              sourcePath: location.path
            });
          }
        } catch (e) {}
      },
      firstDay: this.plugin.settings.firstDay,
      timeFormat24h: this.plugin.settings.timeFormat24h,
      openContextMenuForEvent: async (e, mouseEvent) => {
        const menu = new Menu();
        if (!this.plugin.cache) {
          return;
        }
        const event = this.plugin.cache.getEventById(e.id);
        if (!event) {
          return;
        }

        if (this.plugin.cache.isEventEditable(e.id)) {
          const tasks = await import('../utils/tasks');
          if (!tasks.isTask(event)) {
            menu.addItem(item =>
              item.setTitle('Turn into task').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, e => tasks.toggleTask(e, false));
              })
            );
          } else {
            menu.addItem(item =>
              item.setTitle('Remove checkbox').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, tasks.unmakeTask);
              })
            );
          }
          menu.addSeparator();
          menu.addItem(item =>
            item.setTitle('Go to note').onClick(() => {
              if (!this.plugin.cache) {
                return;
              }
              import('../utils/eventActions').then(({ openFileForEvent }) =>
                openFileForEvent(this.plugin.cache, this.app, e.id)
              );
            })
          );
          menu.addItem(item =>
            item.setTitle('Delete').onClick(async () => {
              if (!this.plugin.cache) {
                return;
              }
              const event = this.plugin.cache.getEventById(e.id);
              // If this is a recurring event, offer to delete only this instance
              if (event && (event.type === 'recurring' || event.type === 'rrule') && e.start) {
                const instanceDate =
                  e.start instanceof Date ? e.start.toISOString().slice(0, 10) : undefined;
                await this.plugin.cache.deleteEvent(e.id, { instanceDate });
              } else {
                await this.plugin.cache.deleteEvent(e.id);
              }
              new Notice(`Deleted event "${e.title}".`);
            })
          );
        } else {
          menu.addItem(item => {
            item.setTitle('No actions available on remote events').setDisabled(true);
          });
        }

        menu.showAtMouseEvent(mouseEvent);
      },
      toggleTask: async (eventApi, isDone) => {
        const eventId = eventApi.id;
        const event = this.plugin.cache.getEventById(eventId);
        if (!event) return false;

        const isRecurringSystem =
          event.type === 'recurring' || event.type === 'rrule' || event.recurringEventId;

        if (!isRecurringSystem) {
          const { toggleTask } = await import('../utils/tasks');
          await this.plugin.cache.updateEventWithId(eventId, toggleTask(event, isDone));
          return true;
        }

        if (!eventApi.start) return false;

        const instanceDate = DateTime.fromJSDate(eventApi.start).toISODate();
        if (!instanceDate) return false;

        try {
          await this.plugin.cache.toggleRecurringInstance(eventId, instanceDate, isDone);
          return true;
        } catch (e) {
          if (e instanceof Error) {
            new Notice(e.message);
          }
          return false;
        }
      }
    });

    // Initialize shadow events if starting in timeline view
    currentViewType = this.fullCalendarView?.view?.type || '';
    if (currentViewType.includes('resourceTimeline')) {
      if (!this.timelineResources) {
        this.timelineResources = this.buildTimelineResources();
        this.fullCalendarView?.setOption('resources', this.timelineResources);
        this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
      }
      this.addShadowEventsToView();
    }

    // @ts-ignore
    window.fc = this.fullCalendarView;

    this.registerDomEvent(this.containerEl, 'mouseenter', () => {
      this.plugin.providerRegistry.revalidateRemoteCalendars();
    });

    if (this.callback) {
      this.plugin.cache.off('update', this.callback);
      this.callback = null;
    }

    this.callback = this.plugin.cache.on('update', () => {
      if (!this.viewEnhancer || !this.fullCalendarView) {
        return;
      }

      // 1. Update manager with latest settings in case they changed.
      this.viewEnhancer.updateSettings(this.plugin.settings);
      // 2. Get fresh, fully-filtered sources from the manager.
      const allCachedSources = this.plugin.cache.getAllEvents();
      const { sources } = this.viewEnhancer.getEnhancedData(allCachedSources);

      // 3. Resync the entire calendar view.
      this.fullCalendarView.removeAllEventSources();
      sources.forEach(source => this.fullCalendarView?.addEventSource(source));

      // 4. Re-apply shadow events if needed.
      const viewType = this.fullCalendarView.view?.type;
      if (viewType && viewType.includes('resourceTimeline')) {
        this.addShadowEventsToView();
      }
    });
  }

  onResize(): void {
    if (this.fullCalendarView) {
      this.fullCalendarView.render();
    }
  }

  async onunload() {
    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }
    if (this.callback) {
      this.plugin.cache.off('update', this.callback);
      this.callback = null;
    }
  }
}
