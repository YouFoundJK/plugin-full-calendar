import { DateTime } from 'luxon';
import { OFCEvent, EventLocation, validateEvent, CalendarInfo } from '../../types';
import FullCalendarPlugin from '../../main';
import { fromGoogleEvent, toGoogleEvent, GoogleEventLike } from './parser_gcal';
import { makeAuthenticatedRequest, GoogleApiError } from './request';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { GoogleProviderConfig } from './typesGCal';

import { GoogleConfigComponent } from './GoogleConfigComponent';
import * as React from 'react';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { GoogleAuthManager } from '../../features/google_auth/GoogleAuthManager';

// Settings row component for Google Provider
const GoogleNameSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  // Handle both flat and nested config structures for name
  const getName = (): string => {
    const flat = (source as { name?: unknown }).name;
    const nested = (source as { config?: { name?: unknown } }).config?.name;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getName(),
      className: 'fc-setting-input'
    })
  );
};

export class GoogleProvider implements CalendarProvider<GoogleProviderConfig> {
  // Static metadata for registry
  static readonly type = 'google';
  static readonly displayName = 'Google Calendar';
  static getConfigurationComponent(): FCReactComponent<any> {
    return GoogleConfigComponent;
  }

  private plugin: FullCalendarPlugin;
  private source: GoogleProviderConfig;
  private authManager: GoogleAuthManager;

  // Instance properties remain
  readonly type = 'google';
  readonly displayName = 'Google Calendar';
  readonly isRemote = true;
  readonly loadPriority = 120;

  constructor(source: GoogleProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
    this.authManager = new GoogleAuthManager(plugin);
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>); // Provide exact subtype
    if (!token) return [];

    const displayTimezone = this.plugin.settings.displayTimezone;
    if (!displayTimezone) return [];

    try {
      const timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);
      const timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.source.calendarId)}/events`
      );
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
      url.searchParams.set('singleEvents', 'false');
      url.searchParams.set('maxResults', '2500');

      const data = await makeAuthenticatedRequest<{ items?: GoogleEventLike[] }>(
        token,
        url.toString()
      );
      if (!Array.isArray(data.items)) return [];

      const cancellations = new Map<string, Set<string>>();
      for (const gEvent of data.items) {
        if (
          gEvent.status === 'cancelled' &&
          gEvent.recurringEventId &&
          gEvent.originalStartTime &&
          gEvent.originalStartTime.dateTime
        ) {
          const parentId = gEvent.recurringEventId;
          if (!cancellations.has(parentId)) {
            cancellations.set(parentId, new Set());
          }
          const cancelledDate = DateTime.fromISO(gEvent.originalStartTime.dateTime, {
            zone: gEvent.originalStartTime.timeZone || 'utc'
          }).toISODate();
          if (cancelledDate) {
            cancellations.get(parentId)!.add(cancelledDate);
          }
        }
      }

      // Remove convertEvent logic; just validate and return events
      const tuples: ([OFCEvent, EventLocation | null] | null)[] = data.items.map(
        (gEvent: GoogleEventLike) => {
          let rawEvent = fromGoogleEvent(gEvent);
          if (!rawEvent) return null;

          if (
            (rawEvent.type === 'rrule' || rawEvent.type === 'recurring') &&
            rawEvent.uid &&
            cancellations.has(rawEvent.uid)
          ) {
            const datesToSkip = cancellations.get(rawEvent.uid)!;
            rawEvent.skipDates = [...new Set([...(rawEvent.skipDates || []), ...datesToSkip])];
          }

          const validated = validateEvent(rawEvent);
          if (!validated) return null;

          return [validated, null];
        }
      );
      return tuples.filter((e): e is [OFCEvent, EventLocation | null] => e !== null);
    } catch (e) {
      console.error(`Error fetching events for Google Calendar "${this.source.name}":`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>);
    if (!token) throw new GoogleApiError('Cannot create event: not authenticated.');

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events`;
    const body = toGoogleEvent(event);
    const createdGEvent = await makeAuthenticatedRequest<GoogleEventLike>(token, url, 'POST', body);

    const rawEvent = fromGoogleEvent(createdGEvent as GoogleEventLike);
    if (!rawEvent) throw new Error('Could not parse event from Google API after creation.');

    return [rawEvent, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>);
    if (!token) throw new GoogleApiError('Cannot update event: not authenticated.');

    const newSkipDates = new Set(
      newEventData.type === 'rrule' || newEventData.type === 'recurring'
        ? newEventData.skipDates
        : []
    );
    const oldSkipDates = new Set(
      oldEventData.type === 'rrule' || oldEventData.type === 'recurring'
        ? oldEventData.skipDates
        : []
    );
    let cancelledDate: string | undefined;
    if (newSkipDates.size > oldSkipDates.size) {
      for (const date of newSkipDates) {
        if (!oldSkipDates.has(date)) {
          cancelledDate = date;
          break;
        }
      }
    }

    if (cancelledDate) {
      await this.cancelInstance(oldEventData, cancelledDate);
    } else {
      const eventId = handle.persistentId;
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.source.calendarId
      )}/events/${encodeURIComponent(eventId)}`;
      const body = toGoogleEvent(newEventData);
      await makeAuthenticatedRequest(token, url, 'PUT', body);
    }
    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>);
    if (!token) throw new GoogleApiError('Cannot delete event: not authenticated.');

    const eventId = handle.persistentId;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events/${encodeURIComponent(eventId)}`;
    await makeAuthenticatedRequest(token, url, 'DELETE');
  }

  private async cancelInstance(parentEvent: OFCEvent, instanceDate: string): Promise<void> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>);
    if (!token) throw new GoogleApiError('Cannot cancel instance: not authenticated.');

    if (!parentEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }
    const body: Record<string, unknown> = {
      recurringEventId: parentEvent.uid,
      status: 'cancelled'
    };
    // Google API expects either a date (all-day) or dateTime/timeZone pair.
    // `toISO()` can theoretically return null, so allow null and guard.
    let startTimeObject: { date?: string; dateTime?: string; timeZone?: string };
    if (parentEvent.allDay) {
      startTimeObject = { date: instanceDate };
    } else {
      const timeZone = parentEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime =
        !parentEvent.allDay && 'startTime' in parentEvent ? parentEvent.startTime : '00:00';
      const isoDateTime = DateTime.fromISO(`${instanceDate}T${startTime}`, {
        zone: timeZone
      }).toISO();
      startTimeObject = isoDateTime
        ? { dateTime: isoDateTime, timeZone: timeZone }
        : { date: instanceDate };
    }
    body.originalStartTime = startTimeObject;
    body.start = startTimeObject;
    body.end = startTimeObject;

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events`;
    await makeAuthenticatedRequest(token, url, 'POST', body);
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'google' }>);
    if (!token) throw new GoogleApiError('Cannot create instance override: not authenticated.');

    if (newEventData.allDay === false && masterEvent.allDay === false) {
      const originalStartTime = {
        dateTime: DateTime.fromISO(`${instanceDate}T${masterEvent.startTime}`).toISO(),
        timeZone: masterEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const body = {
        ...toGoogleEvent(newEventData),
        recurringEventId: masterEvent.uid,
        originalStartTime: originalStartTime
      };

      const newGEvent = await makeAuthenticatedRequest<GoogleEventLike>(
        token,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.source.calendarId)}/events`,
        'POST',
        body
      );

      const rawEvent = fromGoogleEvent(newGEvent as GoogleEventLike);
      if (!rawEvent) {
        throw new Error('Could not parse Google API response after creating instance override.');
      }
      return [rawEvent, null];
    }
    throw new Error(
      'Modifying a single instance of an all-day recurring event is not yet supported for Google Calendars.'
    );
  }

  getConfigurationComponent(): FCReactComponent<any> {
    const WrapperComponent: React.FC<any> = props => {
      // This logic is now handled inside GoogleConfigComponent, so we can simplify this.
      // We just need to pass the plugin instance.

      const componentProps = {
        ...props,
        plugin: this.plugin // Pass the plugin instance
      };

      return React.createElement(GoogleConfigComponent, componentProps);
    };
    return WrapperComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return GoogleNameSetting;
  }

  async revalidate(): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
  }
}
