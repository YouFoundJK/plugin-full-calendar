import { rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import { TFile, TFolder, normalizePath } from 'obsidian';

import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { constructTitle } from '../../utils/categoryParser';
import { newFrontmatter, modifyFrontmatterString, replaceFrontmatter } from './frontmatter';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { FullNoteProviderConfig } from './typesLocal';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { FullNoteConfigComponent } from './FullNoteConfigComponent';
import { convertEvent } from '../../utils/Timezone';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

// Helper Functions (ported from FullNoteCalendar.ts)
// =================================================================================================

function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const basenameFromEvent = (event: OFCEvent, settings: any): string => {
  const fullTitle = settings.enableAdvancedCategorization
    ? constructTitle(event.category, event.subCategory, event.title)
    : event.title;
  const sanitizedTitle = sanitizeTitleForFilename(fullTitle);
  switch (event.type) {
    case undefined:
    case 'single':
      return `${event.date} ${sanitizedTitle}`;
    case 'recurring': {
      if (event.daysOfWeek && event.daysOfWeek.length > 0) {
        return `(Every ${event.daysOfWeek.join(',')}) ${sanitizedTitle}`;
      }
      if (event.month && event.dayOfMonth) {
        const monthName = DateTime.fromObject({ month: event.month }).toFormat('MMM');
        return `(Every year on ${monthName} ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      if (event.dayOfMonth) {
        return `(Every month on the ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      return `(Recurring) ${sanitizedTitle}`;
    }
    case 'rrule':
      return `(${rrulestr(event.rrule).toText()}) ${sanitizedTitle}`;
  }
};

const filenameForEvent = (event: OFCEvent, settings: any) =>
  `${basenameFromEvent(event, settings)}.md`;

// Provider Implementation
// =================================================================================================

export class FullNoteProvider implements CalendarProvider<FullNoteProviderConfig> {
  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;

  readonly type = 'local';
  readonly displayName = 'Local Notes';
  readonly isRemote = false;

  constructor(app: ObsidianInterface, plugin: FullCalendarPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent, config: FullNoteProviderConfig): EventHandle | null {
    const filename = filenameForEvent(event, this.plugin.settings);
    const path = normalizePath(`${config.directory}/${filename}`);
    return { persistentId: path };
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    // <-- CHANGED FROM private TO public
    const metadata = this.app.getMetadata(file);
    if (!metadata?.frontmatter) {
      return [];
    }

    const rawEventData: any = {
      ...metadata.frontmatter,
      title: metadata.frontmatter.title || file.basename
    };

    const rawEvent = validateEvent(rawEventData);
    if (!rawEvent) {
      return [];
    }

    let event = rawEvent; // use raw event; no enhancement here
    const displayTimezone = this.plugin.settings.displayTimezone;

    if (event.timezone && displayTimezone && event.timezone !== displayTimezone) {
      event = convertEvent(event, event.timezone, displayTimezone);
    }

    return [[event, { file, lineNumber: undefined }]];
  }

  async getEvents(config: FullNoteProviderConfig): Promise<EditableEventResponse[]> {
    const eventFolder = this.app.getAbstractFileByPath(config.directory);
    if (!eventFolder || !(eventFolder instanceof TFolder)) {
      throw new Error(`${config.directory} is not a valid directory.`);
    }

    const events: EditableEventResponse[] = [];
    for (const file of eventFolder.children) {
      if (file instanceof TFile) {
        const results = await this.getEventsInFile(file);
        events.push(...results);
      }
    }
    return events;
  }

  async createEvent(
    event: OFCEvent,
    config: FullNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation]> {
    let eventToWrite = { ...event };
    const displayTimezone =
      this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!eventToWrite.timezone) {
      eventToWrite.timezone = displayTimezone;
    }
    if (eventToWrite.timezone !== displayTimezone) {
      eventToWrite = convertEvent(event, displayTimezone, eventToWrite.timezone);
    }

    // Deleted title reconstruction and category field stripping

    const path = normalizePath(
      `${config.directory}/${filenameForEvent(eventToWrite, this.plugin.settings)}`
    );
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }

    const newPage = replaceFrontmatter('', newFrontmatter(eventToWrite)); // write as-is
    const file = await this.app.create(path, newPage);
    return [event, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent,
    config: FullNoteProviderConfig
  ): Promise<EventLocation | null> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }

    const fileMetadata = this.app.getMetadata(file);
    const fileEvent = validateEvent(fileMetadata?.frontmatter);
    const displayTimezone =
      this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fileTimezone = fileEvent?.timezone || displayTimezone;

    let eventToWrite = newEventData;
    if (fileTimezone !== displayTimezone) {
      eventToWrite = convertEvent(newEventData, displayTimezone, fileTimezone);
    }
    eventToWrite.timezone = fileTimezone;

    // Deleted title reconstruction and category field stripping

    const newPath = normalizePath(
      `${config.directory}/${filenameForEvent(eventToWrite, this.plugin.settings)}`
    );
    if (file.path !== newPath) {
      await this.app.rename(file, newPath);
    }

    await this.app.rewrite(file, page => modifyFrontmatterString(page, eventToWrite)); // write as-is
    return { file: { path: newPath }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle, config: FullNoteProviderConfig): Promise<void> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    console.log(`[3] FullNoteProvider.deleteEvent -> Deleting file at path: ${path}`); // ADD THIS
    return this.app.delete(file);
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent,
    config: FullNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation | null]> {
    const masterLocalId = this.getEventHandle(masterEvent, config)?.persistentId;
    if (!masterLocalId) {
      throw new Error('Could not get persistent ID for master event.');
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterLocalId
    };

    // Use the existing createEvent logic to handle file creation and timezone conversion
    return this.createEvent(overrideEventData, config);
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return FullNoteConfigComponent;
  }
}
