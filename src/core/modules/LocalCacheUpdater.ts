/**
 * @file LocalCacheUpdater.ts
 * @brief Manages cache updates in response to local file system events.
 *
 * @description
 * This class is an internal module of the EventCache. It encapsulates all
 * logic for responding to file creations, updates, and deletions within the
 * Obsidian vault, ensuring the in-memory cache stays synchronized.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import equal from 'deep-equal';
import { TFile } from 'obsidian';

import EventCache, { CacheEntry } from '../EventCache';
import { StoredEvent } from '../EventStore';
import { EditableCalendar } from '../../calendars/EditableCalendar';
import { OFCEvent, validateEvent } from '../../types';
import { IdentifierManager } from './IdentifierManager';
import { getRuntimeCalendarId } from '../../ui/settings/utilsSettings';

/**
 * Compares two arrays of OFCEvents to see if they are different.
 * This is used to determine if a file update requires a cache update.
 */
const eventsAreDifferent = (oldEvents: OFCEvent[], newEvents: OFCEvent[]): boolean => {
  oldEvents.sort((a, b) => a.title.localeCompare(b.title));
  newEvents.sort((a, b) => a.title.localeCompare(b.title));

  oldEvents = oldEvents.flatMap(e => validateEvent(e) || []);
  newEvents = newEvents.flatMap(e => validateEvent(e) || []);

  if (oldEvents.length !== newEvents.length) {
    return true;
  }

  const unmatchedEvents = oldEvents
    .map((e, i) => ({ oldEvent: e, newEvent: newEvents[i] }))
    .filter(({ oldEvent, newEvent }) => !equal(oldEvent, newEvent));

  return unmatchedEvents.length > 0;
};

export class LocalCacheUpdater {
  private cache: EventCache;
  private identifierManager: IdentifierManager;

  constructor(cache: EventCache, identifierManager: IdentifierManager) {
    this.cache = cache;
    this.identifierManager = identifierManager;
  }

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  public handleFileDelete(path: string): void {
    const eventsToDelete = this.cache.store.getEventsInFile({ path });
    for (const storedEvent of eventsToDelete) {
      const calendarId = storedEvent.calendarId;
      this.identifierManager.removeMapping(storedEvent.event, calendarId);
    }

    // @ts-ignore: Accessing private store for refactoring
    this.cache.flushUpdateQueue([...this.cache.store.deleteEventsAtPath(path)], []);
  }

  /**
   * Main hook into the filesystem. Called when a file is created or updated.
   * It determines which calendars are affected by the change, reads the new
   * event data from the file, compares it to the old data in the cache,
   * and updates the EventStore and subscribing views if any changes are detected.
   *
   * @param file The file that has been updated in the Vault.
   */
  public async handleFileUpdate(file: TFile): Promise<void> {
    // [DEBUG] log for file update trigger
    console.log(`[DEBUG] LocalCacheUpdater.handleFileUpdate triggered for file:`, file.path);
    if (this.cache.isBulkUpdating) {
      return;
    }

    // Find all calendar sources that could be affected by this file change.
    // @ts-ignore
    const affectedSources = this.cache.calendarInfos.filter(info => {
      if (info.type === 'local' || info.type === 'dailynote') {
        const config = (info as any).config;
        const directory =
          info.type === 'local'
            ? config.directory
            : require('obsidian-daily-notes-interface').getDailyNoteSettings().folder;
        return file.path.startsWith(directory);
      }
      return false;
    });

    if (affectedSources.length === 0) {
      return;
    }

    const idsToRemove: string[] = [];
    const eventsToAdd: CacheEntry[] = [];

    for (const info of affectedSources) {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type);
      if (!provider) continue;

      const runtimeId = getRuntimeCalendarId(info);
      const calendar = this.cache.getCalendarById(runtimeId); // <-- Use the adapter instance
      if (!calendar) continue;

      // @ts-ignore: Accessing private store for refactoring
      const oldEvents = this.cache.store.getEventsInCalendar(calendar);
      const newEventResponses = await provider.getEvents((info as any).config);

      const oldEventsMapped = oldEvents.map(({ event }) => event);
      const newEventsMapped = newEventResponses.map(([event, _]) => event);

      if (!eventsAreDifferent(oldEventsMapped, newEventsMapped)) {
        continue;
      }

      // If events have changed, perform a full diff for this source.
      // @ts-ignore
      const oldSessionIds = this.cache.store.deleteEventsInCalendar(calendar);
      idsToRemove.push(...oldSessionIds);

      const newEventsWithIds = newEventResponses.map(([event, location]) => {
        const newSessionId = event.id || this.cache.generateId();
        this.identifierManager.addMapping(event, runtimeId, newSessionId);
        return {
          event,
          id: newSessionId,
          location,
          calendarId: runtimeId
        };
      });

      newEventsWithIds.forEach(({ event, id, location }) => {
        this.cache.store.add({
          calendarId: runtimeId,
          location,
          id,
          event
        });
      });
      eventsToAdd.push(...newEventsWithIds);
    }

    console.log(`[DEBUG] LocalCacheUpdater.handleFileUpdate flushing changes:`, {
      idsToRemove,
      eventsToAdd: eventsToAdd.map(e => ({ id: e.id, title: e.event.title }))
    });
    this.identifierManager.buildMap(this.cache.store);
    this.cache.flushUpdateQueue(idsToRemove, eventsToAdd);
  }
}
