import { TFile } from 'obsidian';
import {
  EditableCalendar,
  EditableEventResponse,
  CategoryProvider
} from '../calendars/EditableCalendar';
import { FullCalendarSettings } from '../types/settings';
import { CalendarInfo, OFCEvent, EventLocation } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { EventPathLocation } from './EventStore';
import { EventHandle } from '../providers/typesProvider';
import { GoogleProvider } from '../providers/google/GoogleProvider';

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

  // === Abstract Property Implementations ===

  get identifier(): string {
    // The identifier is part of the config and depends on the provider type.
    if (this.info.type === 'local') {
      return (this.config as any).directory;
    }
    if (this.info.type === 'dailynote') {
      return (this.config as any).heading;
    }
    if (this.info.type === 'ical') {
      return (this.config as any).url;
    }
    if (this.info.type === 'caldav') {
      return (this.config as any).homeUrl;
    }
    if (this.info.type === 'google') {
      return (this.config as any).id;
    }
    return this.info.id;
  }

  get type(): CalendarInfo['type'] {
    return this.info.type;
  }

  get name(): string {
    // Name is stored directly on the CalendarInfo object during migration/creation.
    return (this.info as any).name || this.provider.displayName || this.identifier;
  }

  get directory(): string {
    // Only local-type calendars have a directory.
    return (this.config as any).directory || '';
  }

  // === Bridged Method Implementations ===

  async getEvents(): Promise<EditableEventResponse[]> {
    const events = await this.provider.getEvents(this.config);
    // The legacy EditableCalendar expects a location, so filter out remote-only events.
    return events.filter((response): response is EditableEventResponse => response[1] !== null);
  }

  // This is a temporary, inefficient bridge for the legacy file watcher.
  // It will be removed when the EventCache is refactored.
  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const allEvents = await this.provider.getEvents(this.config);
    return allEvents.filter(
      (response): response is EditableEventResponse =>
        response[1] !== null && response[1].file.path === file.path
    );
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    if (!this.provider.getCapabilities(this.config).canCreate) {
      throw new Error(`Calendar of type "${this.provider.type}" does not support creating events.`);
    }
    return this.provider.createEvent(event, this.config);
  }

  async modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation | null) => void
  ): Promise<{ isDirty: boolean }> {
    if (!this.provider.getCapabilities(this.config).canEdit) {
      throw new Error(`Calendar of type "${this.provider.type}" does not support editing events.`);
    }
    const handle = this.provider.getEventHandle(oldEvent, this.config);
    if (!handle) {
      throw new Error(
        `ProviderAdapter: Could not generate a persistent handle for the event being modified.`
      );
    }

    const newLocation = await this.provider.updateEvent(handle, oldEvent, newEvent, this.config);
    updateCacheWithLocation(newLocation);
    // Assume dirty for any provider that can be edited, as they are likely file-based.
    // The cache will handle UI updates correctly regardless.
    return { isDirty: true };
  }

  async deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void> {
    if (!this.provider.getCapabilities(this.config).canDelete) {
      throw new Error(`Calendar of type "${this.provider.type}" does not support deleting events.`);
    }
    const handle = this.provider.getEventHandle(event, this.config);
    if (!handle) {
      throw new Error(
        `ProviderAdapter: Could not generate a persistent handle for the event being deleted.`
      );
    }
    return this.provider.deleteEvent(handle, this.config);
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    const handle = this.provider.getEventHandle(event, this.config);
    return handle ? handle.persistentId : null;
  }

  async checkForDuplicate(event: OFCEvent): Promise<boolean> {
    // Delegate to provider if it has a specific implementation, otherwise default to false.
    if ('checkForDuplicate' in this.provider) {
      // @ts-ignore
      return this.provider.checkForDuplicate(event, this.config);
    }
    return false;
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return this.provider.createInstanceOverride(
      masterEvent,
      instanceDate,
      newEventData,
      this.config
    );
  }

  // Bulk operations for CategorizationManager.
  // These are not part of the abstract class but are checked for with `instanceof EditableCalendar`.
  // We must implement them to delegate to the underlying provider.

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    // Check if the provider actually implements this method before calling.
    if ('bulkAddCategories' in this.provider) {
      // @ts-ignore
      return this.provider.bulkAddCategories(getCategory, force, this.config);
    }
    // If the provider (e.g., Google) doesn't support it, do nothing. This is the correct behavior.
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    if ('bulkRemoveCategories' in this.provider) {
      // @ts-ignore
      return this.provider.bulkRemoveCategories(knownCategories, this.config);
    }
  }

  async revalidate(): Promise<void> {
    // A provider is "remote" if it has a revalidate method.
    // We will add this method to our remote providers.
    if ('revalidate' in this.provider && typeof (this.provider as any).revalidate === 'function') {
      // The revalidate method on providers can be a no-op, its existence is the key.
      await (this.provider as any).revalidate(this.config);
    }
  }
}
