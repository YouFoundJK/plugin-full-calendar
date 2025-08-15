/**
 * @file LocalCacheUpdater.ts
 * @brief Manages cache updates in response to local file system events.
 *
 * @      const oldEvents = this.cache.store.getEventsInCalendar(runtimeId);
      const newEventResponses = await provider.getEvents((info as any).config);

      const oldEventsMapped = oldEvents.map(({ event }) => event);
      const newEventsMapped = newEventResponses.map(([event, _]) => event);

      if (!eventsAreDifferent(oldEventsMapped, newEventsMapped)) {
        continue;
      }

      // If events have changed, perform a full diff for this source.
      const oldSessionIds = this.cache.store.deleteEventsInCalendar(runtimeId);
      idsToRemove.push(...oldSessionIds); This class is an internal module of the EventCache. It encapsulates all
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
    if (this.cache.isBulkUpdating) {
      return;
    }

    // Get all events that were in the deleted file.
    const eventsInFile = this.cache.store.getEventsInFile({ path });
    if (eventsInFile.length === 0) {
      return; // No events were in this file, nothing to do.
    }

    const idsToRemove: string[] = [];
    for (const storedEvent of eventsInFile) {
      idsToRemove.push(storedEvent.id);
      this.identifierManager.removeMapping(storedEvent.event, storedEvent.calendarId);
    }

    // Delete all events at the path from the store and flush the changes to the UI.
    this.cache.store.deleteEventsAtPath(path);
    this.cache.flushUpdateQueue(idsToRemove, []);
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
    if (this.cache.isBulkUpdating) {
      return;
    }

    // Find all *local* calendar sources.
    const localCalendarInfos = (this.cache as any).calendarInfos.filter((info: any) => {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type);
      return provider && !provider.isRemote;
    });

    if (localCalendarInfos.length === 0) {
      return;
    }

    const idsToRemove = new Set<string>();
    const eventsToAdd = [];
    let hasChanges = false;

    for (const info of localCalendarInfos) {
      const provider = this.cache.plugin.providerRegistry.getProvider(info.type);
      // We already filtered for providers that have getEventsInFile
      if (!provider || !provider.getEventsInFile) {
        continue;
      }
      const config = (info as any).config;
      const runtimeId = getRuntimeCalendarId(info);

      // Check if the file is relevant to this calendar source.
      let isRelevant = false;
      if (info.type === 'local' && config.directory) {
        isRelevant = file.path.startsWith(config.directory + '/');
      } else if (info.type === 'dailynote') {
        const { folder } = require('obsidian-daily-notes-interface').getDailyNoteSettings();
        isRelevant = folder ? file.path.startsWith(folder + '/') : true;
      }

      if (!isRelevant) {
        continue;
      }

      // 1. Get old state for this specific file and calendar.
      const oldEventsForFile = this.cache.store.getEventsInFileAndCalendar(file, runtimeId);
      const oldEventsMapped = oldEventsForFile.map(e => e.event);

      // 2. Get new state from the file AND ENHANCE IT IMMEDIATELY.
      const newEventResponses = await provider.getEventsInFile(file, config);
      const newEnhancedEvents = newEventResponses.map(([event, _]) =>
        this.cache.enhancer.enhance(event)
      );

      // 3. Compare structured vs structured data.
      if (!eventsAreDifferent(oldEventsMapped, newEnhancedEvents)) {
        continue; // No changes in this file for this source.
      }

      hasChanges = true;

      // 4. Apply diff: accumulate events to remove.
      oldEventsForFile.forEach(oldEvent => {
        idsToRemove.add(oldEvent.id);
        this.identifierManager.removeMapping(oldEvent.event, oldEvent.calendarId);
      });

      // 5. Apply diff: accumulate events to add using the events we already enhanced.
      const newEventsWithIds = newEnhancedEvents.map((enhancedEvent, index) => {
        const location = newEventResponses[index][1];
        const newSessionId = enhancedEvent.id || this.cache.generateId();
        this.identifierManager.addMapping(enhancedEvent, runtimeId, newSessionId);
        return {
          event: enhancedEvent,
          id: newSessionId,
          location,
          calendarId: runtimeId
        };
      });

      eventsToAdd.push(...newEventsWithIds);
    }

    if (!hasChanges) {
      return;
    }

    // First, remove all old events from the store.
    idsToRemove.forEach(id => this.cache.store.delete(id));

    // Then, add all new events.
    eventsToAdd.forEach(({ event, id, location, calendarId }) => {
      this.cache.store.add({
        calendarId,
        location,
        id,
        event
      });
    });

    // Finally, flush the batched changes to the UI.
    const cacheEntriesToAdd: CacheEntry[] = eventsToAdd.map(({ event, id, calendarId }) => ({
      event,
      id,
      calendarId
    }));
    this.cache.flushUpdateQueue([...idsToRemove], cacheEntriesToAdd);
  }
}
