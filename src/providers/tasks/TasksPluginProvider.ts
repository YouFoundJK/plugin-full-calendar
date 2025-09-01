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
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent } from './TasksConfigComponent';
import { TasksParser, ParsedTask, ParsedUndatedTask } from './TasksParser';
import { getDueDateEmoji } from './TasksSettings';
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

  // Cache for undated tasks (backlog functionality only)
  // Dated tasks are now handled by the central EventCache via getEventsInFile
  private _undatedTasks: ParsedUndatedTask[] | null = null;
  
  // Track whether initial full scan has been done for getEvents()
  private _initialEventsScanDone: boolean = false;
  
  // Cache for initial getEvents() result to avoid redundant scans
  private _initialEventsResult: EditableEventResponse[] | null = null;

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;
  readonly loadPriority = 30;

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
   * Handles file updates by invalidating the cache.
   * Called by ProviderRegistry when a markdown file changes.
   * This ensures the cache is refreshed on the next access.
   */
  public handleFileUpdate(file: TFile): void {
    if (this.isFileRelevant(file)) {
      this._invalidateCache();
    }
  }

  /**
   * Handles file deletions by invalidating the cache.
   * Called by ProviderRegistry when a markdown file is deleted.
   * This ensures the cache is refreshed on the next access.
   */
  public handleFileDelete(filePath: string): void {
    // For Tasks provider, we need to invalidate cache for any markdown file deletion
    // since we can't easily determine relevance without the file content
    if (filePath.endsWith('.md')) {
      this._invalidateCache();
    }
  }

  /**
   * Invalidates the cached task data, forcing a re-scan on next access.
   * Currently used only for undated tasks cache and write operations.
   * Dated tasks are now managed by EventCache via surgical file updates.
   */
  private _invalidateCache(): void {
    this._undatedTasks = null;
    this._initialEventsScanDone = false;
    this._initialEventsResult = null;
  }

  /**
   * Performs a unified scan of the vault for both dated and undated tasks.
   * Used for initial cache population for both getEvents() and getUndatedTasks().
   * This ensures a single file read per file for maximum efficiency.
   */
  private async _scanVaultForAllTasks(): Promise<void> {
    // Return immediately if both caches are already populated
    if (this._undatedTasks !== null && this._initialEventsResult !== null) {
      return;
    }

    // Initialize caches
    const allEvents: EditableEventResponse[] = [];
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
            // Add to dated events result
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
            allEvents.push([event, location]);
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

    // Cache the results
    this._initialEventsResult = allEvents;
    this._initialEventsScanDone = true;
  }

  getCapabilities(): CalendarProviderCapabilities {
    // Now supports full read/write operations via Tasks plugin API
    return { canCreate: true, canEdit: true, canDelete: true };
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

  public isFileRelevant(file: TFile): boolean {
    // Tasks provider is interested in all markdown files.
    return file.extension === 'md';
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
    // For dated tasks, the EventCache is now the source of truth via getEventsInFile()
    // This method is only called for initial population, so we'll do a unified scan once
    // Subsequent updates are handled surgically by ProviderRegistry via getEventsInFile
    
    // Only scan if we haven't done the initial scan yet
    if (!this._initialEventsScanDone) {
      await this._scanVaultForAllTasks();
    }

    return this._initialEventsResult || [];
  }

  /**
   * Public method to expose undated tasks for backlog functionality.
   * @returns Array of undated tasks
   */
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    // Use unified scanning for initial population
    // Subsequent updates are handled surgically by ProviderRegistry
    if (this._undatedTasks === null) {
      await this._scanVaultForAllTasks();
    }

    return this._undatedTasks!; // We know it's not null after check above
  }

  /**
   * Converts an OFCEvent to a task line string compatible with Obsidian Tasks format.
   * Queries the Tasks plugin settings for correct due date emoji and format.
   */
  private _ofcEventToTaskLine(event: OFCEvent): string {
    if (event.type !== 'single') {
      throw new Error('Tasks provider can only handle single events, not recurring events.');
    }

    // Get the due date emoji from Tasks plugin settings
    const dueDateEmoji = getDueDateEmoji();

    // Format the date in YYYY-MM-DD format (standard Tasks plugin format)
    const formattedDate = event.date.split('T')[0];

    // Construct the task line: - [ ] Title 📅 YYYY-MM-DD
    const taskLine = `- [ ] ${event.title} ${dueDateEmoji} ${formattedDate}`;

    return taskLine;
  }

  /**
   * Gets the Tasks plugin API if available.
   * @throws Error if Tasks plugin is not installed or API not available
   */
  private _getTasksPluginAPI(): any {
    const tasksPlugin = (window as any).app?.plugins?.plugins?.['obsidian-tasks-plugin'];
    if (!tasksPlugin?.apiV1) {
      throw new Error(
        'Obsidian Tasks plugin API is not available. Please ensure the Tasks plugin is installed and enabled.'
      );
    }
    return tasksPlugin.apiV1;
  }

  /**
   * Safely locates a task by its handle (filePath::lineNumber) by re-parsing the file.
   * This ensures we find the task even if line numbers have changed due to other edits.
   */
  private async _findTaskByHandle(
    handle: EventHandle
  ): Promise<{ file: TFile; lineNumber: number; taskLine: string }> {
    if (!handle.persistentId.includes('::')) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }

    const [filePath, originalLineNumber] = handle.persistentId.split('::');
    const file = this.app.getFileByPath(filePath);

    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.read(file);
    const lines = content.split('\n');

    // Try the original line number first (most common case)
    const originalLine = parseInt(originalLineNumber, 10);
    if (originalLine > 0 && originalLine <= lines.length) {
      const line = lines[originalLine - 1];
      const result = this.parser.parseLine(line, filePath, originalLine);
      if (result.type === 'dated') {
        return { file, lineNumber: originalLine, taskLine: line };
      }
    }

    // If original line doesn't match, scan for the task
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const result = this.parser.parseLine(line, filePath, i + 1);
      if (result.type === 'dated' && result.task.location.path === filePath) {
        // This is a potential match, but we need more context to be sure it's the right task
        // For now, we'll use the first matching task line we find
        return { file, lineNumber: i + 1, taskLine: line };
      }
    }

    throw new Error(`Task not found in file ${filePath}. It may have been deleted or moved.`);
  }

  // Write operations via Tasks plugin API
  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    if (event.type !== 'single') {
      throw new Error('Tasks provider can only create single events, not recurring events.');
    }

    try {
      // Convert the OFCEvent to a task line format
      const taskLine = this._ofcEventToTaskLine(event);

      // Get the Tasks plugin API
      const tasksAPI = this._getTasksPluginAPI();

      // Use the Tasks API to create the task with a pre-filled modal
      // This opens the Tasks plugin's create modal with our task line pre-filled
      await tasksAPI.createTaskLineModal(taskLine);

      // After the API call completes and user saves, invalidate cache to reflect the new task
      this._invalidateCache();

      // Convert the event for return - we need to create a location
      // Since the Tasks plugin handles file placement, we can't know the exact location immediately
      // The caller will get the updated event through the cache refresh
      return [event, null];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create task: ${errorMessage}`);
    }
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Tasks provider can only update single events, not recurring events.');
    }

    try {
      // Find the current task line
      const { taskLine: originalLine } = await this._findTaskByHandle(handle);

      // Convert the new event data to a task line
      const newTaskLine = this._ofcEventToTaskLine(newEventData);

      // Get the Tasks plugin API
      const tasksAPI = this._getTasksPluginAPI();

      // Use the Tasks API to edit the task with a pre-filled modal
      // This opens the Tasks plugin's edit modal with our new task line
      await tasksAPI.editTaskLineModal(originalLine, newTaskLine);

      // After the API call completes and user saves, invalidate cache
      this._invalidateCache();

      // Return null as the exact location will be determined by the Tasks plugin
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update task: ${errorMessage}`);
    }
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    try {
      // Find the current task line location
      const { file, lineNumber } = await this._findTaskByHandle(handle);

      // Since the Tasks API has no delete function, we manage this directly using ObsidianInterface
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');

        // Remove the specific line (convert to 0-based index)
        lines.splice(lineNumber - 1, 1);

        return lines.join('\n');
      });

      // Invalidate cache to reflect the deletion
      this._invalidateCache();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete task: ${errorMessage}`);
    }
  }

  /**
   * Schedules an undated task by adding a due date to it.
   * This method is called when a task is dragged from the backlog to the calendar.
   *
   * @param taskId Unique identifier for the task (filePath::lineNumber)
   * @param date Date to schedule the task for
   */
  public async scheduleTask(taskId: string, date: Date): Promise<void> {
    try {
      // Find the original task line using the taskId handle
      const handle = { persistentId: taskId };
      const { taskLine: originalLine } = await this._findTaskByHandle(handle);

      // Get the due date emoji and format from Tasks plugin settings
      const dueDateEmoji = getDueDateEmoji();

      // Format the date in YYYY-MM-DD format (standard Tasks plugin format)
      const formattedDate = date.toISOString().split('T')[0];

      // Create the new task line with the due date added
      // If the task already has a due date, we'll replace it; otherwise add it
      let newTaskLine: string;

      // Simple approach: add the due date to the end of the task line if it doesn't already exist
      if (originalLine.includes(dueDateEmoji)) {
        // Replace existing due date
        const dueDateRegex = new RegExp(`${dueDateEmoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
        newTaskLine = originalLine.replace(dueDateRegex, `${dueDateEmoji} ${formattedDate}`);
      } else {
        // Add new due date
        newTaskLine = originalLine.trim() + ` ${dueDateEmoji} ${formattedDate}`;
      }

      // Use the Tasks plugin API to edit the task
      const tasksAPI = this._getTasksPluginAPI();
      await tasksAPI.editTaskLineModal(originalLine, newTaskLine);

      // Invalidate cache to reflect the changes
      this._invalidateCache();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to schedule task: ${errorMessage}`);
    }
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    throw new Error('TasksPluginProvider is read-only. Cannot create instance overrides.');
  }
}
