/**
 * @file TasksPluginProvider.ts
 * @brief Provider for Obsidian Tasks plugin integration
 * 
 * @description
 * Integrates with the Obsidian Tasks plugin to provide calendar events from
 * task items with due dates. Implements efficient single-pass vault scanning
 * and caching for both dated and undated tasks.
 * 
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';
import { DateTime } from 'luxon';

import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksPluginProviderConfig, ParsedDatedTask, ParsedUndatedTask } from './typesTask';
import { TasksParser } from './TasksParser';
import { TasksConfigComponent } from './TasksConfigComponent';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';

export class TasksPluginProvider implements CalendarProvider<TasksPluginProviderConfig> {
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  public readonly type = 'tasks';
  public readonly displayName = 'Obsidian Tasks';
  public readonly isRemote = false;

  private plugin: FullCalendarPlugin;
  private app: ObsidianInterface;
  private source: TasksPluginProviderConfig;
  private parser: TasksParser;

  // Caching system for single-pass scanning
  private _datedTasks: [OFCEvent, EventLocation | null][] | null = null;
  private _undatedTasks: ParsedUndatedTask[] | null = null;

  constructor(
    source: TasksPluginProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    if (!app) {
      throw new Error('TasksPluginProvider requires an Obsidian app interface.');
    }
    this.plugin = plugin;
    this.app = app;
    this.source = source;
    this.parser = new TasksParser();
  }

  getCapabilities(): CalendarProviderCapabilities {
    // Start with read-only capabilities for Step 1
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Use the uid property which should contain filePath::lineNumber
    if (!event.uid) {
      return null;
    }

    const parts = event.uid.split('::');
    if (parts.length < 2) {
      return null;
    }

    return {
      persistentId: event.uid
    };
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    await this._scanVaultForTasks();
    return this._datedTasks || [];
  }

  async getEventsInFile(file: TFile): Promise<[OFCEvent, EventLocation | null][]> {
    await this._scanVaultForTasks();
    
    if (!this._datedTasks) {
      return [];
    }

    // Filter events for this specific file
    return this._datedTasks.filter(([event]) => {
      if (!event.uid) return false;
      const filePath = event.uid.split('::')[0];
      return filePath === file.path;
    });
  }

  /**
   * Single-pass vault scanning method that populates both caches
   */
  private async _scanVaultForTasks(): Promise<void> {
    // Return immediately if cache is already populated
    if (this._datedTasks !== null) {
      return;
    }

    const datedTasks: [OFCEvent, EventLocation | null][] = [];
    const undatedTasks: ParsedUndatedTask[] = [];

    // Get all markdown files in the vault
    const markdownFiles = this.plugin.app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
      try {
        const content = await this.app.read(file);
        const lines = content.split('\n');

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
          const line = lines[lineNumber];
          const parseResult = this.parser.parseLine(line, file.path, lineNumber);

          if (parseResult.type === 'dated') {
            const ofcEvent = this._parsedTaskToOFCEvent(parseResult.task);
            if (ofcEvent) {
              datedTasks.push([ofcEvent, null]);
            }
          } else if (parseResult.type === 'undated') {
            undatedTasks.push(parseResult.task);
          }
        }
      } catch (error) {
        console.error(`Failed to read file ${file.path}:`, error);
      }
    }

    // Populate the caches
    this._datedTasks = datedTasks;
    this._undatedTasks = undatedTasks;
  }

  /**
   * Converts a parsed dated task to an OFCEvent
   */
  private _parsedTaskToOFCEvent(task: ParsedDatedTask): OFCEvent | null {
    try {
      const taskContent = this.parser.getTaskContentWithoutDate(task.content);
      const date = DateTime.fromISO(task.date);
      
      if (!date.isValid) {
        return null;
      }

      let event: OFCEvent;

      if (task.time) {
        // Timed event
        event = {
          type: 'single',
          uid: `${task.filePath}::${task.lineNumber}`,
          title: taskContent,
          date: task.date,
          endDate: null,
          allDay: false,
          startTime: task.time,
          endTime: task.time // Tasks typically don't have duration
        };
      } else {
        // All-day event
        event = {
          type: 'single',
          uid: `${task.filePath}::${task.lineNumber}`,
          title: taskContent,
          date: task.date,
          endDate: null,
          allDay: true
        };
      }

      // Add completion status if it's a boolean
      if (typeof task.completed === 'boolean') {
        (event as any).completed = task.completed ? DateTime.now().toISO() : false;
      }

      return event;
    } catch (error) {
      console.error('Error converting parsed task to OFCEvent:', error);
      return null;
    }
  }

  /**
   * Invalidates the cache, triggering a re-scan on next data request
   */
  private _invalidateCache(): void {
    this._datedTasks = null;
    this._undatedTasks = null;
  }

  /**
   * Returns undated tasks for the backlog view (will be implemented in Step 3)
   */
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._scanVaultForTasks();
    return this._undatedTasks || [];
  }

  /**
   * File update handler - invalidates cache
   */
  public handleFileUpdate(file: TFile): void {
    this._invalidateCache();
  }

  /**
   * File delete handler - invalidates cache
   */
  public handleFileDelete(filePath: string): void {
    this._invalidateCache();
  }

  // Required methods for CalendarProvider interface (will be implemented in Step 2)

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Tasks provider create functionality not yet implemented');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('Tasks provider update functionality not yet implemented');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('Tasks provider delete functionality not yet implemented');
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Tasks provider instance override not supported');
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }
}