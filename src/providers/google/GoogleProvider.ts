import { FullCalendarSettings } from '../../types/settings';
import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { enhanceEvent } from '../../calendars/parsing/categoryParser';
import { convertEvent } from '../../calendars/utils/Timezone';
import { fromGoogleEvent, toGoogleEvent } from '../../calendars/parsing/google/parser_gcal';
import { makeAuthenticatedRequest } from '../../calendars/parsing/google/request';
import { EditableEventResponse } from '../../calendars/EditableCalendar';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { GoogleProviderConfig } from './typesGCal';
import { DateTime } from 'luxon';

export class GoogleProvider implements CalendarProvider<GoogleProviderConfig> {
  private plugin: FullCalendarPlugin;

  readonly type = 'google';
  readonly displayName = 'Google Calendar';

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
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('maxResults', '2500');

      const data = await makeAuthenticatedRequest(this.plugin, url.toString());
      if (!data.items || !Array.isArray(data.items)) return [];

      return data.items
        .map((gEvent: any) => {
          let rawEvent = fromGoogleEvent(gEvent);
          if (!rawEvent) return null;

          const validated = validateEvent(enhanceEvent(rawEvent, this.plugin.settings));
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.id)}/events`;
    const body = toGoogleEvent(event);
    const createdGEvent = await makeAuthenticatedRequest(this.plugin, url, 'POST', body);

    const rawEvent = fromGoogleEvent(createdGEvent);
    if (!rawEvent) throw new Error('Could not parse event from Google API after creation.');

    return [enhanceEvent(rawEvent, this.plugin.settings), null];
  }

  async updateEvent(
    handle: EventHandle,
    newEventData: OFCEvent,
    config: GoogleProviderConfig
  ): Promise<EventLocation | null> {
    const eventId = handle.persistentId;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.id)}/events/${encodeURIComponent(eventId)}`;
    const body = toGoogleEvent(newEventData);
    await makeAuthenticatedRequest(this.plugin, url, 'PUT', body);
    return null;
  }

  async deleteEvent(handle: EventHandle, config: GoogleProviderConfig): Promise<void> {
    const eventId = handle.persistentId;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.id)}/events/${encodeURIComponent(eventId)}`;
    await makeAuthenticatedRequest(this.plugin, url, 'DELETE');
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return () => null; // Placeholder for now
  }
}
