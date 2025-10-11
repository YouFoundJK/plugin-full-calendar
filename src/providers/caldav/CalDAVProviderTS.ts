import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';
import FullCalendarPlugin from '../../main';
import { CalDAVConfigComponentTS } from './CalDAVConfigComponentTS';
import * as React from 'react';
import { createDAVClient } from 'tsdav';

// --- Read-only settings row ---
const CalDAVTSSettingRow: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const url = (source as any)?.url || '';
  const username = (source as any)?.username || '';

  return React.createElement(
    React.Fragment,
    {},
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: url,
        className: 'fc-setting-input'
      })
    ),
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: username,
        className: 'fc-setting-input'
      })
    )
  );
};

export class CalDAVProviderTS implements CalendarProvider<CalDAVProviderTSConfig> {
  static readonly type = 'caldav-ts';
  static readonly displayName = 'CalDAV (ts-dav)';
  static getConfigurationComponent(): FCReactComponent<any> {
    return CalDAVConfigComponentTS;
  }

  private source: CalDAVProviderTSConfig;

  readonly type = 'caldav-ts';
  readonly displayName = 'CalDAV (ts-dav)';
  readonly isRemote = true;
  readonly loadPriority = 110;

  constructor(source: CalDAVProviderTSConfig, plugin: FullCalendarPlugin) {
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    return event.uid ? { persistentId: event.uid } : null;
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(now);
    end.setMonth(end.getMonth() + 6);

    try {
      // Create a DAV client with the saved configuration
      const client = await createDAVClient({
        serverUrl: this.source.url,
        credentials: {
          username: this.source.username,
          password: this.source.password
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      });

      // Fetch calendar objects using ts-dav
      const calendarObjects = await client.fetchCalendarObjects({
        calendar: {
          url: this.source.homeUrl
        },
        timeRange: {
          start: start.toISOString(),
          end: end.toISOString()
        }
      });

      // Extract ICS data from each calendar object
      const icsList = calendarObjects.map(obj => obj.data);

      // Parse ICS data using existing parser
      return icsList.flatMap(getEventsFromICS).map(ev => [ev, null]);
    } catch (err) {
      console.error('[CalDAVProviderTS] Failed to fetch events.', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch events from CalDAV server: ${errorMessage}`);
    }
  }

  // CUD operations are not supported for this read-only provider.
  async createEvent(_: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Creating events on a CalDAV calendar is not yet supported.');
  }
  async updateEvent(): Promise<EventLocation | null> {
    throw new Error('Updating events on a CalDAV calendar is not yet supported.');
  }
  async deleteEvent(): Promise<void> {
    throw new Error('Deleting events on a CalDAV calendar is not yet supported.');
  }
  async createInstanceOverride(): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Cannot create a recurring event override on a read-only calendar.');
  }

  // Boilerplate methods for the provider interface.
  async revalidate(): Promise<void> {}
  getConfigurationComponent(): FCReactComponent<any> {
    return () => null;
  }
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return CalDAVTSSettingRow;
  }
}
