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
import RemoteCalendar from './RemoteCalendar';
import { FullCalendarSettings } from '../types/settings';
import FullCalendarPlugin from '../main';
import { convertEvent } from '../core/Timezone';
import { validateEvent } from '../types';
import { makeAuthenticatedRequest } from './parsing/google/request';
import { fromGoogleEvent } from './parsing/google/parser';

export default class GoogleCalendar extends RemoteCalendar {
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

  async revalidate(): Promise<void> {
    // For Google Calendar, revalidation is handled on-demand by getEvents,
    // as the cache has its own logic for when to fetch new data.
    // This method can be a no-op.
    return Promise.resolve();
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
}
