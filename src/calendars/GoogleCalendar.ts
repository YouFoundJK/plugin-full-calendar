/**
 * @file GoogleCalendar.ts
 * @brief Implements a remote, read-only calendar from a Google Calendar account.
 *
 * @description
 * This file defines the `GoogleCalendar` class, which fetches and parses event
 * data from the Google Calendar API. It is a read-only calendar source.
 *
 * @see RemoteCalendar.ts
 * @license See LICENSE.md
 */

import { CalendarInfo, OFCEvent } from '../types';
import { EventResponse } from './Calendar';
import { EditableCalendar, EditableEventResponse, CategoryProvider } from './EditableCalendar';
import { EventLocation } from '../types';
import { EventPathLocation } from '../core/EventStore';
import { TFile } from 'obsidian';
import FullCalendarPlugin from '../main';
import { convertEvent } from '../core/Timezone';
import { validateEvent } from '../types';
import { makeAuthenticatedRequest } from './parsing/google/request';
import { fromGoogleEvent, toGoogleEvent } from './parsing/google/parser';
import { FullCalendarSettings } from '../types/settings';
import { DateTime } from 'luxon';

export default class GoogleCalendar extends EditableCalendar {
  private plugin: FullCalendarPlugin;
  private _name: string;
  private _id: string; // This is the Google Calendar ID.

  constructor(plugin: FullCalendarPlugin, info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
    this.plugin = plugin;
    const googleInfo = info as Extract<CalendarInfo, { type: 'google' }>;
    this._name = googleInfo.name;
    this._id = googleInfo.id;
  }

  get type(): 'google' {
    return 'google';
  }

  get id(): string {
    // Override the base calendar ID to be more specific.
    return `google::${this._id}`;
  }

  get identifier(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  async getEvents(): Promise<EventResponse[]> {
    const displayTimezone = this.settings.displayTimezone;
    if (!displayTimezone) {
      return []; // Cannot process without a target timezone.
    }

    try {
      // Note: Google Calendar API's timeMin/timeMax are inclusive.
      // We can fetch a wide range; FullCalendar will handle displaying the correct window.
      // Fetching a year's worth of events is a reasonable default.
      const timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);

      const timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`
      );
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
      url.searchParams.set('singleEvents', 'true'); // Expands recurring events
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '2500');

      const data = await makeAuthenticatedRequest(this.plugin, url.toString());

      if (!data.items || !Array.isArray(data.items)) {
        console.warn(`No items in Google Calendar response for ${this.name}.`);
        return [];
      }

      return data.items
        .map((gEvent: any) => {
          const parsedEvent = fromGoogleEvent(gEvent, this.settings);
          if (!parsedEvent) {
            return null;
          }

          const validatedEvent = validateEvent(parsedEvent);
          if (!validatedEvent) {
            return null;
          }

          let translatedEvent = validatedEvent;
          // If the event has its own timezone, convert it to the display timezone.
          if (validatedEvent.timezone && validatedEvent.timezone !== displayTimezone) {
            translatedEvent = convertEvent(
              validatedEvent,
              validatedEvent.timezone,
              displayTimezone
            );
          }
          return [translatedEvent, null];
        })
        .filter((e: EventResponse | null): e is EventResponse => e !== null);
    } catch (e) {
      console.error(`Error fetching events for Google Calendar "${this.name}":`, e);
      // Don't show a notice for every single failed calendar fetch, as it could be noisy.
      // The console error is sufficient for debugging.
      return [];
    }
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    // Google event IDs are persistent and unique, so we use them as the local identifier.
    return event.uid || null;
  }

  // Add required methods for EditableCalendar compliance
  // Google Calendar is not file-based, so these are either no-ops or throw errors.

  get directory(): string {
    return ''; // Not applicable
  }

  containsPath(path: string): boolean {
    return false; // Not applicable
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    return []; // Not applicable
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, null]> {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`
    );
    const body = toGoogleEvent(event);

    const createdGEvent = await makeAuthenticatedRequest(this.plugin, url.toString(), 'POST', body);

    if (!createdGEvent) {
      throw new Error(
        'Failed to create Google Calendar event. The API returned an empty response.'
      );
    }

    // Parse the API response back into our internal format.
    const finalEvent = fromGoogleEvent(createdGEvent, this.settings);
    if (!finalEvent) {
      throw new Error("Could not parse the event returned by Google's API after creation.");
    }

    // For a remote calendar, the location is null, but we return the authoritative event.
    return [finalEvent, null];
  }

  async modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation | null) => void
  ): Promise<void> {
    const eventId = newEvent.uid || oldEvent.uid;
    if (!eventId) {
      throw new Error('Cannot modify a Google event without a UID/ID.');
    }
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.identifier
      )}/events/${encodeURIComponent(eventId)}`
    );
    const body = toGoogleEvent(newEvent);
    await makeAuthenticatedRequest(this.plugin, url.toString(), 'PUT', body);
    updateCacheWithLocation(null);
  }

  async deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void> {
    if (!event.uid) {
      throw new Error('Cannot delete a Google event without a UID.');
    }
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.identifier
      )}/events/${encodeURIComponent(event.uid)}`
    );
    await makeAuthenticatedRequest(this.plugin, url.toString(), 'DELETE');
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    // No-op for Google Calendar
    return;
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    // No-op for Google Calendar
    return;
  }

  /**
   * Creates an "exception" event for a recurring series.
   * This is used when a user modifies a single instance of a recurring event.
   */
  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<OFCEvent> {
    if (!masterEvent.uid) {
      throw new Error('Cannot override an instance of a recurring event that has no master UID.');
    }
    if (newEventData.allDay === false) {
      // The API requires the *original* start time of the instance we are overriding.
      // ADD a type guard here.
      if (masterEvent.allDay === false) {
        const originalStartTime = {
          dateTime: DateTime.fromISO(`${instanceDate}T${masterEvent.startTime}`).toISO(),
          timeZone: masterEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        const body = {
          ...toGoogleEvent(newEventData),
          recurringEventId: masterEvent.uid,
          originalStartTime: originalStartTime
        };

        const newGEvent = await makeAuthenticatedRequest(
          this.plugin,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.identifier)}/events`,
          'POST',
          body
        );

        const finalEvent = fromGoogleEvent(newGEvent, this.settings);
        if (!finalEvent) {
          throw new Error('Could not parse Google API response after creating instance override.');
        }
        return finalEvent;
      }
    }
    // Note: Overriding all-day events is more complex and not supported in this initial implementation.
    throw new Error(
      'Modifying a single instance of an all-day recurring event is not yet supported for Google Calendars.'
    );
  }

  /**
   * Cancels a single instance of a recurring event.
   * In the Google API, this means creating an exception event with a "cancelled" status.
   */
  async cancelInstance(parentEvent: OFCEvent, instanceDate: string): Promise<void> {
    if (!parentEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }

    const eventId = parentEvent.uid;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.identifier
    )}/events/${encodeURIComponent(eventId)}/instances`;

    // First, find the specific instanceId from the parent event.
    const instances = await makeAuthenticatedRequest(this.plugin, url);
    const instance = instances.items.find((inst: any) => {
      const instDate = inst.start.date || inst.start.dateTime.slice(0, 10);
      return instDate === instanceDate;
    });

    if (!instance) {
      throw new Error(`Could not find instance of recurring event on ${instanceDate} to cancel.`);
    }

    // Now, cancel that specific instance using its own ID.
    const cancelUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.identifier
    )}/events/${encodeURIComponent(instance.id)}`;

    await makeAuthenticatedRequest(this.plugin, cancelUrl, 'POST', { status: 'cancelled' });
  }
}
