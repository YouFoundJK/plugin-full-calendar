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
import { getRuntimeCalendarId } from '../../ui/settings/utilsSettings';

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
      return;
    }

    // @ts-ignore
    const remoteSources = this.cache.calendarInfos.filter(info => {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type);
      // A provider is "remote" if it has a `revalidate` method.
      return provider && 'revalidate' in provider;
    });

    if (remoteSources.length === 0) {
      return;
    }

    this.revalidating = true;
    const promises = remoteSources.map(info => {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type)!;
      const config = (info as any).config;
      const runtimeId = getRuntimeCalendarId(info);
      const calendar = this.cache.getCalendarById(runtimeId); // <-- Use the adapter instance
      if (!calendar) {
        // This should not happen if the cache is initialized correctly.
        return Promise.reject(`Calendar with runtime ID ${runtimeId} not found in cache.`);
      }

      return provider
        .getEvents(config)
        .then(events => {
          // @ts-ignore
          this.cache.store.deleteEventsInCalendar(calendar);

          const newEvents = events.map(([event, location]) => ({
            event,
            id: event.id || this.cache.generateId(),
            location,
            calendarId: runtimeId
          }));

          newEvents.forEach(({ event, id, location }) => {
            this.cache.store.add({
              calendarId: runtimeId,
              location,
              id,
              event
            });
          });

          this.cache.updateCalendar({
            id: runtimeId,
            editable: provider.getCapabilities(config).canEdit,
            color: info.color,
            events: newEvents
          });
        })
        .catch(err => {
          // Wrap the error with context about which calendar failed.
          const name = (info as any).name || info.type;
          throw new Error(`Failed to revalidate calendar "${name}": ${err.message}`);
        });
    });

    Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('One or more remote calendars failed to load. Check the console for details.');
        errors.forEach(reason => {
          console.error(`Full Calendar: Revalidation failed.`, reason);
        });
      }
    });
  }
}
