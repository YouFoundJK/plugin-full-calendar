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
import { constructTitle, enhanceEvent } from '../../calendars/parsing/categoryParser';
import { EditableEventResponse } from '../../calendars/EditableCalendar';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { DailyNoteProviderConfig } from './typesDaily';
import { DailyNoteConfigComponent } from './DailyNoteConfigComponent';

export class DailyNoteProvider implements CalendarProvider<DailyNoteProviderConfig> {
  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private settings: FullCalendarSettings;

  readonly type = 'dailynote';
  readonly displayName = 'Daily Note';

  constructor(app: ObsidianInterface, plugin: FullCalendarPlugin, settings: FullCalendarSettings) {
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.settings = settings;
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

  async getEvents(config: DailyNoteProviderConfig): Promise<EditableEventResponse[]> {
    const notes = getAllDailyNotes();
    const files = Object.values(notes);
    const allEvents: EditableEventResponse[] = [];

    for (const file of files) {
      const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
      const cache = this.app.getMetadata(file);
      if (!cache) continue;

      const listItems = getListsUnderHeading(config.heading, cache);
      const inlineEvents = await this.app.process(file, text =>
        getAllInlineEventsFromFile(text, listItems, { date })
      );

      const displayTimezone =
        this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      const fileEvents: EditableEventResponse[] = inlineEvents.map(
        ({ event: rawEvent, lineNumber }) => {
          const event = enhanceEvent(rawEvent, this.settings);
          return [event, { file, lineNumber }];
        }
      );
      allEvents.push(...fileEvents);
    }
    return allEvents;
  }

  async createEvent(
    event: OFCEvent,
    config: DailyNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation]> {
    // FIX: Add a type guard.
    if (event.type !== 'single') {
      throw new Error('Daily Note provider can only create single events.');
    }

    const m = moment(event.date); // Now TypeScript knows event.date exists
    let file = getDailyNote(m, getAllDailyNotes());
    if (!file) file = await createDailyNote(m);
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == config.heading);

    if (!headingInfo)
      throw new Error(`Could not find heading ${config.heading} in daily note ${file.path}.`);

    let lineNumber = await this.app.rewrite(file, (contents: string) => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: event, headingText: config.heading },
        this.settings
      );
      return [page, lineNumber] as [string, number];
    });
    return [event, { file, lineNumber }];
  }

  async updateEvent(
    handle: EventHandle,
    newEventData: OFCEvent,
    config: DailyNoteProviderConfig
  ): Promise<EventLocation | null> {
    // FIX: Add a type guard.
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

    const oldDate = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (newEventData.date !== oldDate) {
      // Now TypeScript knows newEventData.date exists
      const m = moment(newEventData.date); // And it knows it exists here too
      let newFile = getDailyNote(m, getAllDailyNotes());
      if (!newFile) newFile = await createDailyNote(m);

      // ...rest of the logic...
      return { file: newFile, lineNumber: 0 }; // Placeholder
    } else {
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], newEventData, this.settings);
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
}
