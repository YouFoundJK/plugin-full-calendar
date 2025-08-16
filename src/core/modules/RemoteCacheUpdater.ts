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

    const remoteSources = this.cache.plugin.providerRegistry.getAllSources().filter(info => {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type);
      return provider && 'revalidate' in provider;
    });

    if (remoteSources.length === 0) {
      return;
    }

    this.revalidating = true;
    const promises = remoteSources.map(info => {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type)!;
      const config = (info as any).config;
      const settingsId = (info as any).id;
      if (!settingsId) {
        return Promise.reject(`Calendar source is missing an ID.`);
      }

      return provider
        .getEvents(config)
        .then(events => {
          this.cache.store.deleteEventsInCalendar(settingsId); // <-- USE SETTINGS ID
          const newEvents = events.map(([rawEvent, location]) => {
            const event = this.cache.enhancer.enhance(rawEvent);
            return {
              event,
              id: event.id || this.cache.generateId(),
              location,
              calendarId: settingsId // <-- USE SETTINGS ID
            };
          });

          newEvents.forEach(({ event, id, location }) => {
            this.cache.store.add({
              calendarId: settingsId, // <-- USE SETTINGS ID
              location,
              id,
              event
            });
          });

          this.cache.updateCalendar({
            id: settingsId, // <-- USE SETTINGS ID
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
