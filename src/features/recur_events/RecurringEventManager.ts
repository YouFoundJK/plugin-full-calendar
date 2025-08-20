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

import { Notice } from 'obsidian';

import { OFCEvent } from '../../types';
import EventCache from '../../core/EventCache';
import { StoredEvent } from '../../core/EventStore';
import { toggleTask } from '../../utils/tasks';
import { DeleteRecurringModal } from '../../ui/modals/DeleteRecurringModal';
import FullCalendarPlugin from '../../main';

/**
 * Manages all complex business logic related to recurring events.
 * This class is intended for internal use by the EventCache only.
 */
export class RecurringEventManager {
  private cache: EventCache;
  private plugin: FullCalendarPlugin;

  // vvv ADD THIS HELPER METHOD vvv
  private _sanitizeTitleForFilename(title: string): string {
    return title
      .replace(/[\\/:"*?<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // ^^^ END OF BLOCK ^^^

  constructor(cache: EventCache, plugin: FullCalendarPlugin) {
    this.cache = cache;
    this.plugin = plugin;
  }

  private getProviderAndConfig(calendarId: string) {
    const calendarInfo = this.plugin.providerRegistry.getSource(calendarId);
    if (!calendarInfo) return null;
    const provider = this.plugin.providerRegistry.getInstance(calendarId);
    if (!provider) return null;
    return { provider, config: (calendarInfo as any).config };
  }

  /**
   * Checks if an override event's timing differs from what the original recurring instance would have been.
   * @param overrideEvent The override event to check
   * @param masterEvent The master recurring event
   * @param instanceDate The date of the instance
   * @returns true if the timing has been modified, false if it matches the original
   */
  private hasModifiedTiming(
    overrideEvent: OFCEvent,
    masterEvent: OFCEvent,
    instanceDate: string
  ): boolean {
    if (overrideEvent.type !== 'single') return false;
    if (masterEvent.type !== 'recurring' && masterEvent.type !== 'rrule') return false;

    // Check allDay status
    if (overrideEvent.allDay !== masterEvent.allDay) {
      return true;
    }

    // Check endDate - if override has an endDate but it's not the same as the instance date, it's modified
    if (overrideEvent.endDate && overrideEvent.endDate !== overrideEvent.date) {
      return true;
    }

    // For non-all-day events, check start and end times
    if (!masterEvent.allDay && 'startTime' in masterEvent && 'endTime' in masterEvent) {
      const masterStartTime = masterEvent.startTime;
      const masterEndTime = masterEvent.endTime;

      if (!overrideEvent.allDay && 'startTime' in overrideEvent && 'endTime' in overrideEvent) {
        const overrideStartTime = overrideEvent.startTime;
        const overrideEndTime = overrideEvent.endTime;

        if (overrideStartTime !== masterStartTime || overrideEndTime !== masterEndTime) {
          return true;
        }
      }
    }

    return false;
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

    const masterLocalIdentifier = this.cache
      .getGlobalIdentifier(masterEvent, calendarId)
      ?.split('::')[2];
    if (!masterLocalIdentifier) return [];

    return this.cache.store
      .getAllEvents()
      .filter(
        e => e.calendarId === calendarId && e.event.recurringEventId === masterLocalIdentifier
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
  public async handleDelete(eventId: string, event: OFCEvent, options?: any): Promise<boolean> {
    // Check if we are "undoing" an override. This is now the full operation.
    if (event.type === 'single' && event.recurringEventId) {
      const eventDetails = this.cache.store.getEventDetails(eventId);
      if (!eventDetails) return false;
      const { calendarId } = eventDetails;

      const masterFilename = event.recurringEventId;
      const providerResult = this.getProviderAndConfig(calendarId);
      if (!providerResult) {
        // Cannot proceed if provider/config is not found.
        console.warn(
          `Could not find provider for calendar ID ${calendarId}. Deleting orphan override.`
        );
        await this.cache.deleteEvent(eventId, { silent: true, force: true });
        this.cache.flushUpdateQueue([], []);
        return true;
      }
      const { config } = providerResult;
      // Reconstruct the master event's full path.
      const masterPath = `${(config as any).directory}/${masterFilename}`;
      const globalMasterIdentifier = `${calendarId}::${masterPath}`;

      const masterSessionId = await this.cache.getSessionId(globalMasterIdentifier);

      if (masterSessionId) {
        // [DEBUG] inspect store before processEvent
        await this.cache.processEvent(
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
      await this.cache.deleteEvent(eventId, { silent: true, force: true });
      this.cache.flushUpdateQueue([], []);
      return true;
    }

    const isRecurringMaster = event.type === 'recurring' || event.type === 'rrule';
    if (!isRecurringMaster) {
      return false;
    }

    const eventDetails = this.cache.store.getEventDetails(eventId);
    if (!eventDetails) return false;
    const { calendarId } = eventDetails;

    // REPLACE calendar lookup with provider lookup
    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) return false;
    const isGoogle = providerResult.provider.type === 'google';

    const children = this.findRecurringChildren(eventId);

    if (children.length > 0 || options?.instanceDate) {
      new DeleteRecurringModal(
        this.cache.plugin.app,
        () => this.promoteRecurringChildren(eventId),
        () => this.deleteAllRecurring(eventId),
        options?.instanceDate
          ? async () => {
              const updated = await this.cache.processEvent(eventId, e => {
                if (e.type !== 'recurring' && e.type !== 'rrule') return e;
                const skipDates = e.skipDates?.includes(options.instanceDate!)
                  ? e.skipDates
                  : [...(e.skipDates || []), options.instanceDate!];
                return { ...e, skipDates };
              });

              if (updated) {
                const details = this.cache.store.getEventDetails(eventId);
                if (details) {
                  const calendarSource = this.cache
                    .getAllEvents()
                    .find(s => s.id === details.calendarId);
                  if (calendarSource) {
                    this.cache.updateCalendar(calendarSource);
                  }
                }
              }
            }
          : undefined,
        options?.instanceDate,
        isGoogle
      ).open();
      return true;
    }

    return false;
  }

  /**
   * Private helper to perform the "skip and override" logic for recurring events.
   * It creates the new single-instance override AND updates the master event to skip that date.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDateToSkip The date of the original instance to add to the parent's skipDates.
   * @param overrideEventData The complete OFCEvent object for the new single-instance override.
   */
  private async _createRecurringOverride(
    masterEventId: string,
    instanceDateToSkip: string,
    overrideEventData: OFCEvent
  ): Promise<void> {
    const masterDetails = this.cache.store.getEventDetails(masterEventId);
    if (!masterDetails) throw new Error('Master event not found');
    const { calendarId: masterCalendarId, event: masterEvent } = masterDetails;

    // CORRECTED: This was the source of the calendarInfo error.
    const calendarInfo = this.plugin.providerRegistry.getSource(masterCalendarId);
    if (!calendarInfo) {
      throw new Error(`Could not find calendar info for ${masterCalendarId}`);
    }

    const globalIdentifier = this.cache.getGlobalIdentifier(masterEvent, masterCalendarId);
    if (!globalIdentifier) {
      throw new Error('Could not generate global identifier for master event.');
    }
    const masterPath = globalIdentifier.substring(masterCalendarId.length + 2);

    const masterFilename = masterPath.split('/').pop();
    if (!masterFilename) {
      throw new Error(`Could not extract filename from master event path: ${masterPath}`);
    }

    const finalOverrideEvent: OFCEvent = {
      ...overrideEventData,
      recurringEventId: masterFilename
    };

    // CORRECTED: The calendar ID for addEvent comes from the source info.
    await this.cache.addEvent((calendarInfo as any).id, finalOverrideEvent, { silent: true });

    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        const skipDates = e.skipDates.includes(instanceDateToSkip)
          ? e.skipDates
          : [...e.skipDates, instanceDateToSkip];
        return { ...e, skipDates };
      },
      { silent: true }
    );
  }

  /**
   * Handles the modification of a single instance of a recurring event.
   * This is triggered when a user drags or resizes an instance in the calendar view.
   * It creates an override event and adds an exception to the parent.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDate The original date of the instance that is being modified.
   * @param newEventData The new event data for the single-instance override.
   */
  public async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    if (newEventData.type !== 'single') {
      throw new Error('Cannot create a recurring override from a non-single event.');
    }

    const details = this.cache.store.getEventDetails(masterEventId);
    if (!details) {
      throw new Error('Master event not found for instance modification.');
    }
    const { calendarId, event: masterEvent } = details;

    // CORRECTED: Delegate the entire provider operation to the registry.
    const [authoritativeOverrideEvent, overrideLocation] =
      await this.plugin.providerRegistry.createInstanceOverrideInProvider(
        calendarId,
        masterEvent,
        instanceDate,
        newEventData
      );

    const enhancedEvent = this.cache.enhancer.enhance(authoritativeOverrideEvent);

    const overrideId = this.cache.generateId();
    this.cache.store.add({
      calendarId: calendarId,
      location: overrideLocation,
      id: overrideId,
      event: enhancedEvent
    });
    this.cache.updateQueue.toAdd.set(overrideId, {
      id: overrideId,
      calendarId: calendarId,
      event: enhancedEvent
    });
    this.cache.isBulkUpdating = true;

    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        const skipDates = e.skipDates.includes(instanceDate)
          ? e.skipDates
          : [...e.skipDates, instanceDate];
        return { ...e, skipDates };
      },
      { silent: true }
    );

    this.cache.flushUpdateQueue([], []);
  }

  /**
   * Handles the logic for marking an instance of a recurring event as complete or not.
   * This uses the "exception and override" strategy.
   * @param eventId The ID of the event instance clicked in the UI. This could be the parent recurring event or a single-event override.
   * @param instanceDate The specific date of the instance to modify (e.g., '2023-11-20').
   * @param isDone The desired completion state.
   */
  public async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    // Get the event that was actually clicked.
    const clickedEventDetails = this.cache.store.getEventDetails(eventId);
    if (!clickedEventDetails) return;
    const { event: clickedEvent, calendarId } = clickedEventDetails;

    if (isDone) {
      // === USE CASE: COMPLETING A TASK ===
      if (clickedEvent.type === 'single') {
        // The user clicked the checkbox on an existing, incomplete override.
        // We just need to update its status to complete.
        await this.cache.updateEventWithId(eventId, toggleTask(clickedEvent, true));
      } else {
        // The user clicked the checkbox on a master recurring instance.
        // We need to create a new, completed override by explicitly picking properties.

        let overrideEvent: OFCEvent;

        if (clickedEvent.allDay === false) {
          // This is a TIMED recurring event.
          overrideEvent = {
            // Inherit common properties
            title: clickedEvent.title,
            category: clickedEvent.category,
            subCategory: clickedEvent.subCategory,
            timezone: clickedEvent.timezone,

            // Inherit timed properties
            allDay: false,
            startTime: clickedEvent.startTime,
            endTime: clickedEvent.endTime,

            // Set specific properties for a single event
            type: 'single',
            date: instanceDate,
            endDate: null,
            completed: null // Will be set by toggleTask
          };
        } else {
          // This is an ALL-DAY recurring event.
          overrideEvent = {
            // Inherit common properties
            title: clickedEvent.title,
            category: clickedEvent.category,
            subCategory: clickedEvent.subCategory,
            timezone: clickedEvent.timezone,

            // Inherit all-day property
            allDay: true,

            // Set specific properties for a single event
            type: 'single',
            date: instanceDate,
            endDate: null,
            completed: null // Will be set by toggleTask
          };
        }

        const completedOverrideEvent = toggleTask(overrideEvent, true);
        await this._createRecurringOverride(eventId, instanceDate, completedOverrideEvent);
      }
    } else {
      // === USE CASE: UN-COMPLETING A TASK ===
      if (clickedEvent.type === 'single' && clickedEvent.recurringEventId) {
        const masterFilename = clickedEvent.recurringEventId;
        const providerResult = this.getProviderAndConfig(calendarId);
        if (!providerResult) {
          console.warn(
            `Could not find provider for calendar ID ${calendarId}. Deleting orphan override.`
          );
          await this.cache.deleteEvent(eventId);
          return;
        }

        const { config } = providerResult;
        const masterPath = `${(config as any).directory}/${masterFilename}`;
        const globalMasterIdentifier = `${calendarId}::${masterPath}`;
        const masterSessionId = await this.cache.getSessionId(globalMasterIdentifier);

        if (masterSessionId) {
          const masterEvent = this.cache.getEventById(masterSessionId);
          if (
            masterEvent &&
            this.hasModifiedTiming(clickedEventDetails.event, masterEvent, instanceDate)
          ) {
            // Timing has been modified, preserve the override but change completion status
            new Notice('Preserving modified event timing and uncompleting task.');
            await this.cache.updateEventWithId(
              eventId,
              toggleTask(clickedEventDetails.event, false)
            );
            return;
          }
        }
      }

      // Original logic: delete the override to revert to main recurring sequence
      new Notice('Reverting control to Main Recurring event sequence.');
      await this.cache.deleteEvent(eventId);
    }
  }

  public async updateRecurringChildren(
    calendarId: string,
    newParentFilename: string,
    newParentEvent: OFCEvent,
    oldParentEvent: OFCEvent
  ): Promise<void> {
    if (newParentEvent.type !== 'recurring' && newParentEvent.type !== 'rrule') {
      return;
    }

    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) return;
    const { provider, config } = providerResult;
    const directory = (config as any).directory;
    if (!directory) return;

    const oldFullTitle = this.plugin.cache.enhancer.prepareForStorage(oldParentEvent).title;
    const sanitizedOldTitle = this._sanitizeTitleForFilename(oldFullTitle);

    const childrenToUpdate = (newParentEvent.skipDates || []).flatMap((date: string) => {
      const childFilename = `${date} ${sanitizedOldTitle}.md`;
      const childPath = `${directory}/${childFilename}`;
      return this.cache.store.getEventsInFile({ path: childPath });
    });

    if (childrenToUpdate.length === 0) {
      return;
    }

    new Notice(`Updating ${childrenToUpdate.length} child event(s) to match new parent title.`);

    for (const childStoredEvent of childrenToUpdate) {
      const childDetails = this.cache.store.getEventDetails(childStoredEvent.id);
      if (!childDetails) continue;

      const { calendarId: childCalendarId, event: childEvent } = childDetails;

      // ====================================================================
      // THIS IS THE CORRECTED BLOCK
      // ====================================================================
      // 1. Create the version of the event for STORAGE on disk.
      // It has a flat title (e.g., "Category - Title") and no category fields.
      const storageChildEvent: OFCEvent = {
        ...childEvent,
        // Inherit the new full title from the parent that was prepared for storage.
        title: this.cache.enhancer.prepareForStorage(newParentEvent).title,
        recurringEventId: newParentFilename
      };
      delete storageChildEvent.category;
      delete storageChildEvent.subCategory;

      // 2. Create the version of the event for the in-memory CACHE and UI.
      // It has separate, structured fields for title, category, etc.
      const enhancedChildForCache: OFCEvent = {
        ...childEvent,
        // Inherit the new ENHANCED properties from the new parent event.
        title: newParentEvent.title,
        category: newParentEvent.category,
        subCategory: newParentEvent.subCategory,
        recurringEventId: newParentFilename
      };

      const handle = provider.getEventHandle(childEvent);
      if (!handle) continue;

      // 3. Pass the STORAGE version to the provider to write to the file.
      const newLocation = await provider.updateEvent(handle, childEvent, storageChildEvent);

      // 4. Pass the ENHANCED version to the cache store and the UI update queue.
      this.cache.store.delete(childStoredEvent.id);
      this.cache.store.add({
        calendarId: childCalendarId,
        location: newLocation,
        id: childStoredEvent.id,
        event: enhancedChildForCache // Use the correct version here
      });

      this.cache.isBulkUpdating = true; // This flag is still relevant for batching
      this.cache.updateQueue.toRemove.add(childStoredEvent.id);
      this.cache.updateQueue.toAdd.set(childStoredEvent.id, {
        id: childStoredEvent.id,
        calendarId: childCalendarId,
        event: enhancedChildForCache // And use the correct version here
      });
      // ====================================================================
    }
  }

  /**
   * Gatekeeper for update requests. Detects if a recurring parent is being renamed.
   * If so, it delegates to a private handler and returns true. Otherwise, returns false.
   * @returns `true` if the update was fully handled, `false` otherwise.
   */
  public async handleUpdate(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string
  ): Promise<boolean> {
    if (oldEvent.type !== 'recurring' && oldEvent.type !== 'rrule') {
      return false; // Not a recurring master, let the standard process handle it.
    }

    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) {
      return false;
    }
    const { provider, config } = providerResult;

    const oldHandle = provider.getEventHandle(oldEvent);
    const newHandle = provider.getEventHandle(newEvent);

    const oldPath = oldHandle?.persistentId;
    const newPath = newHandle?.persistentId;

    // A rename is happening if the persistent ID (the file path for notes) changes.
    if (oldPath && newPath && oldPath !== newPath) {
      // It's a rename. Delegate to the private handler to manage the entire atomic operation.
      await this._handleRecurringRename(oldEvent, newEvent, calendarId, oldHandle, newHandle);
      return true; // Signal that we've taken control.
    }

    return false; // Not a rename, let the standard process handle it.
  }

  /**
   * Private worker to handle the atomic update of a renamed recurring parent and all its children.
   * Manages the isBulkUpdating flag to prevent race conditions with the file watcher.
   */
  private async _handleRecurringRename(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string,
    oldHandle: import('../../providers/typesProvider').EventHandle,
    newHandle: import('../../providers/typesProvider').EventHandle
  ): Promise<void> {
    this.cache.isBulkUpdating = true;
    try {
      const providerResult = this.getProviderAndConfig(calendarId);
      if (!providerResult) {
        throw new Error(`Provider for calendar ${calendarId} not found during rename.`);
      }
      const { provider, config } = providerResult;

      // 1. Find the parent's session ID in the cache before doing anything.
      const parentGlobalId = this.cache.getGlobalIdentifier(oldEvent, calendarId);
      const parentSessionId = parentGlobalId ? await this.cache.getSessionId(parentGlobalId) : null;
      if (!parentSessionId) {
        throw new Error('Could not find original parent event in cache to update.');
      }

      // 2. Update all child notes to point to the new parent filename.
      const oldFilename = oldHandle.persistentId.split('/').pop();
      const newFilename = newHandle.persistentId.split('/').pop();
      if (oldFilename && newFilename) {
        await this.updateRecurringChildren(calendarId, newFilename, newEvent, oldEvent);
      }

      // 3. Now, perform the update on the parent event's file itself.
      const preparedOldEvent = this.cache.enhancer.prepareForStorage(oldEvent);
      const preparedNewEvent = this.cache.enhancer.prepareForStorage(newEvent);
      await provider.updateEvent(oldHandle, preparedOldEvent, preparedNewEvent);

      // 4. Update the parent event's entry in the cache store and queue the UI change.
      this.cache.store.delete(parentSessionId);
      this.cache.store.add({
        calendarId,
        location: { file: { path: newHandle.persistentId }, lineNumber: undefined },
        id: parentSessionId,
        event: newEvent
      });
      this.cache.updateQueue.toRemove.add(parentSessionId);
      this.cache.updateQueue.toAdd.set(parentSessionId, {
        id: parentSessionId,
        calendarId,
        event: newEvent
      });
    } catch (e) {
      console.error('Error during recurring parent rename operation:', e);
      new Notice('Error updating recurring event. Some children may not have been updated.');
      // The finally block will still run to clean up.
    } finally {
      this.cache.isBulkUpdating = false;
      // Flush all queued updates for the parent and children together.
      this.cache.flushUpdateQueue([], []);
    }
  }
}
