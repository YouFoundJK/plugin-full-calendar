import { request } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';
import { OFCEvent, EventLocation } from '../../types';
import { enhanceEvent } from '../../calendars/parsing/categoryParser';
import { getEventsFromICS } from '../../calendars/parsing/ics';
import { convertEvent } from '../../calendars/utils/Timezone';
import { EditableEventResponse } from '../../calendars/EditableCalendar';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { ICSProviderConfig } from './typesICS';
import { ICSConfigComponent } from './ICSConfigComponent';

const WEBCAL = 'webcal';

export class ICSProvider implements CalendarProvider<ICSProviderConfig> {
  private settings: FullCalendarSettings;

  readonly type = 'ical';
  readonly displayName = 'Remote Calendar (ICS)';

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent, config: ICSProviderConfig): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(config: ICSProviderConfig): Promise<[OFCEvent, EventLocation | null][]> {
    let url = config.url;
    if (url.startsWith(WEBCAL)) {
      url = 'https' + url.slice(WEBCAL.length);
    }

    try {
      const response = await request({ url, method: 'GET' });
      const displayTimezone = this.settings.displayTimezone;
      if (!displayTimezone) return [];

      return getEventsFromICS(response).map(rawEvent => {
        const event = enhanceEvent(rawEvent, this.settings);
        let translatedEvent = event;
        if (event.timezone && event.timezone !== displayTimezone) {
          translatedEvent = convertEvent(event, event.timezone, displayTimezone);
        }
        return [translatedEvent, null];
      });
    } catch (e) {
      console.error(`Error fetching ICS calendar from ${url}`, e);
      return [];
    }
  }

  async createEvent(
    event: OFCEvent,
    config: ICSProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Cannot create an event on a read-only ICS calendar.');
  }

  async updateEvent(
    handle: EventHandle,
    newEventData: OFCEvent,
    config: ICSProviderConfig
  ): Promise<EventLocation | null> {
    throw new Error('Cannot update an event on a read-only ICS calendar.');
  }

  async deleteEvent(handle: EventHandle, config: ICSProviderConfig): Promise<void> {
    throw new Error('Cannot delete an event on a read-only ICS calendar.');
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return ICSConfigComponent;
  }
}
