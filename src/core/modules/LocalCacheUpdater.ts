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
import { OFCEvent, validateEvent, EventLocation } from '../../types';
import { IdentifierManager } from './IdentifierManager';

/**
 * A stable identifier for an event within a file, used for diffing.
 * For now, we assume that if an event's title changes, it's a new event.
 */
function getEventIdentifier(event: OFCEvent): string {
  if (event.type === 'single' && event.date) {
    return `${event.date}::${event.title}`;
  }
  // Fallback for recurring/rrule or events without a date.
  // This is less stable but provides a baseline.
  return event.title;
}

interface DiffResult {
  toAdd: [OFCEvent, EventLocation | null][];
  toRemove: StoredEvent[];
  toUpdate: { oldEvent: StoredEvent; newEvent: [OFCEvent, EventLocation | null] }[];
}

/**
 * Compares two arrays of OFCEvents and returns a structured diff.
 */
function diffEvents(
  oldEvents: StoredEvent[],
  newEvents: [OFCEvent, EventLocation | null][]
): DiffResult {
  const result: DiffResult = {
    toAdd: [],
    toRemove: [],
    toUpdate: []
  };

  const oldEventMap = new Map<string, StoredEvent>();
  for (const oldEvent of oldEvents) {
    oldEventMap.set(getEventIdentifier(oldEvent.event), oldEvent);
  }

  for (const newEventTuple of newEvents) {
    const [newEvent] = newEventTuple;
    const identifier = getEventIdentifier(newEvent);
    const oldEventMatch = oldEventMap.get(identifier);

    if (oldEventMatch) {
      // Event exists in both old and new lists. Check if it has been updated.
      if (!equal(oldEventMatch.event, newEvent)) {
        result.toUpdate.push({ oldEvent: oldEventMatch, newEvent: newEventTuple });
      }
      // Remove from map so we can find deletions later.
      oldEventMap.delete(identifier);
    } else {
      // Event is new.
      result.toAdd.push(newEventTuple);
    }
  }

  // Any events left in the map are deletions.
  result.toRemove = [...oldEventMap.values()];

  return result;
}

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
    const localCalendarInfos = this.cache.plugin.providerRegistry
      .getAllSources()
      .filter((info: any) => {
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
      const settingsId = (info as any).id;
      if (!settingsId) continue;

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
      const oldEventsForFile = this.cache.store.getEventsInFileAndCalendar(file, settingsId); // <-- USE SETTINGS ID
      // 2. Get new state from the file AND ENHANCE IT IMMEDIATELY.
      const newEventResponses = await provider.getEventsInFile(file, config);
      const newEnhancedEventsWithLocation: [OFCEvent, EventLocation | null][] =
        newEventResponses.map(([event, location]) => [
          this.cache.enhancer.enhance(event),
          location
        ]);

      const diff = diffEvents(oldEventsForFile, newEnhancedEventsWithLocation);

      // 3. Compare structured vs structured data.
      if (diff.toAdd.length === 0 && diff.toRemove.length === 0 && diff.toUpdate.length === 0) {
        continue; // No changes in this file for this source.
      }

      hasChanges = true;

      // 4. Process removals
      for (const oldEvent of diff.toRemove) {
        idsToRemove.add(oldEvent.id);
        this.identifierManager.removeMapping(oldEvent.event, oldEvent.calendarId);
      }

      // Process updates
      for (const {
        oldEvent,
        newEvent: [newEvent, newLocation]
      } of diff.toUpdate) {
        // For an update, we reuse the session ID. This is a "remove" and "add" for the UI.
        idsToRemove.add(oldEvent.id);
        this.identifierManager.removeMapping(oldEvent.event, oldEvent.calendarId);
        this.identifierManager.addMapping(newEvent, settingsId, oldEvent.id); // <-- USE SETTINGS ID

        eventsToAdd.push({
          event: newEvent,
          id: oldEvent.id, // Reuse the ID
          location: newLocation,
          calendarId: settingsId
        });
      }

      // Process additions
      for (const [newEvent, newLocation] of diff.toAdd) {
        const newSessionId = this.cache.generateId();
        this.identifierManager.addMapping(newEvent, settingsId, newSessionId);
        eventsToAdd.push({
          event: newEvent,
          id: newSessionId,
          location: newLocation,
          calendarId: settingsId
        });
      }
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
