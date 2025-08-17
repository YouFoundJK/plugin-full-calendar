import { TFile } from 'obsidian';
import { CalendarProvider } from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';

export class ProviderRegistry {
  private providers = new Map<string, CalendarProvider<any>>();
  private sources: CalendarInfo[] = [];

  // Properties from IdentifierManager and for linking singletons
  private plugin: FullCalendarPlugin;
  private cache: EventCache | null = null;
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  // Updated constructor
  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  // Method to link cache
  public setCache(cache: EventCache): void {
    this.cache = cache;
  }

  public updateSources(newSources: CalendarInfo[]): void {
    this.sources = newSources;
  }

  public getSource(id: string): CalendarInfo | undefined {
    return this.sources.find(s => (s as any).id === id);
  }

  public getAllSources(): CalendarInfo[] {
    return this.sources;
  }

  public getConfig(id: string): any | undefined {
    const source = this.getSource(id);
    return source ? (source as any).config : undefined;
  }

  register(provider: CalendarProvider<any>): void {
    if (this.providers.has(provider.type)) {
      console.warn(`Provider with type "${provider.type}" is already registered. Overwriting.`);
    }
    this.providers.set(provider.type, provider);
  }

  getProvider(type: string): CalendarProvider<any> | undefined {
    return this.providers.get(type);
  }

  getProviders(): CalendarProvider<any>[] {
    return Array.from(this.providers.values());
  }

  // Methods from IdentifierManager, adapted
  public generateId(): string {
    return `${this.pkCounter++}`;
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const calendarInfo = this.getSource(calendarId);
    if (!calendarInfo) {
      console.warn(`Could not find calendar info for ID ${calendarId}`);
      return null;
    }
    const provider = this.getProvider(calendarInfo.type);
    if (!provider) {
      console.warn(`Could not find provider for type ${calendarInfo.type}`);
      return null;
    }

    const handle = provider.getEventHandle(event, (calendarInfo as any).config);
    if (!handle) {
      return null;
    }

    return `${calendarId}::${handle.persistentId}`;
  }

  public buildMap(store: any): void {
    // store is EventStore
    if (!this.cache) return;
    this.identifierMapPromise = (async () => {
      this.identifierToSessionIdMap.clear();
      for (const storedEvent of store.getAllEvents()) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
        }
      }
    })();
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.set(globalIdentifier, sessionId);
    }
  }

  public removeMapping(event: OFCEvent, calendarId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
    }
  }

  public async fetchAllEvents(): Promise<
    { calendarId: string; event: OFCEvent; location: EventLocation | null }[]
  > {
    if (!this.cache) {
      throw new Error('Cache not set on ProviderRegistry');
    }

    const results: { calendarId: string; event: OFCEvent; location: EventLocation | null }[] = [];
    const promises = this.getAllSources().map(async info => {
      const settingsId = (info as any).id;
      const provider = this.getProvider(info.type);
      if (!provider || !settingsId) {
        console.warn('Full Calendar: Could not find provider or id for source.', info);
        return;
      }
      try {
        const rawEvents = await provider.getEvents((info as any).config);
        rawEvents.forEach(([rawEvent, location]) => {
          const event = this.cache!.enhancer.enhance(rawEvent);
          results.push({
            calendarId: settingsId,
            event,
            location
          });
        });
      } catch (e) {
        console.warn(`Full Calendar: Failed to load calendar source`, info, e);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  public async createEventInProvider(
    settingsId: string,
    event: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const calendarInfo = this.getSource(settingsId);
    if (!calendarInfo) {
      throw new Error(`Calendar with ID ${settingsId} not found.`);
    }
    const provider = this.getProvider(calendarInfo.type);
    if (!provider) {
      throw new Error(`Provider for type ${calendarInfo.type} not found.`);
    }
    const config = (calendarInfo as any).config;
    return provider.createEvent(event, config);
  }

  public async updateEventInProvider(
    sessionId: string,
    calendarId: string,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const calendarInfo = this.getSource(calendarId);
    if (!calendarInfo) {
      throw new Error(`Calendar with ID ${calendarId} not found.`);
    }
    const provider = this.getProvider(calendarInfo.type);
    if (!provider) {
      throw new Error(`Provider for type ${calendarInfo.type} not found.`);
    }

    const config = (calendarInfo as any).config;
    const handle = provider.getEventHandle(oldEventData, config);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }
    return provider.updateEvent(handle, oldEventData, newEventData, config);
  }

  public async deleteEventInProvider(
    sessionId: string,
    event: OFCEvent,
    calendarId: string
  ): Promise<void> {
    const calendarInfo = this.getSource(calendarId);
    if (!calendarInfo) {
      throw new Error(`Calendar with ID ${calendarId} not found.`);
    }
    const provider = this.getProvider(calendarInfo.type);
    if (!provider) {
      throw new Error(`Provider for type ${calendarInfo.type} not found.`);
    }
    const config = (calendarInfo as any).config;
    const handle = provider.getEventHandle(event, config);

    if (handle) {
      await provider.deleteEvent(handle, config);
    } else {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
    }
  }

  // NOTE: Keep handleFileUpdate and handleFileDelete stubs for now.
  public async handleFileUpdate(file: TFile): Promise<void> {
    // This will be implemented in Step 3
    return;
  }

  public async handleFileDelete(path: string): Promise<void> {
    // This will be implemented in Step 3
    return;
  }
}
