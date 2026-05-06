import { Notice } from 'obsidian';
import type { Calendar } from '@fullcalendar/core';
import type FullCalendarPlugin from '../main';
import type { CalendarView } from '../ui/view';
import { OFCEvent } from '../types';
import { launchCreateModal } from '../ui/modals/event_modal';

export class FullCalendarAPI {
  private plugin: FullCalendarPlugin;
  private activeViews: Set<CalendarView> = new Set();

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Registers a CalendarView instance so the API can interact with its underlying FullCalendar instance.
   */
  public registerView(view: CalendarView) {
    this.activeViews.add(view);
  }

  /**
   * Unregisters a CalendarView instance.
   */
  public unregisterView(view: CalendarView) {
    this.activeViews.delete(view);
  }

  /**
   * Gets the first active FullCalendar instance, if any are open.
   */
  private getActiveCalendar(): Calendar | null {
    for (const view of this.activeViews) {
      if (view.fullCalendarView) {
        return view.fullCalendarView;
      }
    }
    return null;
  }

  // ====================================================================
  //                         UI CONTROLS
  // ====================================================================

  /**
   * Opens the calendar in the main view or focuses it if already open.
   */
  public async openCalendar(): Promise<void> {
    await this.plugin.activateView();
  }

  /**
   * Opens the calendar sidebar.
   */
  public async openSidebar(): Promise<void> {
    const { FULL_CALENDAR_SIDEBAR_VIEW_TYPE } = await import('../ui/view');
    if (this.plugin.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
      return;
    }
    const targetLeaf = this.plugin.app.workspace.getRightLeaf(false);
    if (targetLeaf) {
      await targetLeaf.setViewState({
        type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
      });
      this.plugin.app.workspace.revealLeaf(targetLeaf);
    } else {
      console.warn('Right leaf not found for calendar view!');
    }
  }

  /**
   * Changes the current view of the calendar (e.g. 'timeGridWeek', 'dayGridMonth').
   * If the calendar is not open, it will open it first.
   */
  public async changeView(viewName: string): Promise<void> {
    let calendar = this.getActiveCalendar();
    if (!calendar) {
      await this.openCalendar();
      // Need to wait slightly for the view to render and register
      await new Promise(resolve => setTimeout(resolve, 100));
      calendar = this.getActiveCalendar();
    }

    if (calendar) {
      calendar.changeView(viewName);
    } else {
      new Notice('Failed to find active calendar view.');
    }
  }

  // ====================================================================
  //                         MODAL LAUNCHERS
  // ====================================================================

  /**
   * Opens the create event modal. Optionally prefill data.
   */
  public openCreateModal(initialData?: Partial<OFCEvent>): void {
    launchCreateModal(this.plugin, initialData || {});
  }

  // ====================================================================
  //                         DATA ACCESS
  // ====================================================================

  /**
   * Gets all events currently in the cache, formatted for FullCalendar.
   */
  public getAllEvents() {
    return this.plugin.cache.getAllEvents();
  }

  /**
   * Retrieve a specific event from the cache by its ID.
   */
  public getEventById(id: string): OFCEvent | null {
    return this.plugin.cache.getEventById(id);
  }
}
