import { rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import { TFile, TFolder, normalizePath } from 'obsidian';

import { OFCEvent, EventLocation } from '../../types';
import FullCalendarPlugin from '../../main';
import { constructTitle } from '../../calendars/parsing/categoryParser';
import {
  newFrontmatter,
  modifyFrontmatterString,
  replaceFrontmatter
} from '../../calendars/frontmatter';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { FullNoteProviderConfig } from './typesLocal';

function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const filenameForEvent = (event: OFCEvent, settings: any) =>
  `${sanitizeTitleForFilename(event.title)}.md`;

export class FullNoteProvider implements CalendarProvider<FullNoteProviderConfig> {
  private app: any;
  private plugin: FullCalendarPlugin;

  readonly type = 'local';
  readonly displayName = 'Local Notes';

  constructor(app: any, plugin: FullCalendarPlugin) {
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

  async getEvents(config: FullNoteProviderConfig): Promise<[OFCEvent, EventLocation | null][]> {
    const eventFolder = this.app.getAbstractFileByPath(config.directory);
    if (!eventFolder || !(eventFolder instanceof TFolder)) {
      throw new Error(`${config.directory} is not a valid directory.`);
    }
    const events: [OFCEvent, EventLocation | null][] = [];
    for (const file of eventFolder.children) {
      if (file instanceof TFile) {
        // Logic to parse events from files goes here.
      }
    }
    return events;
  }

  async createEvent(
    event: OFCEvent,
    config: FullNoteProviderConfig
  ): Promise<[OFCEvent, EventLocation]> {
    const path = normalizePath(
      `${config.directory}/${filenameForEvent(event, this.plugin.settings)}`
    );
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }
    const newPage = replaceFrontmatter('', newFrontmatter(event));
    const file = await this.app.create(path, newPage);
    return [event, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    newEventData: OFCEvent,
    config: FullNoteProviderConfig
  ): Promise<EventLocation | null> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    const newPath = normalizePath(
      `${config.directory}/${filenameForEvent(newEventData, this.plugin.settings)}`
    );
    if (file.path !== newPath) {
      await this.app.rename(file, newPath);
    }
    // Explicitly type the rewrite callback parameter
    await this.app.rewrite(file, (page: string) => modifyFrontmatterString(page, newEventData));
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

  getConfigurationComponent(): FCReactComponent<any> {
    return () => null;
  }
}
