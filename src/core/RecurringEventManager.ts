// FILE: src/core/RecurringEventManager.ts

import EventCache from './EventCache';
import { OFCEvent, validateEvent } from '../types';
import { StoredEvent } from './EventStore';
import { Notice } from 'obsidian';
import { DeleteRecurringModal } from '../ui/modals/DeleteRecurringModal';
import { toggleTask } from './tasks';
import { DateTime } from 'luxon';

/**
 * @file RecurringEventManager.ts
 * @brief Manages all complex business logic related to recurring events.
 *
 * @description
 * This class is an internal component of the EventCache and is not intended
 * to be used directly. It encapsulates the logic for handling recurring event
 * modifications, deletions, and overrides (exceptions).
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

/**
 * Manages all complex business logic related to recurring events.
 * This class is intended for internal use by the EventCache only.
 */
export class RecurringEventManager {
  private cache: EventCache;

  constructor(cache: EventCache) {
    this.cache = cache;
  }

  /**
   * Finds all override events that are children of a given master recurring event.
   * @param masterEventId The session ID of the master recurring event.
   * @returns An array of StoredEvent objects representing the child overrides.
   */
  private findRecurringChildren(masterEventId: string): StoredEvent[] {
    const masterEventDetails = this.cache.store.getEventDetails(masterEventId);
    if (!masterEventDetails) return [];

    const { calendarId, event: masterEvent } = masterEventDetails;
    const calendar = this.cache.calendars.get(calendarId);
    if (!calendar) return [];

    // The local identifier is what's stored in the child's `recurringEventId` field.
    const masterLocalIdentifier = calendar.getLocalIdentifier(masterEvent);
    if (!masterLocalIdentifier) return [];

    return this.cache.store
      .getAllEvents()
      .filter(
        e => e.calendarId === calendar.id && e.event.recurringEventId === masterLocalIdentifier
      );
  }

  public async promoteRecurringChildren(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    if (children.length === 0) {
      // No children to promote, just delete the master.
      await this.cache.deleteEvent(masterEventId, { force: true });
      return;
    }

    new Notice(`Promoting ${children.length} child event(s).`);
    for (const child of children) {
      await this.cache.processEvent(
        child.id,
        e => ({
          ...e,
          recurringEventId: undefined
        }),
        { silent: true }
      );
    }

    // Now delete the original master event
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    new Notice('Recurring event deleted and children promoted.');
  }

  public async deleteAllRecurring(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    new Notice(`Deleting recurring event and its ${children.length} child override(s)...`);

    for (const child of children) {
      await this.cache.deleteEvent(child.id, { force: true, silent: true });
    }

    // Finally, delete the master event itself
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    new Notice('Successfully deleted recurring event and all children.');
  }

  /**
   * Intercepts a delete request to see if it's a recurring master with children.
   * If so, it opens a modal to ask the user how to proceed.
   * @returns `true` if the deletion was handled (modal opened), `false` otherwise.
   */
  public handleDelete(eventId: string, event: OFCEvent, options?: { force?: boolean }): boolean {
    if (options?.force) {
      return false; // If forced, don't show the modal. Let the cache handle it.
    }

    const isRecurringMaster = event.type === 'recurring' || event.type === 'rrule';
    if (!isRecurringMaster) {
      return false;
    }

    const children = this.findRecurringChildren(eventId);
    if (children.length > 0) {
      new DeleteRecurringModal(
        this.cache.plugin.app,
        () => this.promoteRecurringChildren(eventId),
        () => this.deleteAllRecurring(eventId)
      ).open();
      return true; // Deletion is handled by the modal, stop further processing.
    }

    return false; // No children, proceed with normal deletion.
  }
}
