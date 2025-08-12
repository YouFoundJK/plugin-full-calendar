import { rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import { TFile, TFolder, normalizePath } from 'obsidian';

import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { constructTitle, enhanceEvent, parseTitle } from '../../utils/categoryParser';
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

    let event = enhanceEvent(rawEvent, this.plugin.settings);
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

    const titleToWrite = this.plugin.settings.enableAdvancedCategorization
      ? constructTitle(eventToWrite.category, eventToWrite.subCategory, eventToWrite.title)
      : eventToWrite.title;

    const eventWithFullTitle = { ...eventToWrite, title: titleToWrite };
    delete (eventWithFullTitle as Partial<OFCEvent>).category;
    delete (eventWithFullTitle as Partial<OFCEvent>).subCategory;

    const path = normalizePath(
      `${config.directory}/${filenameForEvent(eventToWrite, this.plugin.settings)}`
    );
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }

    const newPage = replaceFrontmatter('', newFrontmatter(eventWithFullTitle));
    const file = await this.app.create(path, newPage);
    return [event, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent, // <-- ADD THIS PARAMETER (it will be unused)
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

    const titleToWrite = this.plugin.settings.enableAdvancedCategorization
      ? constructTitle(eventToWrite.category, eventToWrite.subCategory, eventToWrite.title)
      : eventToWrite.title;

    const eventWithFullTitle = { ...eventToWrite, title: titleToWrite };
    delete (eventWithFullTitle as Partial<OFCEvent>).category;
    delete (eventWithFullTitle as Partial<OFCEvent>).subCategory;

    const newPath = normalizePath(
      `${config.directory}/${filenameForEvent(eventToWrite, this.plugin.settings)}`
    );
    if (file.path !== newPath) {
      await this.app.rename(file, newPath);
    }

    await this.app.rewrite(file, page => modifyFrontmatterString(page, eventWithFullTitle));
    return { file: { path: newPath }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle, config: FullNoteProviderConfig): Promise<void> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.app.delete(file);
  }

  async bulkAddCategories(
    getCategory: (event: OFCEvent, location: EventLocation) => string | undefined,
    force: boolean,
    config: FullNoteProviderConfig
  ): Promise<void> {
    const allFiles = await (async () => {
      const eventFolder = this.app.getAbstractFileByPath(config.directory);
      if (!(eventFolder instanceof TFolder)) return [];
      // This needs a recursive walk, which was missing in the legacy class too. Correcting it here.
      const files: TFile[] = [];
      const walk = async (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile) {
            files.push(child);
          } else if (child instanceof TFolder) {
            await walk(child);
          }
        }
      };
      await walk(eventFolder);
      return files;
    })();

    const processor = async (file: TFile) => {
      await this.plugin.app.fileManager.processFrontMatter(file, frontmatter => {
        const event = validateEvent(frontmatter);
        if (!event || !event.title) return;

        const { category: existingCategory, title: cleanTitle } = parseTitle(event.title);
        if (existingCategory && !force) return;

        const newCategory = getCategory(event, { file, lineNumber: undefined });
        if (!newCategory) return;

        const titleToCategorize = force ? event.title : cleanTitle;
        frontmatter.title = constructTitle(newCategory, undefined, titleToCategorize);
      });
    };

    await this.plugin.nonBlockingProcess(
      allFiles,
      processor,
      `Categorizing notes in ${config.directory}`
    );
  }

  async bulkRemoveCategories(
    knownCategories: Set<string>,
    config: FullNoteProviderConfig
  ): Promise<void> {
    const categoriesToRemove = new Set(knownCategories);
    const dir = config.directory.split('/').pop();
    if (dir) categoriesToRemove.add(dir);

    const allFiles = await (async () => {
      const eventFolder = this.app.getAbstractFileByPath(config.directory);
      if (!(eventFolder instanceof TFolder)) return [];
      const files: TFile[] = [];
      const walk = async (folder: TFolder) => {
        for (const child of folder.children) {
          if (child instanceof TFile) {
            files.push(child);
          } else if (child instanceof TFolder) {
            await walk(child);
          }
        }
      };
      await walk(eventFolder);
      return files;
    })();

    const processor = async (file: TFile) => {
      await this.plugin.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;
        const { category, title: cleanTitle } = parseTitle(frontmatter.title);
        if (category && categoriesToRemove.has(category)) {
          frontmatter.title = cleanTitle;
        }
      });
    };
    await this.plugin.nonBlockingProcess(
      allFiles,
      processor,
      `De-categorizing notes in ${config.directory}`
    );
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
