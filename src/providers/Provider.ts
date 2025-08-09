import { OFCEvent, EventLocation } from '../types';
import { EventHandle, ProviderConfigContext, FCReactComponent } from './typesProvider';

export interface CalendarProviderCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CalendarProvider<TConfig> {
  readonly type: string;
  readonly displayName: string;

  getCapabilities(config: TConfig): CalendarProviderCapabilities;

  getEventHandle(event: OFCEvent, config: TConfig): EventHandle | null;

  getEvents(config: TConfig): Promise<[OFCEvent, EventLocation | null][]>;

  createEvent(event: OFCEvent, config: TConfig): Promise<[OFCEvent, EventLocation | null]>;
  updateEvent(
    handle: EventHandle,
    newEventData: OFCEvent,
    config: TConfig
  ): Promise<EventLocation | null>;
  deleteEvent(handle: EventHandle, config: TConfig): Promise<void>;

  getConfigurationComponent(): FCReactComponent<{
    config: Partial<TConfig>;
    onConfigChange: (newConfig: Partial<TConfig>) => void;
    context: ProviderConfigContext;
    onSave: (finalConfig: TConfig) => void;
  }>;
}
