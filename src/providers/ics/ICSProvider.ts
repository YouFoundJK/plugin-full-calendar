import { request, TFile } from 'obsidian';
import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from './ics';
import * as React from 'react';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { ICSProviderConfig } from './typesICS';
import { ICSConfigComponent } from './ui/ICSConfigComponent';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';

const WEBCAL = 'webcal';

// Settings row component for ICS Provider
const ICSUrlSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  // Handle both flat and nested config structures for URL
  const getUrl = (): string => {
    const flat = (source as { url?: unknown }).url;
    const nested = (source as { config?: { url?: unknown } }).config?.url;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getUrl(),
      className: 'fc-setting-input'
    })
  );
};

type ICSConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<ICSProviderConfig>;
  onConfigChange: (newConfig: Partial<ICSProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: ICSProviderConfig | ICSProviderConfig[]) => void;
  onClose: () => void;
};

const ICSConfigWrapper: React.FC<ICSConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: ICSProviderConfig) => onSave(finalConfig);

  return React.createElement(ICSConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

export class ICSProvider implements CalendarProvider<ICSProviderConfig> {
  // Static metadata for registry
  static readonly type = 'ical';
  static readonly displayName = 'ICS Calendar';

  static getConfigurationComponent(): FCReactComponent<ICSConfigProps> {
    return ICSConfigWrapper;
  }

  private plugin: FullCalendarPlugin;
  private source: ICSProviderConfig;

  readonly type = 'ical';
  readonly loadPriority = 100;

  /** Dynamic: returns true for remote URLs, false for local file paths */
  get isRemote(): boolean {
    const url = this.source.url;
    if (!url) return true; // Default to remote if not configured
    return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('webcal');
  }

  /** Dynamic display name based on source type */
  get displayName(): string {
    return this.isRemote ? 'Remote Calendar (ICS)' : 'Local Calendar (ICS)';
  }

  constructor(source: ICSProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    const url = this.source.url;

    // Early return if URL is empty
    if (!url) {
      console.warn('ICSProvider: No URL configured.');
      return [];
    }

    // Check if this is a local file path (not a remote URL)
    const isRemoteUrl =
      url.startsWith('https://') || url.startsWith('http://') || url.startsWith(WEBCAL);

    if (!isRemoteUrl) {
      // This is a local file path
      const file = this.plugin.app.vault.getAbstractFileByPath(url);
      if (file instanceof TFile) {
        try {
          const content = await this.plugin.app.vault.read(file);
          return getEventsFromICS(content).map(event => [event, null]);
        } catch (e) {
          console.error(`Error reading local ICS file ${url}`, e);
          return [];
        }
      } else {
        // File not found - don't fall through to network request
        console.error(`Local ICS file not found: ${url}`);
        return [];
      }
    }

    // Remote URL handling
    let remoteUrl = url;
    if (remoteUrl.startsWith(WEBCAL)) {
      remoteUrl = 'https' + remoteUrl.slice(WEBCAL.length);
    }

    try {
      const response = await request({ url: remoteUrl, method: 'GET' });
      const displayTimezone = this.plugin.settings.displayTimezone;
      if (!displayTimezone) return [];

      // Remove timezone conversion logic; just return raw events
      return getEventsFromICS(response).map(event => [event, null]);
    } catch (e) {
      console.error(`Error fetching ICS calendar from ${remoteUrl}`, e);
      return [];
    }
  }

  createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Cannot create an event on a read-only ICS calendar.'));
  }

  updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    return Promise.reject(new Error('Cannot update an event on a read-only ICS calendar.'));
  }

  deleteEvent(handle: EventHandle): Promise<void> {
    return Promise.reject(new Error('Cannot delete an event on a read-only ICS calendar.'));
  }

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(
      new Error(`Cannot create a recurring event override on a read-only calendar.`)
    );
  }

  revalidate(): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
    return Promise.resolve();
  }

  getConfigurationComponent(): FCReactComponent<ICSConfigProps> {
    return ICSConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return ICSUrlSetting;
  }
}
