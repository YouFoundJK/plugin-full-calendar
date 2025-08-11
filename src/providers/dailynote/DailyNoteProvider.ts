import moment from 'moment';
import { TFile } from 'obsidian';
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
} from '../../calendars/parsing/dailynote/parser_dailyN';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { FullCalendarSettings } from '../../types/settings';
import { OFCEvent, EventLocation } from '../../types';
import { constructTitle, enhanceEvent, parseTitle } from '../../calendars/parsing/categoryParser';
import { convertEvent } from '../../calendars/utils/Timezone';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { DailyNoteProviderConfig } from './typesDaily';
import { DailyNoteConfigComponent } from './DailyNoteConfigComponent';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

export class DailyNoteProvider implements CalendarProvider<DailyNoteProviderConfig> {
  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;

  readonly type = 'dailynote';
  readonly displayName = 'Daily Note';
  readonly isRemote = false;

  constructor(app: ObsidianInterface, plugin: FullCalendarPlugin) {
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent, config: DailyNoteProviderConfig): EventHandle | null {
    if (event.type === 'single' && event.date) {
      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      const persistentId = `${event.date}::${fullTitle}`;
      const m = moment(event.date);
      const file = getDailyNote(m, getAllDailyNotes()) as TFile;
      if (!file) return null;
      return { persistentId, location: { path: file.path } };
    }
    return null;
  }

  public async getEventsInFile(
    file: TFile,
    config: DailyNoteProviderConfig
  ): Promise<EditableEventResponse[]> {
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    const cache = this.app.getMetadata(file);
    if (!cache) return [];
    const listItems = getListsUnderHeading(config.heading, cache);
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date })
    );
    const displayTimezone =
      this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inlineEvents.map(({ event: rawEvent, lineNumber }) => {
      console.log(
        '[DEBUG] DailyNoteProvider: Event BEFORE enhancement',
        JSON.parse(JSON.stringify(rawEvent))
      );

      const event = enhanceEvent(rawEvent, this.plugin.settings);

      console.log(
        '[DEBUG] DailyNoteProvider: Event AFTER enhancement',
        JSON.parse(JSON.stringify(event))
      );

      let sourceTimezone: string;

      if (this.plugin.settings.dailyNotesTimezone === 'local') {
        sourceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } else {
        sourceTimezone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      let translatedEvent = event;
      if (sourceTimezone !== displayTimezone) {
        translatedEvent = convertEvent(event, sourceTimezone, displayTimezone);
      }
      return [translatedEvent, { file, lineNumber }];
    });
  }

  async getEvents(config: DailyNoteProviderConfig): Promise<EditableEventResponse[]> {
    const notes = getAllDailyNotes();
    const files = Object.values(notes);
    const allEvents = await Promise.all(files.map(f => this.getEventsInFile(f, config)));
    return allEvents.flat();
  }

  async createEvent(
    event: OFCEvent,
    config: DailyNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation]> {
    if (event.type !== 'single') {
      throw new Error('Daily Note provider can only create single events.');
    }

    let eventToCreate = { ...event };
    const displayTimezone =
      this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!eventToCreate.timezone) {
      if (this.plugin.settings.dailyNotesTimezone === 'strict') {
        eventToCreate.timezone = displayTimezone;
      } else {
        eventToCreate.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    }

    if (eventToCreate.timezone !== displayTimezone) {
      eventToCreate = convertEvent(event, displayTimezone, eventToCreate.timezone);
    }

    const m = moment(eventToCreate.date);
    let file = getDailyNote(m, getAllDailyNotes());
    if (!file) file = await createDailyNote(m);
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == config.heading);
    if (!headingInfo) {
      throw new Error(`Could not find heading ${config.heading} in daily note ${file.path}.`);
    }
    let lineNumber = await this.app.rewrite(file, (contents: string) => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: eventToCreate, headingText: config.heading },
        this.plugin.settings
      );
      return [page, lineNumber] as [string, number];
    });
    return [event, { file, lineNumber }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent, // <-- ADD THIS PARAMETER (it will be unused)
    newEventData: OFCEvent,
    config: DailyNoteProviderConfig
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Daily Note provider can only update events to be single events.');
    }

    if (!handle.location?.path || handle.location?.lineNumber === undefined) {
      throw new Error(
        'DailyNoteProvider updateEvent requires a file path and line number in the event handle.'
      );
    }
    const { path, lineNumber } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const displayTimezone =
      this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let eventToWrite = newEventData;
    let targetTimezone: string;
    if (this.plugin.settings.dailyNotesTimezone === 'local') {
      targetTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else {
      const contents = await this.app.read(file);
      const line = contents.split('\n')[lineNumber];
      const sourceEvent = getInlineEventFromLine(line, {});
      targetTimezone = sourceEvent?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    if (displayTimezone !== targetTimezone) {
      eventToWrite = convertEvent(newEventData, displayTimezone, targetTimezone);
    }
    eventToWrite.timezone = targetTimezone;

    const oldDate = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (newEventData.date !== oldDate) {
      const m = moment(eventToWrite.date);
      let newFile = getDailyNote(m, getAllDailyNotes());
      if (!newFile) newFile = await createDailyNote(m);

      const metadata = this.app.getMetadata(newFile);
      if (!metadata) throw new Error('No metadata for file ' + newFile.path);

      const headingInfo = metadata.headings?.find(h => h.heading == config.heading);
      if (!headingInfo) {
        throw new Error(`Could not find heading ${config.heading} in daily note ${newFile.path}.`);
      }

      await this.app.rewrite(file, async oldFileContents => {
        let lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        await this.app.rewrite(newFile, newFileContents => {
          const { page, lineNumber: newLn } = addToHeading(
            newFileContents,
            { heading: headingInfo, item: eventToWrite, headingText: config.heading },
            this.plugin.settings
          );
          return page;
        });
        return lines.join('\n');
      });
      // Note: We don't have the new line number here. The EventCache will trigger a file re-read.
      return null;
    } else {
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], eventToWrite, this.plugin.settings);
        if (!newLine) throw new Error('Did not successfully update line.');
        lines[lineNumber] = newLine;
        return lines.join('\n');
      });
      return { file, lineNumber };
    }
  }

  async deleteEvent(handle: EventHandle, config: DailyNoteProviderConfig): Promise<void> {
    if (!handle.location?.path || handle.location?.lineNumber === undefined) {
      throw new Error('DailyNoteProvider deleteEvent requires a file path and line number.');
    }
    const { path, lineNumber } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    await this.app.rewrite(file, (contents: string) => {
      let lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  async bulkAddCategories(
    getCategory: (event: OFCEvent, location: EventLocation) => string | undefined,
    force: boolean,
    config: DailyNoteProviderConfig
  ): Promise<void> {
    const allNotes = Object.values(getAllDailyNotes());

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(config.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const existingEvent = getInlineEventFromLine(line, {});
          if (!existingEvent) continue;

          const enhanced = enhanceEvent(existingEvent, {
            ...this.plugin.settings,
            enableAdvancedCategorization: true
          });

          if (enhanced.category && !force) continue;

          const newCategory = getCategory(existingEvent, { file, lineNumber });
          if (!newCategory) continue;

          const rawTitle = line
            .replace(/^(\s*)\-\s+(\[(.)\]\s+)?/, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();
          const titleToCategorize = force ? rawTitle : existingEvent.title;
          const newFullTitle = constructTitle(newCategory, undefined, titleToCategorize);

          const {
            category: finalCategory,
            subCategory: finalSubCategory,
            title: finalTitle
          } = parseTitle(newFullTitle);

          const eventWithNewCategory: OFCEvent = {
            ...existingEvent,
            title: finalTitle,
            category: finalCategory,
            subCategory: finalSubCategory
          };

          const newLine = modifyListItem(line, eventWithNewCategory, this.plugin.settings);
          if (newLine) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
        return modified ? lines.join('\n') : content;
      });
    };

    await this.plugin.nonBlockingProcess(allNotes, processor, 'Categorizing daily notes');
  }

  async bulkRemoveCategories(
    knownCategories: Set<string>,
    config: DailyNoteProviderConfig
  ): Promise<void> {
    const categoriesToRemove = new Set(knownCategories);
    const { folder } = getDailyNoteSettings();
    const parentDir = folder
      ?.split('/')
      .filter(s => s)
      .pop();
    if (parentDir) categoriesToRemove.add(parentDir);

    const allNotes = Object.values(getAllDailyNotes());
    const removalSettings: FullCalendarSettings = {
      ...this.plugin.settings,
      enableAdvancedCategorization: true
    };

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(config.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const eventWithCategory = getInlineEventFromLine(line, {});
          if (!eventWithCategory) continue;

          const event = enhanceEvent(eventWithCategory, removalSettings);
          if (!event?.category || !categoriesToRemove.has(event.category)) continue;

          const eventWithoutCategory: OFCEvent = { ...event, category: undefined };
          const newLine = modifyListItem(line, eventWithoutCategory, this.plugin.settings);

          if (newLine && newLine !== line) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
        return modified ? lines.join('\n') : content;
      });
    };
    await this.plugin.nonBlockingProcess(allNotes, processor, 'De-categorizing daily notes');
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return DailyNoteConfigComponent;
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent,
    config: DailyNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    const masterLocalId = this.getEventHandle(masterEvent, config)?.persistentId;
    if (!masterLocalId) {
      throw new Error('Could not get persistent ID for master event.');
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterLocalId
    };

    return this.createEvent(overrideEventData, config);
  }
}
