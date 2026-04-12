import { CachedMetadata, moment as obsidianMoment, TFile } from 'obsidian';
import * as React from 'react';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import {
  getAllInlineEventsFromFile,
  getInlineEventFromLine,
  getListsUnderHeading,
  modifyListItem,
  addToHeading
} from './parser_dailyN';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { constructTitle } from '../../features/category/categoryParser';

import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { DailyNoteProviderConfig } from './typesDaily';
import { DailyNoteConfigComponent } from './DailyNoteConfigComponent';

const moment = obsidianMoment as unknown as typeof import('moment');
const METADATA_WAIT_TIMEOUT_MS = 1500;
const SUFFIX_PATTERN = '-_-_-';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

const stripDuplicateSuffix = (fullTitle: string): string =>
  fullTitle.replace(new RegExp(`${SUFFIX_PATTERN}\\d+$`), '');

const getSuffixNumberForBase = (candidate: string, baseTitle: string): number | null => {
  if (candidate === baseTitle) return 0;
  if (!candidate.startsWith(`${baseTitle}${SUFFIX_PATTERN}`)) return null;
  const suffix = candidate.slice(`${baseTitle}${SUFFIX_PATTERN}`.length);
  if (!/^\d+$/.test(suffix)) return null;
  return Number(suffix);
};

const waitForMetadataWithTimeout = async (
  app: ObsidianInterface,
  file: TFile,
  timeoutMs = METADATA_WAIT_TIMEOUT_MS
): Promise<CachedMetadata | null> => {
  const existing = app.getMetadata(file);
  if (existing) {
    return existing;
  }

  try {
    return await Promise.race([
      app.waitForMetadata(file),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch (error) {
    console.warn(
      `Full Calendar: Failed while waiting for metadata for daily note file "${file.path}".`,
      error
    );
    return null;
  }
};

// Settings row component for Daily Note Provider
const DailyNoteHeadingSetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  // Handle both flat and nested config structures for heading
  const getHeading = (): string => {
    const flat = (source as { heading?: unknown }).heading;
    const nested = (source as { config?: { heading?: unknown } }).config?.heading;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control fc-heading-setting-control' },
    React.createElement('span', {}, 'Under heading'),
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getHeading(),
      className: 'fc-setting-input is-inline'
    }),
    React.createElement('span', { className: 'fc-heading-setting-suffix' }, 'in daily notes')
  );
};

type DailyNoteConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<DailyNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<DailyNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: DailyNoteProviderConfig | DailyNoteProviderConfig[]) => void;
  onClose: () => void;
};

const DailyNoteConfigWrapper: React.FC<DailyNoteConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: DailyNoteProviderConfig) => onSave(finalConfig);

  return React.createElement(DailyNoteConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

export class DailyNoteProvider
  implements CalendarProvider<DailyNoteProviderConfig>, SyncKeyProvider
{
  // Static metadata for registry
  static readonly type = 'dailynote';
  static readonly displayName = 'Daily Note';

  static getConfigurationComponent(): FCReactComponent<DailyNoteConfigProps> {
    return DailyNoteConfigWrapper;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: DailyNoteProviderConfig;

  readonly type = 'dailynote';
  readonly displayName = 'Daily Note';
  readonly isRemote = false;
  readonly loadPriority = 120;

  constructor(
    source: DailyNoteProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    if (!app) {
      throw new Error('DailyNoteProvider requires an Obsidian app interface.');
    }
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.type === 'single' && event.date) {
      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      const persistentId = `${event.date}::${fullTitle}`;
      const m = moment(event.date);
      const file = getDailyNote(m, getAllDailyNotes());
      if (!file || !(file instanceof TFile)) return null;
      return { persistentId, location: { path: file.path } };
    }
    return null;
  }

  /**
   * Pure-string sync key — identical to the persistentId from getEventHandle,
   * but WITHOUT the expensive moment() + getAllDailyNotes() vault scan.
   * This makes bulk sync diffing O(N) instead of O(N×V).
   */
  computeSyncKey(event: OFCEvent): string {
    if (event.type === 'single' && event.date) {
      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      return `${event.date}::${fullTitle}`;
    }
    // Fallback for non-standard event types (should not occur in practice)
    return `${event.type || 'unknown'}::${event.title || ''}::${JSON.stringify(event)}`;
  }

  public isFileRelevant(file: TFile): boolean {
    // Encapsulates the logic of checking the daily note folder.
    const { folder } = getDailyNoteSettings();
    return folder ? file.path.startsWith(folder + '/') : true;
  }

  private _withTitleFromFullTitle(event: OFCEvent, fullTitle: string): OFCEvent {
    const category = event.category;
    const subCategory = event.subCategory;

    let title = fullTitle;
    if (category && subCategory) {
      const prefix = `${category} - ${subCategory} - `;
      if (fullTitle.startsWith(prefix)) title = fullTitle.slice(prefix.length);
    } else if (category) {
      const prefix = `${category} - `;
      if (fullTitle.startsWith(prefix)) title = fullTitle.slice(prefix.length);
    } else if (subCategory) {
      const prefix = `${subCategory} - `;
      if (fullTitle.startsWith(prefix)) title = fullTitle.slice(prefix.length);
    }

    return { ...event, title };
  }

  private async _ensureUniqueFullTitleInFile(
    file: TFile,
    requestedFullTitle: string,
    excludePersistentId?: string
  ): Promise<string> {
    const content = await this.app.read(file);
    const lines = content.split('\n');
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (!date) {
      return requestedFullTitle;
    }

    const baseTitle = stripDuplicateSuffix(requestedFullTitle);
    let maxSuffix = -1;

    for (const line of lines) {
      const parsed = getInlineEventFromLine(line, { date });
      if (!parsed || parsed.type !== 'single') continue;

      const existingFullTitle = constructTitle(parsed.category, parsed.subCategory, parsed.title);
      const existingId = `${parsed.date}::${existingFullTitle}`;
      if (excludePersistentId && existingId === excludePersistentId) continue;

      if (stripDuplicateSuffix(existingFullTitle) !== baseTitle) continue;

      const suffixNumber = getSuffixNumberForBase(existingFullTitle, baseTitle);
      if (suffixNumber !== null) {
        maxSuffix = Math.max(maxSuffix, suffixNumber);
      }
    }

    if (maxSuffix < 0) {
      return baseTitle;
    }
    return `${baseTitle}${SUFFIX_PATTERN}${maxSuffix + 1}`;
  }

  private async _withUniqueStoredTitle(
    file: TFile,
    event: OFCEvent,
    excludePersistentId?: string
  ): Promise<OFCEvent> {
    const requestedFullTitle = constructTitle(event.category, event.subCategory, event.title);
    const uniqueFullTitle = await this._ensureUniqueFullTitleInFile(
      file,
      requestedFullTitle,
      excludePersistentId
    );
    return this._withTitleFromFullTitle(event, uniqueFullTitle);
  }

  private _normalizeDuplicateTitlesInMemory(events: OFCEvent[]): OFCEvent[] {
    const usedTitles = new Set<string>();

    return events.map(event => {
      if (event.type !== 'single' || !event.date) {
        return event;
      }

      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      if (!usedTitles.has(fullTitle)) {
        usedTitles.add(fullTitle);
        return event;
      }

      const baseTitle = stripDuplicateSuffix(fullTitle);
      let i = 1;
      let candidate = `${baseTitle}${SUFFIX_PATTERN}${i}`;
      while (usedTitles.has(candidate)) {
        i++;
        candidate = `${baseTitle}${SUFFIX_PATTERN}${i}`;
      }

      usedTitles.add(candidate);
      return this._withTitleFromFullTitle(event, candidate);
    });
  }

  private async _findEventLineNumber(file: TFile, persistentId: string): Promise<number> {
    const content = await this.app.read(file);
    const lines = content.split('\n');
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');

    // It's possible for a daily note file to not have a date in its title.
    // In that case, we cannot reliably parse events from it.
    if (!date) {
      throw new Error(`Could not determine date from file: ${file.path}`);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const event = getInlineEventFromLine(line, { date });
      if (event && event.type === 'single') {
        // Check for event type
        const fullTitle = constructTitle(event.category, event.subCategory, event.title);
        // Now it's safe to access event.date
        const currentId = `${event.date}::${fullTitle}`;
        if (currentId === persistentId) {
          return i; // Found it
        }
      }
    }

    throw new Error(`Could not find event with ID "${persistentId}" in file "${file.path}".`);
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    const cache = await waitForMetadataWithTimeout(this.app, file);
    if (!cache) {
      return [];
    }
    const listItems = getListsUnderHeading(this.source.heading, cache);
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date })
    );
    const normalizedEvents = this._normalizeDuplicateTitlesInMemory(
      inlineEvents.map(({ event }) => event)
    );
    // The raw events are returned as-is. The EventEnhancer handles timezone conversion.
    return inlineEvents.map(({ lineNumber }, index) => {
      return [normalizedEvents[index], { file, lineNumber }];
    });
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<EditableEventResponse[]> {
    const notes = getAllDailyNotes();
    let files = Object.values(notes);

    // OPTIMIZATION: If a range is provided, only process daily notes within that range.
    if (range) {
      const startMoment = moment(range.start);
      const endMoment = moment(range.end);
      files = files.filter(file => {
        const fileDate = getDateFromFile(file, 'day');
        return (
          fileDate && fileDate.isSameOrAfter(startMoment) && fileDate.isSameOrBefore(endMoment)
        );
      });
    }

    const allEvents = await Promise.all(files.map(f => this.getEventsInFile(f)));
    return allEvents.flat();
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    if (event.type !== 'single') {
      throw new Error('Daily Note provider can only create single events.');
    }

    const m = moment(event.date);
    let file = getDailyNote(m, getAllDailyNotes());
    if (!file) file = await createDailyNote(m);
    const eventToStore = await this._withUniqueStoredTitle(file, event);
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == this.source.heading);
    // if (!headingInfo) {
    //   throw new Error(`Could not find heading ${this.source.heading} in daily note ${file.path}.`);
    // }
    const lineNumber = await this.app.rewrite(file, (contents: string) => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: eventToStore, headingText: this.source.heading },
        this.plugin.settings
      );
      return [page, lineNumber] as [string, number];
    });
    return [eventToStore, { file, lineNumber }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Daily Note provider can only update events to be single events.');
    }

    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider updateEvent requires a file path in the event handle.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(file, handle.persistentId);

    const oldDate = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (newEventData.date !== oldDate) {
      const m = moment(newEventData.date);
      let newFile = getDailyNote(m, getAllDailyNotes());
      if (!newFile) newFile = await createDailyNote(m);
      const eventToStore = await this._withUniqueStoredTitle(newFile, newEventData);
      Object.assign(newEventData, eventToStore);

      // First, delete the line from the old file.
      await this.app.rewrite(file, oldFileContents => {
        const lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        return lines.join('\n');
      });

      // Second, add the event to the new file and get its line number.
      const metadata = await this.app.waitForMetadata(newFile);
      const headingInfo = metadata.headings?.find(h => h.heading == this.source.heading);
      // if (!headingInfo) {
      //   throw new Error(
      //     `Could not find heading ${this.source.heading} in daily note ${newFile.path}.`
      //   );
      // }

      const newLn = await this.app.rewrite(newFile, newFileContents => {
        const { page, lineNumber } = addToHeading(
          newFileContents,
          { heading: headingInfo, item: eventToStore, headingText: this.source.heading },
          this.plugin.settings
        );
        return [page, lineNumber] as [string, number];
      });

      // Finally, return the authoritative new location to the cache.
      return { file: newFile, lineNumber: newLn };
    } else {
      const eventToStore = await this._withUniqueStoredTitle(
        file,
        newEventData,
        handle.persistentId
      );
      Object.assign(newEventData, eventToStore);
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], eventToStore, this.plugin.settings);
        if (!newLine) throw new Error('Did not successfully update line.');
        lines[lineNumber] = newLine;
        return lines.join('\n');
      });
      return { file, lineNumber };
    }
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider deleteEvent requires a file path.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(file, handle.persistentId);

    await this.app.rewrite(file, (contents: string) => {
      const lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  getConfigurationComponent(): FCReactComponent<DailyNoteConfigProps> {
    return DailyNoteConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return DailyNoteHeadingSetting;
  }

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const masterLocalId = this.getEventHandle(masterEvent)?.persistentId;
    if (!masterLocalId) {
      throw new Error('Could not get persistent ID for master event.');
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterLocalId
    };

    return this.createEvent(overrideEventData);
  }
}
