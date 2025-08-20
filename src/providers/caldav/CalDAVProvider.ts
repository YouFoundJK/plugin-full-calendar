import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';

// Use require for robust module loading.
const { createAccount, getCalendarObjects, AuthMethod } = require('tsdav');

export class CalDAVProvider implements CalendarProvider<CalDAVProviderConfig> {
  private plugin: FullCalendarPlugin;
  private config: CalDAVProviderConfig;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';
  readonly isRemote = true;

  constructor(config: CalDAVProviderConfig, plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.config = config;
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
      const account = await createAccount({
        server: config.url,
        credentials: {
          username: config.username,
          password: config.password
        },
        authMethod: AuthMethod.Basic
      });

      const caldavEvents = await getCalendarObjects({
        calendarUrl: config.homeUrl,
        account
      });

      // The rest of the pipeline remains the same:
      // Pass raw ICS data to the existing parser.
      return caldavEvents
        .filter((vevent: any) => vevent.data)
        .flatMap((vevent: any) => getEventsFromICS(vevent.data))
        .map((event: OFCEvent) => [event, null]);
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
    masterEvent: OFCEvent,
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
