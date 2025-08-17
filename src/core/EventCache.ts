/**
 * @file EventCache.ts
 * @brief Centralized state management for all calendar event data.
 *
 * @description
 * The `EventCache` serves as the authoritative source for all calendar events within the plugin.
 * It is responsible for orchestrating the fetching, parsing, storing, and updating of event data
 * from all configured calendar sources (local and remote). The cache listens for changes in the
 * Obsidian Vault, manages create/update/delete (CUD) operations by delegating to the appropriate
 * calendar instance, and notifies registered UI views of any changes, ensuring the calendar view
 * remains in sync with the underlying data.
 *
 * @details
 * - Initialize and manage `Calendar` objects based on plugin settings.
 * - Fetch, parse, and store events in the internal `EventStore`.
 * - Provide event data to the UI in a FullCalendar-compatible format.
 * - Handle all CUD operations, delegating file I/O to the appropriate `EditableCalendar` instance.
 * - Subscribe to Vault changes and update internal state accordingly.
 * - Notify registered subscribers (views) of any changes to event data.
 * - Throttle and manage revalidation of remote calendars (ICS, CalDAV, etc.).
 * - Maintain a mapping between persistent event identifiers and session-specific IDs.
 * - Support recurring event management and override logic.
 * - Batch and flush updates for efficient UI synchronization.
 *
 * @example:
 * - Acts as the bridge between the source-of-truth for calendars (network or filesystem)
 *   and the FullCalendar UI plugin.
 * - Maintains an in-memory cache of all events to be displayed, in a normalized format.
 * - Provides a public API for querying and mutating events, as well as for view synchronization.
 *
 * @see EventStore.ts
 * @see RecurringEventManager.ts
 * @see ui/view.ts
 * @see EditableCalendar
 * @see RemoteCalendar
 *
 * @license See LICENSE.md
 */

import { Notice, TFile } from 'obsidian';

import FullCalendarPlugin from '../main';
import EventStore, { StoredEvent } from './EventStore';
import { RecurringEventManager } from './modules/RecurringEventManager';
import { RemoteCacheUpdater } from './modules/RemoteCacheUpdater';
import { LocalCacheUpdater } from './modules/LocalCacheUpdater';
import { IdentifierManager } from './modules/IdentifierManager';
import { CalendarInfo, OFCEvent, validateEvent } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { EventEnhancer } from './EventEnhancer';

export type CacheEntry = { event: OFCEvent; id: string; calendarId: string };

export type UpdateViewCallback = (
  info:
    | {
        type: 'events';
        toRemove: string[];
        toAdd: CacheEntry[];
      }
    | { type: 'calendar'; calendar: OFCEventSource } //  <-- ADD THIS LINE
    | { type: 'resync' }
) => void;

export type CachedEvent = Pick<StoredEvent, 'event' | 'id'>;

export type OFCEventSource = {
  events: CachedEvent[];
  editable: boolean;
  color: string;
  id: string;
};

/**
 * Persistent event cache that also can write events back to disk.
 *
 * The EventCache acts as the bridge between the source-of-truth for
 * calendars (either the network or filesystem) and the FullCalendar view plugin.
 *
 * It maintains its own copy of all events which should be displayed on calendars
 * in the internal event format.
 *
 * Pluggable Calendar classes are responsible for parsing and serializing events
 * from their source, but the EventCache performs all I/O itself.
 *
 * Subscribers can register callbacks on the EventCache to be updated when events
 * change on disk.
 */
export default class EventCache {
  // ====================================================================
  //                         STATE & INITIALIZATION
  // ====================================================================

  private _plugin: FullCalendarPlugin;
  private _store = new EventStore();
  private recurringEventManager: RecurringEventManager;
  private remoteUpdater: RemoteCacheUpdater;
  private localUpdater: LocalCacheUpdater;
  // You'll need to pass the new `calendars` map to the IdentifierManager,
  // but the map is not populated here anymore. We'll pass it in `reset`.
  // For now, let's pass an empty map. This will be fixed in the `reset` method.
  private identifierManager: IdentifierManager;

  calendars = new Map<string, CalendarProvider<any>>();
  initialized = false;

  public isBulkUpdating = false;

  public enhancer: EventEnhancer; // Make public for modules

  constructor(plugin: FullCalendarPlugin) {
    this._plugin = plugin;
    this.enhancer = new EventEnhancer(this.plugin.settings);
    this.recurringEventManager = new RecurringEventManager(this, this._plugin); // MODIFY THIS LINE
    this.remoteUpdater = new RemoteCacheUpdater(this);
    this.identifierManager = new IdentifierManager(this);
    this.localUpdater = new LocalCacheUpdater(this, this.identifierManager);
  }

  get plugin(): FullCalendarPlugin {
    return this._plugin;
  }

  get store(): EventStore {
    return this._store;
  }

  getProviders(): CalendarProvider<any>[] {
    return Array.from(this.calendars.values());
  }

  /**
   * Flush the cache and initialize calendars from the provider registry.
   */
  reset(): void {
    this.initialized = false;
    const infos = this.plugin.providerRegistry.getAllSources();
    this.calendars.clear();
    this._store.clear();
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() }; // Clear the queue
    this.resync();

    infos.forEach(info => {
      const settingsId = (info as any).id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', info);
        return;
      }
      const provider = this.plugin.providerRegistry.getProvider(info.type);
      if (provider) {
        this.calendars.set(settingsId, provider);
      } else {
        console.warn(
          `Full Calendar: Provider for type "${info.type}" not found during cache reset.`
        );
      }
    });

    this.identifierManager = new IdentifierManager(this);
    this.localUpdater = new LocalCacheUpdater(this, this.identifierManager);
  }

  /**
   * Populate the cache with events.
   */
  async populate() {
    this.reset();

    const promises = Array.from(this.calendars.entries()).map(async ([settingsId, provider]) => {
      const info = this.plugin.providerRegistry.getSource(settingsId);
      if (!info) {
        console.warn(`Full Calendar: Could not find calendar info for ID ${settingsId}.`);
        return;
      }
      try {
        const results = await provider.getEvents((info as any).config);
        results.forEach(([rawEvent, location]) => {
          const event = this.enhancer.enhance(rawEvent);
          const id = this.generateId();
          this._store.add({
            calendarId: settingsId,
            location,
            id,
            event
          });
        });
      } catch (e) {
        console.warn(`Full Calendar: Failed to load calendar source`, info, e);
      }
    });

    await Promise.allSettled(promises);

    this.initialized = true;
    this.identifierManager.buildMap(this._store);
    this.revalidateRemoteCalendars();
  }

  // ====================================================================
  //                         IDENTIFIER MANAGEMENT
  // ====================================================================

  generateId(): string {
    return this.identifierManager.generateId();
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    return this.identifierManager.getGlobalIdentifier(event, calendarId);
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    return this.identifierManager.getSessionId(globalIdentifier);
  }

  // ====================================================================
  //                         PUBLIC API - EVENT QUERIES
  // ====================================================================

  /**
   * Scans the event store and returns a list of all unique category names.
   * This is used to populate autocomplete suggestions in the UI.
   */
  getAllCategories(): string[] {
    const categories = new Set<string>();
    // Note: We need a way to iterate all events in the store.
    // Let's add a simple iterator to EventStore for this.
    for (const storedEvent of this._store.getAllEvents()) {
      if (storedEvent.event.category) {
        categories.add(storedEvent.event.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all events from the cache in a FullCalendar-friendly format.
   * @returns EventSourceInputs for FullCalendar.
   */
  getAllEvents(): OFCEventSource[] {
    const result: OFCEventSource[] = [];
    const eventsByCalendar = this._store.eventsByCalendar;
    for (const [calId, provider] of this.calendars.entries()) {
      const events = eventsByCalendar.get(calId) || [];
      const calendarInfo = this.plugin.providerRegistry.getSource(calId);
      if (!calendarInfo) continue;
      const config = (calendarInfo as any).config || {};
      const capabilities = provider.getCapabilities(config);
      const editable = capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
      result.push({
        editable,
        events: events.map(({ event, id }) => ({ event, id })),
        color: calendarInfo.color,
        id: calId
      });
    }
    return result;
  }

  /**
   * Check if an event is part of an editable calendar.
   * @param id ID of event to check
   * @returns
   */
  isEventEditable(id: string): boolean {
    const details = this._store.getEventDetails(id);
    if (!details) return false;
    const provider = this.calendars.get(details.calendarId);
    if (!provider) return false;
    const calendarInfo = this.plugin.providerRegistry.getSource(details.calendarId);
    if (!calendarInfo) return false;
    const config = (calendarInfo as any).config;
    const capabilities = provider.getCapabilities(config);
    return capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
  }

  getEventById(s: string): OFCEvent | null {
    return this._store.getEventById(s);
  }

  getCalendarById(c: string): CalendarProvider<any> | undefined {
    return this.calendars.get(c);
  }

  // ====================================================================
  //                         PUBLIC API - EVENT MUTATIONS
  // ====================================================================

  /**
   * Add an event to a given calendar.
   * @param calendarId ID of calendar to add event to.
   * @param event Event details
   * @returns Returns true if successful, false otherwise.
   */
  async addEvent(
    calendarId: string, // This is the settings-level ID from the UI/caller
    event: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    // Step 1: Get Provider, Config, and pre-flight checks
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) {
      new Notice(`Cannot add event: calendar with ID ${calendarId} not found.`);
      return false;
    }
    const provider = this.plugin.providerRegistry.getProvider(calendarInfo.type);
    if (!provider) {
      new Notice(`Cannot add event: provider for type ${calendarInfo.type} not found.`);
      return false;
    }
    const config = (calendarInfo as any).config;

    if (!provider.getCapabilities(config).canCreate) {
      new Notice(`Cannot add event to a read-only calendar.`);
      return false;
    }

    try {
      // Step 2: Optimistic state mutation
      const optimisticId = this.generateId();
      const optimisticEvent = event;

      this._store.add({
        calendarId: calendarId,
        location: null, // Location is unknown until provider returns
        id: optimisticId,
        event: optimisticEvent
      });
      this.identifierManager.addMapping(optimisticEvent, calendarId, optimisticId);

      // Step 3: Immediate UI update
      const optimisticCacheEntry: CacheEntry = {
        event: optimisticEvent,
        id: optimisticId,
        calendarId: calendarId
      };

      if (options?.silent) {
        this.updateQueue.toAdd.set(optimisticId, optimisticCacheEntry);
      } else {
        this.flushUpdateQueue([], [optimisticCacheEntry]);
      }

      // Step 4: Asynchronous I/O with rollback
      try {
        // Prepare the event for the provider (e.g., combine title and category)
        const eventForStorage = this.enhancer.prepareForStorage(event);
        const [finalEvent, newLocation] = await provider.createEvent(eventForStorage, config);

        // SUCCESS: The I/O succeeded. Update the store with the authoritative event.
        // The `finalEvent` from the provider is the source of truth. It needs to be enhanced
        // back into the structured format for the cache.
        const authoritativeEvent = this.enhancer.enhance(finalEvent);

        // Replace the optimistic event in the store with the authoritative one.
        this._store.delete(optimisticId);
        this._store.add({
          calendarId: calendarId,
          location: newLocation,
          id: optimisticId,
          event: authoritativeEvent
        });

        // Update ID mapping with the new authoritative data.
        this.identifierManager.removeMapping(optimisticEvent, calendarId);
        this.identifierManager.addMapping(authoritativeEvent, calendarId, optimisticId);

        // Flush this "correction" to the UI. The event is already visible,
        // but this updates its data to the final state from the server.
        const finalCacheEntry: CacheEntry = {
          event: authoritativeEvent,
          id: optimisticId,
          calendarId: calendarId
        };

        return true;
      } catch (e) {
        // FAILURE: I/O failed. Roll back all optimistic changes.
        console.error(`Failed to create event with provider. Rolling back cache state.`, {
          error: e
        });

        // Roll back store and mappings
        this.identifierManager.removeMapping(optimisticEvent, calendarId);
        this._store.delete(optimisticId);

        // Roll back UI
        if (options?.silent) {
          this.updateQueue.toAdd.delete(optimisticId);
        } else {
          this.flushUpdateQueue([optimisticId], []);
        }

        new Notice('Failed to create event. Change has been reverted.');
        return false;
      }
    } finally {
    }
  }

  /**
   * Deletes an event by its ID.
   *
   * @param eventId ID of the event to delete.
   * @param options Options for the delete operation.
   * @returns Promise that resolves when the delete operation is complete.
   */
  async deleteEvent(
    eventId: string,
    options?: { silent?: boolean; instanceDate?: string; force?: boolean }
  ): Promise<void> {
    // Step 1: Get all original details for potential rollback.
    const originalDetails = this.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not found for deletion.`);
    }
    const { provider, config, event } = this.getProviderForEvent(eventId);

    // Step 2: Pre-flight checks and recurring event logic
    if (!provider.getCapabilities(config).canDelete) {
      throw new Error(`Calendar of type "${provider.type}" does not support deleting events.`);
    }

    if (
      !options?.force &&
      (await this.recurringEventManager.handleDelete(eventId, event, options))
    ) {
      // The recurring manager handled the deletion logic (e.g., by showing a modal).
      // It will call back into `deleteEvent` with `force:true` if needed.
      return;
    }

    const handle = provider.getEventHandle(event, config);

    try {
      // Step 3: Optimistic state mutation
      this.identifierManager.removeMapping(event, originalDetails.calendarId);
      this._store.delete(eventId);

      // Step 4: Immediate UI update
      if (options?.silent) {
        this.updateQueue.toRemove.add(eventId);
      } else {
        this.flushUpdateQueue([eventId], []);
      }

      // Step 5: Asynchronous I/O with rollback
      if (!handle) {
        console.warn(
          `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
        );
        // No I/O to perform, so no rollback is necessary. The operation is complete.
        return;
      }

      try {
        await provider.deleteEvent(handle, config);
        // SUCCESS: The external source is now in sync with the cache.
      } catch (e) {
        // FAILURE: The I/O operation failed. Roll back the optimistic changes.
        console.error(`Failed to delete event with provider. Rolling back cache state.`, {
          eventId,
          error: e
        });

        // Re-add event to the store
        const locationForStore = originalDetails.location
          ? {
              file: { path: originalDetails.location.path },
              lineNumber: originalDetails.location.lineNumber
            }
          : null;

        this._store.add({
          calendarId: originalDetails.calendarId,
          location: locationForStore,
          id: originalDetails.id,
          event: originalDetails.event
        });

        // Restore ID mapping
        this.identifierManager.addMapping(
          originalDetails.event,
          originalDetails.calendarId,
          originalDetails.id
        );

        // Roll back the UI update
        const cacheEntry: CacheEntry = {
          event: originalDetails.event,
          id: originalDetails.id,
          calendarId: originalDetails.calendarId
        };

        if (options?.silent) {
          // If part of a bulk operation, reverse the change in the queue.
          this.updateQueue.toRemove.delete(eventId);
          this.updateQueue.toAdd.set(eventId, cacheEntry);
        } else {
          // Otherwise, flush the reversal to the UI immediately.
          this.flushUpdateQueue([], [cacheEntry]);
        }

        new Notice('Failed to delete event. Change has been reverted.');

        // Propagate the error to the original caller.
        throw e;
      }
    } finally {
    }
  }

  /**
   * Updates an event with the given ID.
   *
   * @param eventId ID of the event to update.
   * @param newEvent New event data.
   * @param options Options for the update operation.
   * @returns Promise that resolves when the update operation is complete.
   */
  async updateEventWithId(
    eventId: string,
    newEvent: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    // Step 1: Get all original details for potential rollback
    const originalDetails = this.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not present in event store.`);
    }

    const { provider, config, event: oldEvent } = this.getProviderForEvent(eventId);
    const calendarId = originalDetails.calendarId;

    // Step 2: Pre-flight checks and recurring event logic
    if (!provider.getCapabilities(config).canEdit) {
      throw new Error(`Calendar of type "${provider.type}" does not support editing events.`);
    }

    // Let the recurring manager intercept and potentially take over the entire update process
    // if a recurring parent's title/file is being renamed.
    const handledByRecurringManager = await this.recurringEventManager.handleUpdate(
      oldEvent,
      newEvent,
      calendarId
    );
    if (handledByRecurringManager) {
      return true; // The recurring manager took full control and completed the update.
    }

    const handle = provider.getEventHandle(oldEvent, config);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }

    this.isBulkUpdating = true;
    try {
      // Step 3: Optimistic state mutation
      // Remove the old event and its mappings
      this.identifierManager.removeMapping(oldEvent, calendarId);
      this.store.delete(eventId);

      // Add the new event and its mappings, using the same session ID
      const newEventWithId = newEvent;

      // FIX: Convert the location from the stored format back to the input format.
      const locationForStore = originalDetails.location
        ? {
            file: { path: originalDetails.location.path },
            lineNumber: originalDetails.location.lineNumber
          }
        : null;

      this.store.add({
        calendarId: calendarId,
        location: locationForStore, // Use the correctly formatted location
        id: eventId,
        event: newEventWithId
      });
      this.identifierManager.addMapping(newEventWithId, calendarId, eventId);

      // Step 4: Immediate UI update
      const newCacheEntry: CacheEntry = {
        event: newEventWithId,
        id: eventId,
        calendarId: calendarId
      };

      // The UI needs to know to remove the old event and add the new one.
      // This is how FullCalendar handles an "update".
      if (options?.silent) {
        this.updateQueue.toRemove.add(eventId);
        this.updateQueue.toAdd.set(eventId, newCacheEntry);
      } else {
        this.flushUpdateQueue([eventId], [newCacheEntry]);
      }

      // Step 5: Asynchronous I/O with rollback
      try {
        // Prepare events for storage (e.g., flatten title and category).
        const preparedOldEvent = this.enhancer.prepareForStorage(oldEvent);
        const preparedNewEvent = this.enhancer.prepareForStorage(newEvent);

        const updatedLocation = await provider.updateEvent(
          handle,
          preparedOldEvent,
          preparedNewEvent,
          config
        );

        // SUCCESS: The I/O succeeded. Correct the location in the store if it changed.
        // This ensures our cache is perfectly in sync with the source of truth.
        if (updatedLocation && updatedLocation.file.path !== originalDetails.location?.path) {
          this.store.delete(eventId);
          this.store.add({
            calendarId: calendarId,
            location: updatedLocation,
            id: eventId,
            event: newEventWithId
          });
        }

        return true;
      } catch (e) {
        // FAILURE: I/O failed. Roll back all optimistic changes.
        console.error(`Failed to update event with provider. Rolling back cache state.`, {
          eventId,
          error: e
        });

        // Roll back store and mappings to original state
        this.identifierManager.removeMapping(newEventWithId, calendarId);
        this.store.delete(eventId);

        const locationForStore = originalDetails.location
          ? {
              file: { path: originalDetails.location.path },
              lineNumber: originalDetails.location.lineNumber
            }
          : null;

        this.store.add({
          calendarId: originalDetails.calendarId,
          location: locationForStore,
          id: originalDetails.id,
          event: originalDetails.event
        });
        this.identifierManager.addMapping(
          originalDetails.event,
          originalDetails.calendarId,
          originalDetails.id
        );

        // Roll back the UI update
        const originalCacheEntry: CacheEntry = {
          event: originalDetails.event,
          id: originalDetails.id,
          calendarId: originalDetails.calendarId
        };

        if (options?.silent) {
          this.updateQueue.toRemove.delete(eventId); // Should already be gone, but be safe
          this.updateQueue.toAdd.set(eventId, originalCacheEntry);
        } else {
          // Replace the new version with the original
          this.flushUpdateQueue([eventId], [originalCacheEntry]);
        }

        new Notice('Failed to update event. Change has been reverted.');
        return false;
      }
    } finally {
      this.isBulkUpdating = false;
    }
  }

  /**
   * Transform an event that's already in the event store.
   *
   * A more "type-safe" wrapper around updateEventWithId(),
   * use this function if the caller is only modifying few
   * known properties of an event.
   * @param id ID of event to transform.
   * @param process function to transform the event.
   * @returns true if the update was successful.
   */
  processEvent(
    id: string,
    process: (e: OFCEvent) => OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const event = this.store.getEventById(id);
    if (!event) {
      throw new Error('Event does not exist');
    }
    const newEvent = process(event);
    return this.updateEventWithId(id, newEvent, options);
  }

  async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    await this.recurringEventManager.toggleRecurringInstance(eventId, instanceDate, isDone);
    this.flushUpdateQueue([], []);
  }

  async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    const eventForStorage = this.enhancer.prepareForStorage(newEventData);
    await this.recurringEventManager.modifyRecurringInstance(
      masterEventId,
      instanceDate,
      eventForStorage
    );
    this.flushUpdateQueue([], []);
  }

  async moveEventToCalendar(eventId: string, newCalendarId: string): Promise<void> {
    // TODO: This method needs to be re-implemented at the provider level.
    // For now, it will be a no-op that logs a warning.
    console.warn('Moving events between calendars is not fully supported in this version.');
    const event = this._store.getEventById(eventId);
    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    // A simple re-implementation: delete from the old, add to the new.
    // This is not atomic and may have side-effects, but it's a step forward.
    await this.deleteEvent(eventId);
    await this.addEvent(newCalendarId, event);
  }

  // ====================================================================
  //                         VIEW SYNCHRONIZATION
  // ====================================================================

  private updateViewCallbacks: UpdateViewCallback[] = [];

  public updateQueue: { toRemove: Set<string>; toAdd: Map<string, CacheEntry> } = {
    toRemove: new Set(),
    toAdd: new Map()
  };

  /**
   * Register a callback for a view.
   * @param eventType event type (currently just "update")
   * @param callback
   * @returns reference to callback for de-registration.
   */
  on(eventType: 'update', callback: UpdateViewCallback) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.push(callback);
        break;
    }
    return callback;
  }

  /**
   * De-register a callback for a view.
   * @param eventType event type
   * @param callback callback to remove
   */
  off(eventType: 'update', callback: UpdateViewCallback) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.remove(callback);
        break;
    }
  }

  resync(): void {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'resync' });
    }
  }

  /**
   * Push updates to all subscribers.
   * @param toRemove IDs of events to remove from the view.
   * @param toAdd Events to add to the view.
   */
  private updateViews(toRemove: string[], toAdd: CacheEntry[]) {
    const payload = {
      toRemove,
      toAdd
    };

    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'events', ...payload });
    }
  }

  public flushUpdateQueue(toRemove: string[], toAdd: CacheEntry[]): void {
    if (toRemove.length > 0 || toAdd.length > 0) {
      this.updateViews(toRemove, toAdd);
    }

    if (this.updateQueue.toRemove.size === 0 && this.updateQueue.toAdd.size === 0) {
      return;
    }

    this.isBulkUpdating = false;

    toRemove = [...this.updateQueue.toRemove];
    toAdd = [...this.updateQueue.toAdd.values()];

    this.updateViews(toRemove, toAdd);

    // Clear the queue for the next batch of operations.
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() };
  }

  // VIEW SYNCHRONIZATION
  public updateCalendar(calendar: OFCEventSource) {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'calendar', calendar });
    }
  }

  // ====================================================================
  //                         FILESYSTEM & REMOTE HOOKS
  // ====================================================================

  /**
   * Deletes all events associated with a given file path from the EventStore
   * and notifies views to remove them.
   *
   * @param path Path of the file that has been deleted.
   */
  deleteEventsAtPath(path: string) {
    this.localUpdater.handleFileDelete(path);
  }

  /**
   * Main hook into the filesystem. Called when a file is created or updated.
   * It determines which calendars are affected by the change, reads the new
   * event data from the file, compares it to the old data in the cache,
   * and updates the EventStore and subscribing views if any changes are detected.
   *
   * @param file The file that has been updated in the Vault.
   * @remarks This is an async method and can be prone to race conditions if
   * a file is updated multiple times in quick succession.
   */
  async fileUpdated(file: TFile): Promise<void> {
    this.localUpdater.handleFileUpdate(file);
  }

  /**
   * Revalidates all remote calendars (ICS, CalDAV) to fetch the latest events.
   * This operation is non-blocking. As each calendar finishes fetching, it
   * updates the cache and the UI.
   *
   * @param force - If true, bypasses the throttling mechanism and fetches immediately.
   *                Defaults to false.
   * @remarks Revalidation is throttled by MILLICONDS_BETWEEN_REVALIDATIONS to avoid
   * excessive network requests.
   */
  revalidateRemoteCalendars(force = false) {
    this.remoteUpdater.revalidate(force);
  }

  // ====================================================================
  //                         TESTING UTILITIES
  // ====================================================================

  get _storeForTest() {
    return this._store;
  }

  async checkForDuplicate(calendarId: string, event: OFCEvent): Promise<boolean> {
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) {
      throw new Error(`Calendar with settings ID ${calendarId} not found.`);
    }
    const provider = this.plugin.providerRegistry.getProvider(calendarInfo.type);
    if (!provider) {
      // If no provider, it can't be a duplicate.
      return false;
    }
    const config = (calendarInfo as any).config;

    // Check if provider has the method, otherwise default to false.
    if (
      'checkForDuplicate' in provider &&
      typeof (provider as any).checkForDuplicate === 'function'
    ) {
      return (provider as any).checkForDuplicate(event, config);
    }
    return false;
  }

  private getProviderForEvent(eventId: string) {
    const details = this._store.getEventDetails(eventId);
    if (!details) {
      throw new Error(`Event ID ${eventId} not present in event store.`);
    }
    const { calendarId, location, event } = details;
    const provider = this.calendars.get(calendarId);
    if (!provider) {
      throw new Error(`Provider for calendar ID ${calendarId} not found in cache map.`);
    }
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) {
      throw new Error(`CalendarInfo for calendar ID ${calendarId} not found.`);
    }
    return { provider, config: (calendarInfo as any).config, location, event };
  }
}
