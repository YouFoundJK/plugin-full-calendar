import { DateTime } from 'luxon';
import { FullCalendarSettings } from '../../types/settings';
import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { enhanceEvent } from '../../utils/categoryParser';
import { convertEvent } from '../../utils/Timezone';
import { fromGoogleEvent, toGoogleEvent } from './parser_gcal';
import { makeAuthenticatedRequest } from './request';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { GoogleProviderConfig } from './typesGCal';

import { GoogleConfigComponent } from './GoogleConfigComponent';
import { fetchGoogleCalendarList } from './api';
import * as React from 'react';

export class GoogleProvider implements CalendarProvider<GoogleProviderConfig> {
  private plugin: FullCalendarPlugin;

  readonly type = 'google';
  readonly displayName = 'Google Calendar';
  readonly isRemote = true;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  getCapabilities(config: GoogleProviderConfig): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent, config: GoogleProviderConfig): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(config: GoogleProviderConfig): Promise<[OFCEvent, EventLocation | null][]> {
    const displayTimezone = this.plugin.settings.displayTimezone;
    if (!displayTimezone) return [];

    try {
      const timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);
      const timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.id)}/events`
      );
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
      url.searchParams.set('singleEvents', 'false');
      url.searchParams.set('maxResults', '2500');

      const data = await makeAuthenticatedRequest(this.plugin, url.toString());
      if (!data.items || !Array.isArray(data.items)) return [];

      const cancellations = new Map<string, Set<string>>();
      for (const gEvent of data.items) {
        if (gEvent.status === 'cancelled' && gEvent.recurringEventId && gEvent.originalStartTime) {
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

      return data.items
        .map((gEvent: any) => {
          let rawEvent = fromGoogleEvent(gEvent);
          if (!rawEvent) return null;
          let parsedEvent = enhanceEvent(rawEvent, this.plugin.settings);

          if (
            (parsedEvent.type === 'rrule' || parsedEvent.type === 'recurring') &&
            parsedEvent.uid &&
            cancellations.has(parsedEvent.uid)
          ) {
            const datesToSkip = cancellations.get(parsedEvent.uid)!;
            parsedEvent.skipDates = [
              ...new Set([...(parsedEvent.skipDates || []), ...datesToSkip])
            ];
          }

          const validated = validateEvent(parsedEvent);
          if (!validated) return null;

          let translated = validated;
          if (validated.timezone && validated.timezone !== displayTimezone) {
            translated = convertEvent(validated, validated.timezone, displayTimezone);
          }
          return [translated, null];
        })
        .filter((e: [OFCEvent, EventLocation | null] | null): e is [OFCEvent, null] => e !== null);
    } catch (e) {
      console.error(`Error fetching events for Google Calendar "${config.name}":`, e);
      return [];
    }
  }

  async createEvent(
    event: OFCEvent,
    config: GoogleProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      config.id
    )}/events`;
    const body = toGoogleEvent(event);
    const createdGEvent = await makeAuthenticatedRequest(this.plugin, url, 'POST', body);

    const rawEvent = fromGoogleEvent(createdGEvent);
    if (!rawEvent) throw new Error('Could not parse event from Google API after creation.');

    return [enhanceEvent(rawEvent, this.plugin.settings), null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent,
    config: GoogleProviderConfig
  ): Promise<EventLocation | null> {
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
      await this.cancelInstance(oldEventData, cancelledDate, config);
    } else {
      const eventId = handle.persistentId;
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        config.id
      )}/events/${encodeURIComponent(eventId)}`;
      const body = toGoogleEvent(newEventData);
      await makeAuthenticatedRequest(this.plugin, url, 'PUT', body);
    }
    return null;
  }

  async deleteEvent(handle: EventHandle, config: GoogleProviderConfig): Promise<void> {
    const eventId = handle.persistentId;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      config.id
    )}/events/${encodeURIComponent(eventId)}`;
    await makeAuthenticatedRequest(this.plugin, url, 'DELETE');
  }

  private async cancelInstance(
    parentEvent: OFCEvent,
    instanceDate: string,
    config: GoogleProviderConfig
  ): Promise<void> {
    if (!parentEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }
    const body: any = {
      recurringEventId: parentEvent.uid,
      status: 'cancelled'
    };
    let startTimeObject: any;
    if (parentEvent.allDay) {
      startTimeObject = { date: instanceDate };
    } else {
      const timeZone = parentEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime =
        !parentEvent.allDay && 'startTime' in parentEvent ? parentEvent.startTime : '00:00';
      const isoDateTime = DateTime.fromISO(`${instanceDate}T${startTime}`, {
        zone: timeZone
      }).toISO();
      startTimeObject = { dateTime: isoDateTime, timeZone: timeZone };
    }
    body.originalStartTime = startTimeObject;
    body.start = startTimeObject;
    body.end = startTimeObject;

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      config.id
    )}/events`;
    await makeAuthenticatedRequest(this.plugin, url, 'POST', body);
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent,
    config: GoogleProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
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

      const newGEvent = await makeAuthenticatedRequest(
        this.plugin,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.id)}/events`,
        'POST',
        body
      );

      const rawEvent = fromGoogleEvent(newGEvent);
      if (!rawEvent) {
        throw new Error('Could not parse Google API response after creating instance override.');
      }
      return [enhanceEvent(rawEvent, this.plugin.settings), null];
    }
    throw new Error(
      'Modifying a single instance of an all-day recurring event is not yet supported for Google Calendars.'
    );
  }

  getConfigurationComponent(): FCReactComponent<any> {
    const WrapperComponent: React.FC<any> = props => {
      // Prepare the props for the "dumb" component here.
      const isAuthenticated = !!this.plugin.settings.googleAuth?.refreshToken;

      const getAvailableCalendars = async (): Promise<any[]> => {
        // This function now lives inside the provider, where it has access to the plugin.
        const allCalendars = await fetchGoogleCalendarList(this.plugin);
        const existingGoogleIds = new Set(
          this.plugin.settings.calendarSources
            .filter(s => s.type === 'google')
            .map(s => (s as any).config.id)
        );
        return allCalendars.filter(cal => !existingGoogleIds.has(cal.id));
      };

      const componentProps = {
        ...props,
        isAuthenticated,
        getAvailableCalendars
      };

      return React.createElement(GoogleConfigComponent, componentProps);
    };
    return WrapperComponent;
  }

  async revalidate(config: GoogleProviderConfig): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
  }
}
