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
} from './parser_dailyN';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { constructTitle } from '../../utils/categoryParser';
import { convertEvent } from '../../utils/Timezone';

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
      // Use raw event; enhancement is handled elsewhere now
      const event = rawEvent;

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
