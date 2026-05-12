import * as React from 'react';
import { DateTime } from 'luxon';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { CalendarInfo, EventLocation, OFCEvent, validateEvent } from '../../types';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { OutlookProviderConfig } from './typesOutlook';
import { OutlookConfigComponent } from './ui/OutlookConfigComponent';
import { OutlookAuthManager } from './auth/OutlookAuthManager';
import { makeAuthenticatedRequest, OutlookApiError } from './auth/request';
import { fromOutlookEvent, OutlookEventLike, toOutlookEvent } from './parser/parser_outlook';

const OutlookNameSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const microsoftAccountId = (source as unknown as { microsoftAccountId?: string })
    ?.microsoftAccountId;
  const accountEmail = PluginState.getSettings().microsoftAccounts.find(
    account => account.id === microsoftAccountId
  )?.email;
  const displayValue = accountEmail || '';

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: displayValue,
      className: 'fc-setting-input'
    })
  );
};

type OutlookConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<OutlookProviderConfig>;
  onConfigChange: (newConfig: Partial<OutlookProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: OutlookProviderConfig | OutlookProviderConfig[]) => void;
  onClose: () => void;
};

const createOutlookConfigWrapper = (
  pluginFromInstance?: FullCalendarPlugin
): React.FC<OutlookConfigProps> => {
  return props => {
    const plugin =
      pluginFromInstance || (props as OutlookConfigProps & { plugin?: FullCalendarPlugin }).plugin;

    const forwardOnSave = props.onSave as (
      configs: OutlookProviderConfig | OutlookProviderConfig[],
      accountId?: string
    ) => void;

    const handleSave = (
      selectedConfigs: Array<{ id: string; name: string; color: string }>,
      accountId: string
    ) => {
      forwardOnSave(selectedConfigs as unknown as OutlookProviderConfig[], accountId);
    };

    if (!plugin) {
      throw new Error('Outlook configuration requires plugin context.');
    }

    return React.createElement(OutlookConfigComponent, {
      plugin,
      onSave: handleSave,
      onClose: props.onClose
    });
  };
};

export class OutlookProvider implements CalendarProvider<OutlookProviderConfig>, SyncKeyProvider {
  static readonly type = 'outlook';
  static readonly displayName = 'Outlook Calendar';

  static getConfigurationComponent(): FCReactComponent<OutlookConfigProps> {
    return createOutlookConfigWrapper();
  }

  private plugin: FullCalendarPlugin;
  private source: OutlookProviderConfig;
  private authManager: OutlookAuthManager;

  readonly type = 'outlook';
  readonly displayName = 'Outlook Calendar';
  readonly isRemote = true;
  readonly loadPriority = 125;

  constructor(source: OutlookProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
    this.authManager = new OutlookAuthManager(plugin);
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (!event.uid) return null;
    return { persistentId: event.uid };
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.authManager.getTokenForSource({
      type: 'outlook',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      microsoftAccountId: this.source.microsoftAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'outlook' }>);

    if (!token) return [];

    try {
      const timeMin = range?.start || DateTime.now().minus({ months: 12 }).toJSDate();
      const timeMax = range?.end || DateTime.now().plus({ months: 12 }).toJSDate();

      const url = new URL(
        `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/calendarView`
      );
      url.searchParams.set('startDateTime', timeMin.toISOString());
      url.searchParams.set('endDateTime', timeMax.toISOString());
      url.searchParams.set('$top', '1000');

      const response = await makeAuthenticatedRequest<{ value?: OutlookEventLike[] }>(
        token,
        url.toString()
      );

      if (!Array.isArray(response.value)) {
        return [];
      }

      const tuples = response.value
        .map(raw => {
          const parsed = fromOutlookEvent(raw);
          if (!parsed) return null;
          const validated = validateEvent(parsed);
          if (!validated) return null;
          return [validated, null] as [OFCEvent, EventLocation | null];
        })
        .filter((item): item is [OFCEvent, EventLocation | null] => item !== null);

      return tuples;
    } catch {
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.authManager.getTokenForSource({
      type: 'outlook',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      microsoftAccountId: this.source.microsoftAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'outlook' }>);

    if (!token) {
      throw new OutlookApiError('Cannot create event: not authenticated.');
    }

    const created = await makeAuthenticatedRequest<OutlookEventLike>(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events`,
      'POST',
      toOutlookEvent(event)
    );

    const parsed = fromOutlookEvent(created);
    if (!parsed) {
      throw new Error('Could not parse event from Outlook API after creation.');
    }

    return [parsed, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const token = await this.authManager.getTokenForSource({
      type: 'outlook',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      microsoftAccountId: this.source.microsoftAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'outlook' }>);

    if (!token) {
      throw new OutlookApiError('Cannot update event: not authenticated.');
    }

    await makeAuthenticatedRequest(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(handle.persistentId)}`,
      'PATCH',
      toOutlookEvent(newEventData)
    );

    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const token = await this.authManager.getTokenForSource({
      type: 'outlook',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      microsoftAccountId: this.source.microsoftAccountId,
      color: ''
    } as Extract<CalendarInfo, { type: 'outlook' }>);

    if (!token) {
      throw new OutlookApiError('Cannot delete event: not authenticated.');
    }

    await makeAuthenticatedRequest(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(handle.persistentId)}`,
      'DELETE'
    );
  }

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(
      new Error('Single-instance overrides are not yet supported for Outlook calendars.')
    );
  }

  getConfigurationComponent(): FCReactComponent<OutlookConfigProps> {
    return createOutlookConfigWrapper(this.plugin);
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return OutlookNameSetting;
  }

  revalidate(): Promise<void> {
    return Promise.resolve();
  }
}
