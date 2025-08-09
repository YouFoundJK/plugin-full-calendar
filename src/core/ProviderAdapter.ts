import { TFile } from 'obsidian';
import { EditableCalendar, EditableEventResponse } from '../calendars/EditableCalendar';
import { FullCalendarSettings } from '../types/settings';
import { CalendarInfo, OFCEvent, EventLocation } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { EventPathLocation } from './EventStore';
import { EventHandle } from '../providers/typesProvider';

/**
 * An adapter that makes a new, generic CalendarProvider look and act like a
 * legacy EditableCalendar. This is the core of the Strangler Fig pattern,
 * allowing the EventCache to remain unchanged while we migrate providers one by one.
 */
export class ProviderAdapter<TConfig> extends EditableCalendar {
  private provider: CalendarProvider<TConfig>;
  private config: TConfig;
  protected info: CalendarInfo;

  constructor(
    provider: CalendarProvider<TConfig>,
    config: TConfig,
    info: CalendarInfo,
    settings: FullCalendarSettings
  ) {
    super(info, settings);
    this.provider = provider;
    this.config = config;
    this.info = info;
  }

  get identifier(): string {
    // The identifier is part of the config and depends on the provider type.
    // The adapter needs to know how to extract it.
    if (this.info.type === 'local') {
      return (this.config as any).directory;
    }
    // Add other cases as we migrate more providers
    return this.info.id;
  }

  get type(): CalendarInfo['type'] {
    return this.info.type;
  }

  get id(): string {
    return this.info.id;
  }

  get name(): string {
    // FIX: Derive name safely. Use provider's display name or identifier.
    // The 'name' property is not guaranteed on all CalendarInfo types.
    return (this.info as any).name || this.provider.displayName || this.identifier;
  }

  get directory(): string {
    return (this.config as any).directory || '';
  }

  // === Bridged Methods (Implement ALL abstract methods) ===

  async getEvents(): Promise<EditableEventResponse[]> {
    const events = await this.provider.getEvents(this.config);
    return events.filter((response): response is EditableEventResponse => response[1] !== null);
  }

  // FIX: Provide concrete implementation for all abstract methods.
  // These can be simple pass-throughs or stubs if not directly used by the legacy path.

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    // This is not strictly needed by the legacy cache update logic, which re-fetches
    // everything from a calendar. We can return an empty array.
    return [];
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    return this.provider.createEvent(event, this.config);
  }

  async modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation | null) => void
  ): Promise<{ isDirty: boolean }> {
    if (!location) {
      throw new Error('ProviderAdapter requires a location to generate an EventHandle.');
    }

    const handle: EventHandle = {
      persistentId: location.path,
      location: { lineNumber: location.lineNumber }
    };

    const newLocation = await this.provider.updateEvent(handle, oldEvent, newEvent, this.config);
    updateCacheWithLocation(newLocation);

    return { isDirty: true };
  }

  async deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void> {
    if (!location) {
      throw new Error(
        'ProviderAdapter requires a location to generate an EventHandle for deletion.'
      );
    }
    const handle: EventHandle = {
      persistentId: location.path,
      location: { lineNumber: location.lineNumber }
    };
    return this.provider.deleteEvent(handle, this.config);
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    const handle = this.provider.getEventHandle(event, this.config);
    return handle ? handle.persistentId : null;
  }

  async checkForDuplicate(event: OFCEvent): Promise<boolean> {
    // For now, we can assume providers handle this internally or we can add it to the interface later.
    return false;
  }

  async bulkAddCategories(): Promise<void> {
    // This logic will be handled by the provider directly when called from CategorizationManager
    // The adapter does not need to implement it for the EventCache's purposes.
  }

  async bulkRemoveCategories(): Promise<void> {
    // Same as above.
  }
}
