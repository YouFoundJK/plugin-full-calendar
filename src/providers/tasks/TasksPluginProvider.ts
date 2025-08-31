/**
 * @file TasksPluginProvider.ts
 * @brief Obsidian Tasks integration as a read-only calendar source.
 *
 * @description
 * This provider integrates with the Obsidian Tasks plugin to display tasks
 * with due dates on the Full Calendar. It is read-only to prevent accidental
 * modification of task data through the calendar interface.
 *
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';
import { DateTime } from 'luxon';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent } from './TasksConfigComponent';
import { TasksParser, ParsedTask, ParsedUndatedTask } from './TasksParser';
import React from 'react';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

export class TasksPluginProvider implements CalendarProvider<TasksProviderConfig> {
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: TasksProviderConfig;
  private parser: TasksParser;

  // Caching properties for single-pass scan
  private _datedTasks: [OFCEvent, EventLocation | null][] | null = null;
  private _undatedTasks: ParsedUndatedTask[] | null = null;

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;

  constructor(source: TasksProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('TasksPluginProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
    this.parser = new TasksParser();

    // Set up file watchers for cache invalidation
    this.setupFileWatchers();
  }

  /**
   * Sets up file watchers to invalidate cache when files change.
   */
  private setupFileWatchers(): void {
    // Note: In a real implementation, we'd want to set up proper file watchers
    // For now, we'll rely on the existing file watching infrastructure
    // and expose methods that can be called when files change
  }

  /**
   * Invalidates the cached task data, forcing a re-scan on next access.
   */
  private _invalidateCache(): void {
    this._datedTasks = null;
    this._undatedTasks = null;
  }

  /**
   * Performs a single-pass scan of the vault for both dated and undated tasks.
   * Uses caching to avoid redundant scans.
   */
  private async _scanVaultForTasks(): Promise<void> {
    // Return immediately if cache is already populated
    if (this._datedTasks !== null) {
      return;
    }

    // Initialize caches
    this._datedTasks = [];
    this._undatedTasks = [];

    // Scan all markdown files in the vault
    const markdownFiles = this.plugin.app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
      try {
        const content = await this.app.read(file);
        const lines = content.split('\n');

        // Parse each line
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
          const result = this.parser.parseLine(lines[lineNumber], file.path, lineNumber + 1);

          if (result.type === 'dated') {
            // Convert to OFCEvent and add to dated tasks cache
            const event = this.parseTaskToOFCEvent({
              title: result.task.title,
              date: result.task.date,
              isDone: result.task.isDone,
              location: result.task.location
            });
            const location: EventLocation = {
              file: { path: file.path },
              lineNumber: result.task.location.lineNumber
            };
            this._datedTasks.push([event, location]);
          } else if (result.type === 'undated') {
            // Add to undated tasks cache
            this._undatedTasks.push(result.task);
          }
        }
      } catch (error) {
        console.warn(`Failed to scan file ${file.path} for tasks:`, error);
        // Continue with other files
      }
    }
  }

  getCapabilities(): CalendarProviderCapabilities {
    // This provider is strictly read-only
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    // Minimal row component: display provider display name (or configured custom name if available)
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
      // Some calendar types have a name property, others do not.
      const name = (source as any).name ?? this.displayName;
      return React.createElement(
        'div',
        { className: 'setting-item-control ofc-settings-row-tasks-provider' },
        React.createElement('input', {
          disabled: true,
          type: 'text',
          value: name,
          className: 'fc-setting-input'
        })
      );
    };
    return Row;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Create a unique identifier based on the file path and line number
    // The event must have metadata about its source location
    if (event.uid) {
      // Use the UID which should be in format "filepath::lineNumber"
      return { persistentId: event.uid };
    }
    return null;
  }

  /**
   * Converts a ParsedTask to an OFCEvent.
   */
  private parseTaskToOFCEvent(task: ParsedTask): OFCEvent {
    return {
      type: 'single',
      title: task.title,
      date: task.date.toFormat('yyyy-MM-dd'),
      allDay: true, // Tasks with due dates are typically all-day events
      endDate: null,
      timezone: undefined,
      uid: `${task.location.path}::${task.location.lineNumber}`, // Unique identifier
      completed: task.isDone ? task.date.toISO() : false // Use task completion as event completion
    };
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    try {
      const content = await this.app.read(file);
      const tasks = this.parser.parseFileContent(content, file.path);

      const events: EditableEventResponse[] = [];
      for (const task of tasks) {
        const event = this.parseTaskToOFCEvent(task);
        const location: EventLocation = {
          file: { path: file.path },
          lineNumber: task.location.lineNumber
        };
        events.push([event, location]);
      }

      return events;
    } catch (error) {
      console.warn(`Failed to parse tasks from file ${file.path}:`, error);
      return [];
    }
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    // Ensure cache is populated with single-pass scan
    await this._scanVaultForTasks();
    
    // Return cached dated tasks
    return this._datedTasks!; // We know it's not null after _scanVaultForTasks()
  }

  /**
   * Public method to expose undated tasks for future backlog functionality.
   * @returns Array of undated tasks
   */
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    // Ensure cache is populated
    await this._scanVaultForTasks();
    
    // Return cached undated tasks
    return this._undatedTasks!; // We know it's not null after _scanVaultForTasks()
  }

  /**
   * Public methods for cache invalidation (to be called by file watchers).
   */
  public handleFileUpdate(): void {
    this._invalidateCache();
  }

  public handleFileDelete(): void {
    this._invalidateCache();
  }

  // All CRUD operations are forbidden for this read-only provider
  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    throw new Error('TasksPluginProvider is read-only. Cannot create events.');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('TasksPluginProvider is read-only. Cannot update events.');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('TasksPluginProvider is read-only. Cannot delete events.');
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    throw new Error('TasksPluginProvider is read-only. Cannot create instance overrides.');
  }
}
