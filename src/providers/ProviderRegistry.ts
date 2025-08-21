import { TFile, Notice } from 'obsidian';
import { CalendarProvider, CalendarProviderCapabilities } from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';
import { ObsidianIO, ObsidianInterface } from '../ObsidianAdapter';
import { FullNoteProvider } from './fullnote/FullNoteProvider';
import { DailyNoteProvider } from './dailynote/DailyNoteProvider';
import { ICSProvider } from './ics/ICSProvider';
import { CalDAVProvider } from './caldav/CalDAVProvider';
import { GoogleProvider } from './google/GoogleProvider';
import { FullNoteProviderConfig } from './fullnote/typesLocal';
import { DailyNoteProviderConfig } from './dailynote/typesDaily';
import { ICSProviderConfig } from './ics/typesICS';
import { CalDAVProviderConfig } from './caldav/typesCalDAV';
import { GoogleProviderConfig } from './google/typesGCal';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

export type CalendarProviderClass = new (
  config: any,
  plugin: FullCalendarPlugin,
  app?: ObsidianInterface // Make app optional for remote providers
) => CalendarProvider<any>;

export class ProviderRegistry {
  private providers = new Map<string, CalendarProviderClass>();
  private instances = new Map<string, CalendarProvider<any>>();
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
    this.initializeInstances();
  }

  // Register all built-in providers in one call
  public registerBuiltInProviders(): void {
    this.register(FullNoteProvider as any);
    this.register(DailyNoteProvider as any);
    this.register(ICSProvider);
    this.register(CalDAVProvider);
    this.register(GoogleProvider);
  }

  // Method to link cache
  public setCache(cache: EventCache): void {
    this.cache = cache;
  }

  public updateSources(newSources: CalendarInfo[]): void {
    this.sources = newSources;
    this.initializeInstances();
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

  /**
   * New registration method for provider classes (constructors).
   */
  public register(providerClass: CalendarProviderClass): void {
    const providerType = (providerClass as any).type;
    if (this.providers.has(providerType)) {
      console.warn(
        `Provider class with type "${providerType}" is already registered. Overwriting.`
      );
    }
    this.providers.set(providerType, providerClass);
  }

  /**
   * New getter for provider classes (constructors).
   */
  public getProviderForType(type: string): CalendarProviderClass | undefined {
    return this.providers.get(type);
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
    const instance = this.instances.get(calendarId);
    if (!instance) {
      console.warn(`Could not find provider instance for calendar ID ${calendarId}`);
      return null;
    }
    const handle = instance.getEventHandle(event);
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
    const promises = [];

    for (const [settingsId, instance] of this.instances.entries()) {
      const promise = (async () => {
        try {
          const rawEvents = await instance.getEvents();
          rawEvents.forEach(([rawEvent, location]) => {
            const event = this.cache!.enhancer.enhance(rawEvent);
            results.push({
              calendarId: settingsId,
              event,
              location
            });
          });
        } catch (e) {
          const source = this.getSource(settingsId);
          console.warn(`Full Calendar: Failed to load calendar source`, source, e);
        }
      })();
      promises.push(promise);
    }

    await Promise.allSettled(promises);
    return results;
  }

  public async createEventInProvider(
    settingsId: string,
    event: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(settingsId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${settingsId} not found.`);
    }
    return instance.createEvent(event);
  }

  public async updateEventInProvider(
    sessionId: string,
    calendarId: string,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(oldEventData);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }
    return instance.updateEvent(handle, oldEventData, newEventData);
  }

  public async deleteEventInProvider(
    sessionId: string,
    event: OFCEvent,
    calendarId: string
  ): Promise<void> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(event);

    if (handle) {
      await instance.deleteEvent(handle);
    } else {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
    }
  }

  // NOTE: Keep handleFileUpdate and handleFileDelete stubs for now.
  public async handleFileUpdate(file: TFile): Promise<void> {
    if (!this.cache) return;

    // Find all *local* provider instances that might be interested in this file.
    const interestedInstances = [];
    for (const [settingsId, instance] of this.instances.entries()) {
      if (!instance.isRemote && instance.getEventsInFile) {
        const config = (instance as any).config;
        let isRelevant = false;
        if (instance.type === 'local' && config.directory) {
          isRelevant = file.path.startsWith(config.directory + '/');
        } else if (instance.type === 'dailynote') {
          const { folder } = require('obsidian-daily-notes-interface').getDailyNoteSettings();
          isRelevant = folder ? file.path.startsWith(folder + '/') : true;
        }

        if (isRelevant) {
          interestedInstances.push({ instance, config, settingsId });
        }
      }
    }

    if (interestedInstances.length === 0) {
      // No providers care about this file, so we can stop.
      await this.cache.syncFile(file, []);
      return;
    }

    // Aggregate all events from all interested providers for this one file.
    const allNewEvents: { event: OFCEvent; location: EventLocation | null; calendarId: string }[] =
      [];
    for (const { instance, settingsId } of interestedInstances) {
      const eventsFromFile = await instance.getEventsInFile!(file);
      for (const [event, location] of eventsFromFile) {
        allNewEvents.push({ event, location, calendarId: settingsId });
      }
    }

    // Push the definitive new state of the file to the cache for diffing.
    await this.cache.syncFile(file, allNewEvents);
  }

  public async handleFileDelete(path: string): Promise<void> {
    if (!this.cache) return;
    // For a delete, the new state of the file is "no events".
    // The cache will diff this against its old state and remove everything.
    await this.cache.syncFile({ path } as TFile, []);
  }

  // Add these properties for remote revalidation
  private revalidating = false;
  private lastRevalidation = 0;

  public revalidateRemoteCalendars(force = false): void {
    if (!this.cache) return;
    if (this.revalidating) {
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      return;
    }

    const remoteInstances = Array.from(this.instances.entries()).filter(
      ([_, instance]) => instance.isRemote
    );

    if (remoteInstances.length === 0) {
      return;
    }

    this.revalidating = true;
    new Notice('Revalidating remote calendars...');

    const promises = remoteInstances.map(([settingsId, instance]) => {
      return instance
        .getEvents()
        .then(events => {
          this.cache!.syncCalendar(settingsId, events);
        })
        .catch(err => {
          const source = this.getSource(settingsId);
          const name = (source as any)?.name || instance.type;
          throw new Error(`Failed to revalidate calendar "${name}": ${err.message}`);
        });
    });

    Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('One or more remote calendars failed to load. Check the console for details.');
        errors.forEach(reason => {
          console.error(`Full Calendar: Revalidation failed.`, reason);
        });
      } else {
        new Notice('Remote calendars revalidated.');
      }
    });
  }

  private initializeInstances(): void {
    this.instances.clear();
    const sources = this.plugin.settings.calendarSources;

    for (const source of sources) {
      const settingsId = (source as any).id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', source);
        continue;
      }

      const config = (source as any).config;
      let instance: CalendarProvider<any> | null = null;
      const app = new ObsidianIO(this.plugin.app);

      switch (source.type) {
        case 'local':
          instance = new FullNoteProvider(config as FullNoteProviderConfig, this.plugin, app);
          break;
        case 'dailynote':
          instance = new DailyNoteProvider(config as DailyNoteProviderConfig, this.plugin, app);
          break;
        case 'ical':
          instance = new ICSProvider(config as ICSProviderConfig, this.plugin);
          break;
        case 'caldav':
          instance = new CalDAVProvider(config as CalDAVProviderConfig, this.plugin);
          break;
        case 'google':
          instance = new GoogleProvider(config as GoogleProviderConfig, this.plugin);
          break;
      }

      if (instance) {
        this.instances.set(settingsId, instance);
      }
    }
  }

  public getInstance(id: string): CalendarProvider<any> | undefined {
    return this.instances.get(id);
  }

  public getCapabilities(id: string): CalendarProviderCapabilities | null {
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    return instance.getCapabilities();
  }

  public async createInstanceOverrideInProvider(
    calendarId: string,
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    return instance.createInstanceOverride(masterEvent, instanceDate, newEventData);
  }
}
