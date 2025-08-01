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
    location: EventPathLocation,
    newEvent: OFCEvent,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    throw new Error('Not implemented.');
  }

  async deleteEvent(location: EventPathLocation): Promise<void> {
    throw new Error('Not implemented.');
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    // No-op for Google Calendar
    return;
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    // No-op for Google Calendar
    return;
  }
}
