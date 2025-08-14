/**
 * @file IdentifierManager.ts
 * @brief Manages the mapping between persistent and session-specific event IDs.
 *
 * @description
 * This class is an internal module of the EventCache. It abstracts away the
 * complexity of handling transient session IDs versus persistent, globally-unique
 * identifiers for events. It's responsible for generating new IDs and maintaining
 * the lookup map.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../types';
import EventCache from '../EventCache';
import { getRuntimeCalendarId } from '../../ui/settings/utilsSettings';

export class IdentifierManager {
  private cache: EventCache; // Changed from `calendars`
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  constructor(cache: EventCache) {
    // Changed constructor
    this.cache = cache;
  }

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
    // [DEBUG] Log calendarId received

    // @ts-ignore: Accessing private field for refactor
    const calendarInfo = this.cache.calendarInfos.find(
      // @ts-ignore
      info => getRuntimeCalendarId(info) === calendarId
    );
    if (!calendarInfo) {
      // [DEBUG] Log failure to find calendarInfo
      console.warn(`Could not find calendar info for ID ${calendarId}`);
      return null;
    }
    const provider = this.cache.plugin.providerRegistry.getProvider(calendarInfo.type);
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
    // Changed store type to any to avoid import
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
}
