import { OFCEvent, EventLocation } from '../types';
import { EventHandle, ProviderConfigContext, FCReactComponent } from './typesProvider';

export interface CalendarProviderCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasCustomEditUI?: boolean; // This is the new capability
}

export interface CalendarProvider<TConfig> {
  readonly type: string;
  readonly displayName: string;
  readonly isRemote: boolean;
  readonly loadPriority: number;

  getCapabilities(): CalendarProviderCapabilities;

  getEventHandle(event: OFCEvent): EventHandle | null;

  getEvents(): Promise<[OFCEvent, EventLocation | null][]>;
  getEventsInFile?(file: import('obsidian').TFile): Promise<[OFCEvent, EventLocation | null][]>;
  isFileRelevant?(file: import('obsidian').TFile): boolean;

  createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]>;
  updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null>;
  deleteEvent(handle: EventHandle): Promise<void>;

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]>;

  /**
   * Optional: Called before a drag-and-drop scheduling action is committed.
   * The provider can implement this to enforce rules, like preventing a task
   * from being scheduled after its due date.
   * @param event The event being scheduled. For undated tasks, this may be a stub.
   * @param date The date the event is being dropped on.
   * @returns An object indicating if the action is valid and an optional reason for the user.
   */
  canBeScheduledAt?(event: OFCEvent, date: Date): Promise<{ isValid: boolean; reason?: string }>;

  getConfigurationComponent(): FCReactComponent<{
    config: Partial<TConfig>;
    onConfigChange: (newConfig: Partial<TConfig>) => void;
    context: ProviderConfigContext;
    onSave: (finalConfig: TConfig | TConfig[]) => void;
    onClose: () => void;
  }>;

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../types').CalendarInfo>;
  }>;
}
