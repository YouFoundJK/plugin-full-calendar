// PASTE THIS INTO: src/core/modules/RemoteCacheUpdater.ts

/**
 * @file RemoteCacheUpdater.ts
 * @brief Manages the synchronization logic for remote calendars.
 *
 * @description
 * This class is an internal module of the EventCache. It encapsulates the
 * logic for revalidating remote calendars (ICS, CalDAV, Google), including
 * throttling requests to avoid excessive network traffic.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import EventCache from '../EventCache';
import RemoteCalendar from '../../calendars/RemoteCalendar';
import { EditableCalendar } from '../../calendars/EditableCalendar'; // <-- THE CRITICAL MISSING IMPORT

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

export class RemoteCacheUpdater {
  private cache: EventCache;
  private revalidating = false;
  private lastRevalidation = 0;

  constructor(cache: EventCache) {
    this.cache = cache;
  }

  public revalidate(force = false): void {
    if (this.revalidating) {
      console.warn('Revalidation already in progress.');
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      // console.debug('Last revalidation was too soon.');
      return;
    }

    // A calendar is "remote" if it's a legacy RemoteCalendar OR if it's an
    // EditableCalendar that has a `revalidate` method (our adapter).
    const remoteCalendars = [...this.cache.calendars.values()].filter(
      (c): c is RemoteCalendar | (EditableCalendar & { revalidate: () => Promise<void> }) =>
        c instanceof RemoteCalendar ||
        (c instanceof EditableCalendar &&
          'revalidate' in c &&
          typeof (c as any).revalidate === 'function')
    );

    if (remoteCalendars.length === 0) {
      return;
    }

    this.revalidating = true;
    const promises = remoteCalendars.map(calendar => {
      // Both RemoteCalendar and our adapted EditableCalendar are guaranteed to have `revalidate`.
      return calendar
        .revalidate()
        .then(() => calendar.getEvents())
        .then(events => {
          // The `events` parameter is now correctly typed as EventResponse[]
          // @ts-ignore: Accessing private store for refactoring
          this.cache.store.deleteEventsInCalendar(calendar);
          const newEvents = events.map(([event, location]) => ({
            event,
            id: event.id || this.cache.generateId(),
            location,
            calendarId: calendar.id
          }));
          newEvents.forEach(({ event, id, location }) => {
            // @ts-ignore: Accessing private store for refactoring
            this.cache.store.add({
              calendar,
              location,
              id,
              event
            });
          });
          this.cache.updateCalendar({
            id: calendar.id,
            // An editable calendar can still be remote (e.g. Google).
            editable: calendar instanceof EditableCalendar,
            color: calendar.color,
            events: newEvents
          });
        });
    });
    Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('A remote calendar failed to load. Check the console for more details.');
        errors.forEach(reason => {
          console.error(`Revalidation failed with reason: ${reason}`);
        });
      }
    });
  }
}
