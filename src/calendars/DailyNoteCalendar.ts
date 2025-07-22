/**
 * @file DailyNoteCalendar.ts
 * @brief Implements a calendar source that parses events from daily notes.
 *
 * @description
 * This file defines the `DailyNoteCalendar` class, which manages events
 * stored as list items within Obsidian's daily notes. It is responsible for
 * parsing tasks and events from a specific heading, using inline dataview-like
 * attributes (`[key:: value]`) for event properties. It also handles the
 * serialization and writing of events back into the correct daily note file.
 *
 * @see EditableCalendar.ts
 *
 * @license See LICENSE.md
 */

import moment from 'moment';
import { TFile, CachedMetadata, HeadingCache, ListItemCache, Loc, Pos } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';
import { EventPathLocation } from '../core/EventStore';
import { ObsidianInterface } from '../ObsidianAdapter';
import { OFCEvent, EventLocation, CalendarInfo, validateEvent } from '../types';
import { EventResponse } from './Calendar';
import { EditableCalendar, EditableEventResponse, CategoryProvider } from './EditableCalendar';
import { FullCalendarSettings } from '../ui/settings';
import { convertEvent } from '../core/Timezone';
import { constructTitle, parseTitle } from '../core/categoryParser';
import FullCalendarPlugin from '../main';

const DATE_FORMAT = 'YYYY-MM-DD';

// PARSING

type Line = {
  text: string;
  lineNumber: number;
};

const parseBool = (s: string): boolean | string =>
  s === 'true' ? true : s === 'false' ? false : s;

const fieldRegex = /\[([^\]]+):: ?([^\]]+)\]/g;
export function getInlineAttributes(s: string): Record<string, string | boolean> {
  return Object.fromEntries(Array.from(s.matchAll(fieldRegex)).map(m => [m[1], parseBool(m[2])]));
}

const getHeadingPosition = (
  headingText: string,
  metadata: CachedMetadata,
  endOfDoc: Loc
): Pos | null => {
  if (!metadata.headings) return null;
  let level: number | null = null;
  let startingPos: Pos | null = null;
  let endingPos: Pos | null = null;
  for (const heading of metadata.headings) {
    if (!level && heading.heading === headingText) {
      level = heading.level;
      startingPos = heading.position;
    } else if (level && heading.level <= level) {
      endingPos = heading.position;
      break;
    }
  }
  if (!level || !startingPos) return null;
  return { start: startingPos.end, end: endingPos?.start || endOfDoc };
};

const getListsUnderHeading = (headingText: string, metadata: CachedMetadata): ListItemCache[] => {
  if (!metadata.listItems) return [];
  const endOfDoc = metadata.sections?.last()?.position.end;
  if (!endOfDoc) return [];
  const headingPos = getHeadingPosition(headingText, metadata, endOfDoc);
  if (!headingPos) return [];
  return metadata.listItems?.filter(
    l =>
      headingPos.start.offset < l.position.start.offset &&
      l.position.end.offset <= headingPos.end.offset
  );
};

const listRegex = /^(\s*)\-\s+(\[(.)\]\s+)?/;
const checkboxRegex = /^\s*\-\s+\[(.)\]\s+/;
const checkboxTodo = (s: string) => {
  const match = s.match(checkboxRegex);
  if (!match || !match[1]) return null;
  return match[1] === ' ' ? false : match[1];
};

// ADD EXPORT HERE
export const getInlineEventFromLine = (
  text: string,
  globalAttrs: Partial<OFCEvent>,
  settings: FullCalendarSettings
): OFCEvent | null => {
  const attrs = getInlineAttributes(text);
  const rawTitle = text.replace(listRegex, '').replace(fieldRegex, '').trim();

  let eventData: any = {};
  if (settings.enableCategoryColoring) {
    const { category, title } = parseTitle(rawTitle);
    eventData.title = title;
    eventData.category = category;
  } else {
    eventData.title = rawTitle;
  }

  // Do a cheap check for an event before validating
  if (Object.keys(attrs).length === 0 && !settings.enableCategoryColoring) {
    return null;
  }

  return validateEvent({
    ...eventData,
    completed: checkboxTodo(text),
    ...globalAttrs,
    ...attrs
  });
};

function getAllInlineEventsFromFile(
  fileText: string,
  listItems: ListItemCache[],
  fileGlobalAttrs: Partial<OFCEvent>,
  settings: FullCalendarSettings
): { lineNumber: number; event: OFCEvent }[] {
  const lines = fileText.split('\n');
  const listItemText: Line[] = listItems
    .map(i => i.position.start.line)
    .map(idx => ({ lineNumber: idx, text: lines[idx] }));

  return listItemText
    .map(l => ({
      lineNumber: l.lineNumber,
      event: getInlineEventFromLine(l.text, { ...fileGlobalAttrs, type: 'single' }, settings)
    }))
    .flatMap(({ event, lineNumber }) => (event ? [{ event, lineNumber }] : []));
}

// SERIALIZATION

const generateInlineAttributes = (attrs: Record<string, any>): string => {
  return Object.entries(attrs)
    .map(([k, v]) => `[${k}:: ${v}]`)
    .join('  ');
};
// MODIFICATION: Pass settings to serialization functions
const makeListItem = (
  data: OFCEvent,
  whitespacePrefix: string = '',
  settings: FullCalendarSettings
): string => {
  if (data.type !== 'single') throw new Error('Can only pass in single event.');
  const { completed, title, category } = data;
  const checkbox = (() => {
    if (completed !== null && completed !== undefined) {
      return `[${completed ? 'x' : ' '}]`;
    }
    return null;
  })();

  const titleToWrite = settings.enableCategoryColoring ? constructTitle(category, title) : title;

  const attrs: Partial<OFCEvent> = { ...data };
  delete attrs['completed'];
  delete attrs['title'];
  delete attrs['type'];
  delete attrs['date'];
  delete attrs['category']; // Don't write category as an inline field

  for (const key of <(keyof OFCEvent)[]>Object.keys(attrs)) {
    if (attrs[key] === undefined || attrs[key] === null) {
      delete attrs[key];
    }
  }

  if (!attrs['allDay']) delete attrs['allDay'];

  return `${whitespacePrefix}- ${checkbox || ''} ${titleToWrite} ${generateInlineAttributes(attrs)}`;
};

const modifyListItem = (
  line: string,
  data: OFCEvent,
  settings: FullCalendarSettings
): string | null => {
  const listMatch = line.match(listRegex);
  if (!listMatch) {
    console.warn("Tried modifying a list item with a position that wasn't a list item", { line });
    return null;
  }
  return makeListItem(data, listMatch[1], settings);
};

/**
 * Add a list item to a given heading.
 * If the heading is undefined, then append the heading to the end of the file.
 */
// TODO: refactor this to not do the weird props thing
type AddToHeadingProps = {
  heading: HeadingCache | undefined;
  item: OFCEvent;
  headingText: string;
};
const addToHeading = (
  page: string,
  { heading, item, headingText }: AddToHeadingProps,
  settings: FullCalendarSettings
): { page: string; lineNumber: number } => {
  let lines = page.split('\n');
  const listItem = makeListItem(item, '', settings);
  if (heading) {
    const headingLine = heading.position.start.line;
    const lineNumber = headingLine + 1;
    lines.splice(lineNumber, 0, listItem);
    return { page: lines.join('\n'), lineNumber };
  } else {
    lines.push(`## ${headingText}`);
    lines.push(listItem);
    return { page: lines.join('\n'), lineNumber: lines.length - 1 };
  }
};

export default class DailyNoteCalendar extends EditableCalendar {
  app: ObsidianInterface;
  plugin: FullCalendarPlugin;
  heading: string;

  constructor(
    app: ObsidianInterface,
    plugin: FullCalendarPlugin,
    color: string,
    heading: string,
    settings: FullCalendarSettings
  ) {
    super(color, settings);
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.heading = heading;
  }

  get type(): CalendarInfo['type'] {
    return 'dailynote';
  }
  get identifier(): string {
    return this.heading;
  }
  get name(): string {
    return `Daily note under "${this.heading}"`;
  }
  get directory(): string {
    const { folder } = getDailyNoteSettings();
    if (!folder) throw new Error('Could not load daily note settings.');
    return folder;
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const date = getDateFromFile(file as any, 'day')?.format('YYYY-MM-DD');
    if (!date) return [];
    const cache = this.app.getMetadata(file);
    if (!cache) return [];
    const listItems = getListsUnderHeading(this.heading, cache);
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date }, this.settings)
    );
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inlineEvents.map(({ event, lineNumber }) => {
      let sourceTimezone: string;

      // If mode is 'local', the event's source is always the current system time.
      if (this.settings.dailyNotesTimezone === 'local') {
        sourceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      // In 'strict' mode, the source is what's written in the note, with system as a fallback.
      else {
        sourceTimezone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      let translatedEvent = event;
      if (sourceTimezone !== displayTimezone) {
        translatedEvent = convertEvent(event, sourceTimezone, displayTimezone);
      }
      return [translatedEvent, { file, lineNumber }];
    });
  }

  async modifyEvent(
    loc: EventPathLocation,
    newEvent: OFCEvent,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    if (newEvent.type !== 'single' && newEvent.type !== undefined)
      throw new Error('Recurring events in daily notes are not supported.');
    if (newEvent.endDate) throw new Error('Multi-day events are not supported in daily notes.');
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let eventToWrite = newEvent;
    let targetTimezone: string;
    if (this.settings.dailyNotesTimezone === 'local') {
      targetTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else {
      const { file, lineNumber } = this.getConcreteLocation(loc);
      const contents = await this.app.read(file);
      const line = contents.split('\n')[lineNumber];
      const sourceEvent = getInlineEventFromLine(line, {}, this.settings);
      targetTimezone = sourceEvent?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    if (displayTimezone !== targetTimezone && newEvent.type === 'single') {
      eventToWrite = convertEvent(newEvent, displayTimezone, targetTimezone) as typeof newEvent;
    }
    // Always stamp the event with its target timezone before writing.
    eventToWrite.timezone = targetTimezone;

    // The rest of the file modification logic remains the same...
    const { file, lineNumber } = this.getConcreteLocation(loc);
    const oldDate = getDateFromFile(file as any, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (eventToWrite.date !== oldDate) {
      // ... Logic to move event to a new file
      const m = moment(eventToWrite.date);
      let newFile = getDailyNote(m, getAllDailyNotes()) as TFile;
      if (!newFile) newFile = (await createDailyNote(m)) as TFile;
      await this.app.read(newFile);
      const metadata = this.app.getMetadata(newFile);
      if (!metadata) throw new Error('No metadata for file ' + newFile.path);
      const headingInfo = metadata.headings?.find(h => h.heading == this.heading);
      if (!headingInfo)
        throw new Error(`Could not find heading ${this.heading} in daily note ${newFile.path}.`);
      await this.app.rewrite(file, async oldFileContents => {
        let lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        await this.app.rewrite(newFile, newFileContents => {
          const { page, lineNumber: newLn } = addToHeading(
            newFileContents,
            { heading: headingInfo, item: eventToWrite, headingText: this.heading },
            this.settings
          );
          updateCacheWithLocation({ file: newFile, lineNumber: newLn });
          return page;
        });
        return lines.join('\n');
      });
    } else {
      updateCacheWithLocation({ file, lineNumber });
      await this.app.rewrite(file, contents => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], eventToWrite, this.settings);
        if (!newLine) throw new Error('Did not successfully update line.');
        lines[lineNumber] = newLine;
        return lines.join('\n');
      });
    }
  }

  // RESTORED getEvents
  async getEvents(): Promise<EventResponse[]> {
    const notes = getAllDailyNotes();
    const files = Object.values(notes) as TFile[];
    return (await Promise.all(files.map(f => this.getEventsInFile(f)))).flat();
  }

  async createEvent(event: OFCEvent): Promise<EventLocation> {
    if (event.type !== 'single' && event.type !== undefined)
      throw new Error('Cannot create a recurring event in a daily note.');
    const eventToCreate = {
      ...event,
      // The native timezone of a new daily note event is always the current system time.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // If in strict mode, stamp the event with the display timezone.
    if (this.settings.dailyNotesTimezone === 'strict') eventToCreate.timezone = displayTimezone;
    const m = moment(eventToCreate.date);
    let file = getDailyNote(m, getAllDailyNotes()) as TFile;
    if (!file) file = (await createDailyNote(m)) as TFile;
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == this.heading);
    if (!headingInfo)
      throw new Error(`Could not find heading ${this.heading} in daily note ${file.path}.`);
    let lineNumber = await this.app.rewrite(file, contents => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: eventToCreate, headingText: this.heading },
        this.settings
      );
      return [page, lineNumber] as [string, number];
    });
    return { file, lineNumber };
  }

  private getConcreteLocation({ path, lineNumber }: EventPathLocation): {
    file: TFile;
    lineNumber: number;
  } {
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);
    if (!lineNumber) throw new Error(`Daily note events must have a line number.`);
    return { file, lineNumber };
  }

  async deleteEvent(loc: EventPathLocation): Promise<void> {
    const { file, lineNumber } = this.getConcreteLocation(loc);
    this.app.rewrite(file, contents => {
      let lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  move(from: EventPathLocation, to: EditableCalendar): Promise<EventLocation> {
    throw new Error('Method not implemented.');
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    const allNotes = Object.values(getAllDailyNotes()) as TFile[];

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(this.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];

          // For the "smart" check, we still need to parse to see if a category exists.
          const existingEvent = getInlineEventFromLine(line, {}, this.settings);
          if (!existingEvent) continue;

          if (existingEvent.category && !force) {
            continue; // Smart mode: skip.
          }

          const newCategory = getCategory(existingEvent, { file, lineNumber });
          if (!newCategory) {
            continue;
          }

          // **THE CRITICAL FIX IS HERE:**
          // Get the RAW title string from the line, without parsing for categories.
          const rawTitle = line.replace(listRegex, '').replace(fieldRegex, '').trim();

          // If forcing, we use this raw, un-parsed title. This is the key.
          // In your example, `rawTitle` is "Sleep - Night".
          // If not forcing (smart), we use the clean title from our parsed event.
          const titleToCategorize = force ? rawTitle : existingEvent.title;

          const newFullTitle = constructTitle(newCategory, titleToCategorize);

          // Now parse the final result to get the components for the new event object.
          const { category: finalCategory, title: finalTitle } = parseTitle(newFullTitle);

          const eventWithNewCategory: OFCEvent = {
            ...existingEvent,
            title: finalTitle,
            category: finalCategory
          };

          const newLine = modifyListItem(line, eventWithNewCategory, this.settings);
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

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    const allNotes = Object.values(getAllDailyNotes()) as TFile[];

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(this.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];

          const event = getInlineEventFromLine(line, {}, this.settings);
          if (!event?.category || !knownCategories.has(event.category)) continue;

          const eventWithoutCategory: OFCEvent = { ...event, category: undefined };
          const newLine = modifyListItem(line, eventWithoutCategory, this.settings);
          if (newLine) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
        return modified ? lines.join('\n') : content;
      });
    };

    await this.plugin.nonBlockingProcess(allNotes, processor, 'De-categorizing daily notes');
  }
}
