import dav from 'dav';
import { FullCalendarSettings } from '../../types/settings';
import { OFCEvent, EventLocation } from '../../types';
import { enhanceEvent } from '../../calendars/parsing/categoryParser';
import { getEventsFromICS } from '../../calendars/parsing/ics';
import * as transport from '../../calendars/parsing/caldav/transport';
import { convertEvent } from '../../calendars/utils/Timezone';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';

export class CalDAVProvider implements CalendarProvider<CalDAVProviderConfig> {
  private settings: FullCalendarSettings;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  getCapabilities(config: CalDAVProviderConfig): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent, config: CalDAVProviderConfig): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(config: CalDAVProviderConfig): Promise<[OFCEvent, EventLocation | null][]> {
    try {
      const xhr = new transport.Basic(
        new dav.Credentials({ username: config.username, password: config.password })
      );
      const account = await dav.createAccount({ xhr, server: config.url });
      const calendar = account.calendars.find(cal => cal.url === config.homeUrl);
      if (!calendar) {
        console.warn(
          `CalDAV calendar with homeUrl ${config.homeUrl} not found on server ${config.url}.`
        );
        return [];
      }

      const caldavEvents = await dav.listCalendarObjects(calendar, { xhr });
      const displayTimezone = this.settings.displayTimezone;
      if (!displayTimezone) return [];

      return caldavEvents
        .filter(vevent => vevent.calendarData)
        .flatMap(vevent => getEventsFromICS(vevent.calendarData))
        .map(rawEvent => {
          const event = enhanceEvent(rawEvent, this.settings);
          let translatedEvent = event;
          if (event.timezone && event.timezone !== displayTimezone) {
            translatedEvent = convertEvent(event, event.timezone, displayTimezone);
          }
          return [translatedEvent, null] as [OFCEvent, EventLocation | null];
        });
    } catch (e) {
      console.error(`Error fetching CalDAV events from ${config.url}`, e);
      return [];
    }
  }

  async createEvent(
    event: OFCEvent,
    config: CalDAVProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Creating events on a CalDAV calendar is not yet supported.');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent,
    config: CalDAVProviderConfig
  ): Promise<EventLocation | null> {
    throw new Error('Updating events on a CalDAV calendar is not yet supported.');
  }

  async deleteEvent(handle: EventHandle, config: CalDAVProviderConfig): Promise<void> {
    throw new Error('Deleting events on a CalDAV calendar is not yet supported.');
  }

  async createInstanceOverride(
    masterEventHandle: EventHandle,
    instanceDate: string,
    newEventData: OFCEvent,
    config: CalDAVProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error(`Cannot create a recurring event override on a read-only calendar.`);
  }

  async revalidate(config: CalDAVProviderConfig): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return () => null;
  }
}
