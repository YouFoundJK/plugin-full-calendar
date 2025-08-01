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
// import { fromGoogleEvent } from './parsing/google/parser';
// import { makeAuthenticatedRequest } from './parsing/google/request';
import FullCalendarPlugin from '../main';

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
    // This is a placeholder. We will implement the full logic in the next steps
    // after creating the parser and finalizing the request helper.
    console.log(`Fetching events for Google Calendar: ${this.name} (${this.id})`);
    return [];
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    // Google event IDs are persistent and unique, so we use them as the local identifier.
    return event.uid || null;
  }
}
