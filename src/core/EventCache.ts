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
import { getRuntimeCalendarId } from '../ui/settings/utilsSettings';
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
  private calendarInfos: CalendarInfo[] = [];
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
   * Flush the cache and initialize calendars from the initializer map.
   */
  reset(infos: CalendarInfo[]): void {
    this.initialized = false;
    this.calendarInfos = infos;
    this.calendars.clear();
    this._store.clear();
    this.updateQueue = { toRemove: new Set(), toAdd: new Map() }; // Clear the queue
    this.resync();

    this.calendarInfos.forEach(info => {
      const runtimeId = getRuntimeCalendarId(info);
      const provider = this.plugin.providerRegistry.getProvider(info.type);
      if (provider) {
        this.calendars.set(runtimeId, provider);
      } else {
        console.warn(
          `Full Calendar: Provider for type "${info.type}" not found during cache reset.`
        );
      }
    });

    // Re-initialize IdentifierManager with the new map.
    this.identifierManager = new IdentifierManager(this);
  }

  /**
   * Populate the cache with events.
   */
  async populate() {
    this.reset(this._plugin.settings.calendarSources);

    const promises = this.calendarInfos.map(async info => {
      const provider = this.plugin.providerRegistry.getProvider(info.type);
      if (!provider) {
        console.warn(`Full Calendar: Provider for type "${info.type}" not found.`);
        return;
      }
      try {
        const results = await provider.getEvents((info as any).config);
        const runtimeId = getRuntimeCalendarId(info);

        results.forEach(([rawEvent, location]) => {
          const event = this.enhancer.enhance(rawEvent);
          const id = event.id || this.generateId();
          this._store.add({
            calendarId: runtimeId,
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

      const calendarInfo = this.calendarInfos.find(c => getRuntimeCalendarId(c) === calId);
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

    const calendarInfo = this.calendarInfos.find(
      c => getRuntimeCalendarId(c) === details.calendarId
    );
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
    calendarId: string,
    event: OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const calendarInfo = this.calendarInfos.find(c => (c as any).id === calendarId);
    if (!calendarInfo) {
      throw new Error(`Calendar with settings ID ${calendarId} not found.`);
    }
    const provider = this.plugin.providerRegistry.getProvider(calendarInfo.type);
    if (!provider) {
      throw new Error(`Provider for type ${calendarInfo.type} is not registered.`);
    }
    const config = (calendarInfo as any).config;
    const runtimeId = getRuntimeCalendarId(calendarInfo);

    if (!provider.getCapabilities(config).canCreate) {
      throw new Error(`Cannot add event to a read-only calendar`);
    }

    const eventForStorage = this.enhancer.prepareForStorage(event);
    const [finalEvent, newLocation] = await provider.createEvent(eventForStorage, config);
    const id = this._store.add({
      calendarId: runtimeId,
      location: newLocation,
      id: finalEvent.id || this.generateId(),
      event: finalEvent
    });

    this.identifierManager.addMapping(finalEvent, runtimeId, id);

    const cacheEntry = { event: finalEvent, id, calendarId: runtimeId };

    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toAdd.set(id, cacheEntry);
    } else {
      this.flushUpdateQueue([], [cacheEntry]);
    }
    return true;
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
    const { provider, config, event } = this.getProviderForEvent(eventId);
    const details = this.store.getEventDetails(eventId);
    if (!details) throw new Error('Event details not found for deletion.');
    const calendarId = details.calendarId;

    if (!provider.getCapabilities(config).canDelete) {
      throw new Error(`Calendar of type "${provider.type}" does not support deleting events.`);
    }

    if (
      !options?.force &&
      (await this.recurringEventManager.handleDelete(eventId, event, options))
    ) {
      return; // The recurring manager opened a modal and will handle the rest.
    }

    // "Undo Override" logic unchanged
    if (event.type === 'single' && event.recurringEventId) {
      const masterLocalIdentifier = event.recurringEventId;
      const globalMasterIdentifier = `${calendarId}::${masterLocalIdentifier}`;
      const masterSessionId = await this.getSessionId(globalMasterIdentifier);

      if (masterSessionId) {
        await this.processEvent(
          masterSessionId,
          e => {
            if (e.type !== 'recurring' && e.type !== 'rrule') return e;
            const dateToUnskip = event.date;
            return {
              ...e,
              skipDates: e.skipDates.filter((d: string) => d !== dateToUnskip)
            };
          },
          { silent: true }
        );
      } else {
        console.warn(
          `Master recurring event with identifier "${globalMasterIdentifier}" not found. Deleting orphan override.`
        );
      }
    }

    const handle = provider.getEventHandle(event, config);
    if (!handle) {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
    } else {
      await provider.deleteEvent(handle, config);
    }

    this.identifierManager.removeMapping(event, calendarId);
    this._store.delete(eventId);

    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toRemove.add(eventId);
    } else {
      this.flushUpdateQueue([eventId], []);
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
    const { provider, config, event: oldEvent } = this.getProviderForEvent(eventId);
    const details = this.store.getEventDetails(eventId);
    if (!details) throw new Error('Event details not found for update.');
    const calendarId = details.calendarId;

    if (!provider.getCapabilities(config).canEdit) {
      throw new Error(`Calendar of type "${provider.type}" does not support editing events.`);
    }

    await this.recurringEventManager.handleUpdate(oldEvent, newEvent, calendarId);

    const handle = provider.getEventHandle(oldEvent, config);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }

    this.identifierManager.removeMapping(oldEvent, calendarId);

    const preparedOldEvent = this.enhancer.prepareForStorage(oldEvent);
    const preparedNewEvent = this.enhancer.prepareForStorage(newEvent);
    const newLocation = await provider.updateEvent(
      handle,
      preparedOldEvent,
      preparedNewEvent,
      config
    );
    this.store.delete(eventId);
    this.store.add({
      calendarId: calendarId,
      location: newLocation,
      id: eventId,
      event: newEvent
    });

    this.identifierManager.addMapping(newEvent, calendarId, eventId);

    const cacheEntry = {
      id: eventId,
      calendarId: calendarId,
      event: newEvent
    };

    if (options?.silent) {
      this.isBulkUpdating = true;
      this.updateQueue.toRemove.add(eventId);
      this.updateQueue.toAdd.set(eventId, cacheEntry);
    } else {
      this.flushUpdateQueue([eventId], [cacheEntry]);
    }
    return true;
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
    const calendarInfo = this.calendarInfos.find(c => (c as any).id === calendarId);
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

    const calendarInfo = this.calendarInfos.find(c => getRuntimeCalendarId(c) === calendarId);
    if (!calendarInfo) {
      throw new Error(`CalendarInfo for calendar ID ${calendarId} not found.`);
    }

    return { provider, config: (calendarInfo as any).config, location, event };
  }
}
