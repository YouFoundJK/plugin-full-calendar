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
import EventCache from '../EventCache';
import { StoredEvent } from '../EventStore';
import { toggleTask } from '../../utils/tasks';
import { DeleteRecurringModal } from '../../ui/modals/DeleteRecurringModal';
import FullCalendarPlugin from '../../main';
import { getRuntimeCalendarId } from '../../ui/settings/utilsSettings';

/**
 * Manages all complex business logic related to recurring events.
 * This class is intended for internal use by the EventCache only.
 */
export class RecurringEventManager {
  private cache: EventCache;
  private plugin: FullCalendarPlugin;

  constructor(cache: EventCache, plugin: FullCalendarPlugin) {
    this.cache = cache;
    this.plugin = plugin;
  }

  private getProviderAndConfig(calendarId: string) {
    const calendarInfo = this.cache.plugin.settings.calendarSources.find(
      c => getRuntimeCalendarId(c) === calendarId
    );
    if (!calendarInfo) return null;
    const provider = this.plugin.providerRegistry.getProvider(calendarInfo.type);
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

      const masterLocalIdentifier = event.recurringEventId;
      const globalMasterIdentifier = `${calendarId}::${masterLocalIdentifier}`;

      // [DEBUG] logs for troubleshooting recurring event deletion

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

    // We need the *settings* ID of the calendar to call `addEvent`.
    const calendarInfo = this.plugin.settings.calendarSources.find(
      c => getRuntimeCalendarId(c) === masterCalendarId
    );
    if (!calendarInfo) throw new Error(`Could not find calendar info for ${masterCalendarId}`);

    // Inherit properties from the master event for the override.
    const finalOverrideEvent: OFCEvent = {
      ...overrideEventData,
      recurringEventId: this.cache
        .getGlobalIdentifier(masterEvent, masterCalendarId)
        ?.split('::')[2]
    };

    // 1. Add the new override event to the cache silently.
    await this.cache.addEvent((calendarInfo as any).id, finalOverrideEvent, { silent: true });

    // 2. Update the master event to skip the instance date, also silently.
    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        // Add the date to the skip list if it's not already there.
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
    const calendarInfo = this.cache.plugin.settings.calendarSources.find(
      c => getRuntimeCalendarId(c) === calendarId
    );
    if (!calendarInfo) {
      throw new Error(`Could not find calendar info for ${calendarId}`);
    }
    const provider = this.cache.plugin.providerRegistry.getProvider(calendarInfo.type);
    if (!provider) {
      throw new Error(`Could not find provider for calendar type ${calendarInfo.type}`);
    }
    const masterHandle = provider.getEventHandle(masterEvent, (calendarInfo as any).config);
    if (!masterHandle) {
      throw new Error('Could not create handle for master event.');
    }

    const [authoritativeOverrideEvent, overrideLocation] = await provider.createInstanceOverride(
      masterEvent,
      instanceDate,
      newEventData,
      (calendarInfo as any).config
    );

    const enhancedEvent = this.cache.enhancer.enhance(authoritativeOverrideEvent);
    const calendar = this.cache.getCalendarById(calendarId); // Keep this for adding to store
    if (!calendar) {
      throw new Error('Could not find calendar stub in cache.');
    }

    // 2. Add the new override event to the cache silently.
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
    this.cache.isBulkUpdating = true; // Prevent immediate flushes

    // 3. Update the master event to skip the instance date, also silently.
    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        const skipDates = e.skipDates.includes(instanceDate)
          ? e.skipDates
          : /* INF: */ [...e.skipDates, instanceDate];
        return { ...e, skipDates };
      },
      { silent: true }
    );

    // 4. Flush both atomic changes to the UI.
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
        // We need to create a new, completed override.
        const overrideEvent: OFCEvent = {
          ...clickedEvent,
          type: 'single',
          date: instanceDate,
          endDate: null
        };
        const completedOverrideEvent = toggleTask(overrideEvent, true);
        await this._createRecurringOverride(eventId, instanceDate, completedOverrideEvent);
      }
    } else {
      // === USE CASE: UN-COMPLETING A TASK ===
      if (clickedEvent.type === 'single' && clickedEvent.recurringEventId) {
        const masterLocalIdentifier = clickedEvent.recurringEventId;
        const globalMasterIdentifier = `${calendarId}::${masterLocalIdentifier}`;
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
    oldParentIdentifier: string,
    newParentIdentifier: string,
    newParentEvent: OFCEvent
  ): Promise<void> {
    const childrenToUpdate = this.cache.store
      .getAllEvents()
      .filter(e => e.calendarId === calendarId && e.event.recurringEventId === oldParentIdentifier);

    if (childrenToUpdate.length === 0) {
      return;
    }

    new Notice(`Updating ${childrenToUpdate.length} child event(s) to match new parent title.`);

    for (const childStoredEvent of childrenToUpdate) {
      const childDetails = this.cache.store.getEventDetails(childStoredEvent.id);
      if (!childDetails) continue;
      const {
        calendarId: childCalendarId,
        location: childLocation,
        event: childEvent
      } = childDetails;
      const childProvider = this.cache.getCalendarById(childCalendarId);
      if (!childProvider) continue;

      const updatedChildEvent: OFCEvent = {
        ...childEvent,
        title: newParentEvent.title,
        category: newParentEvent.category,
        recurringEventId: newParentIdentifier
      };

      const handle = childProvider.getEventHandle(
        childEvent,
        (this.getProviderAndConfig(childCalendarId) as any).config
      );
      if (!handle) continue;

      const newLocation = await childProvider.updateEvent(
        handle,
        childEvent,
        updatedChildEvent,
        (this.getProviderAndConfig(childCalendarId) as any).config
      );

      this.cache.store.delete(childStoredEvent.id);
      this.cache.store.add({
        calendarId: childCalendarId,
        location: newLocation,
        id: childStoredEvent.id,
        event: updatedChildEvent
      });

      this.cache.isBulkUpdating = true;
      this.cache.updateQueue.toRemove.add(childStoredEvent.id);
      this.cache.updateQueue.toAdd.set(childStoredEvent.id, {
        id: childStoredEvent.id,
        calendarId: childCalendarId,
        event: updatedChildEvent
      });
    }
  }

  /**
   * Intercepts an update request to see if a recurring master's identifier has changed.
   * If so, it updates all child overrides to point to the new parent identifier.
   * @returns `true` if the update was handled, `false` otherwise.
   */
  public async handleUpdate(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string
  ): Promise<boolean> {
    if (oldEvent.type !== 'recurring' && oldEvent.type !== 'rrule') {
      return false; // Not a recurring master, do nothing.
    }

    // PROVIDER-BASED LOGIC
    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) {
      return false;
    }
    const { provider, config } = providerResult;

    const oldHandle = provider.getEventHandle(oldEvent, config);
    const newHandle = provider.getEventHandle(newEvent, config);

    const oldLocalIdentifier = oldHandle?.persistentId;
    const newLocalIdentifier = newHandle?.persistentId;

    if (oldLocalIdentifier && newLocalIdentifier && oldLocalIdentifier !== newLocalIdentifier) {
      await this.updateRecurringChildren(
        calendarId,
        oldLocalIdentifier,
        newLocalIdentifier,
        newEvent
      );
    }

    return true; // Indicate that we've handled any necessary recurring logic.
  }
}
