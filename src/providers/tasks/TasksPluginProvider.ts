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
    return { canCreate: true, canEdit: true, canDelete: true };
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
   * Gets the Tasks plugin instance if available
   */
  private getTasksPlugin(): any | null {
    const tasksPlugin = (this.plugin.app as any).plugins?.plugins?.['obsidian-tasks-plugin'];
    if (!tasksPlugin || !tasksPlugin.apiV1) {
      console.error('Tasks plugin not found or API not available');
      return null;
    }
    return tasksPlugin;
  }

  /**
   * Converts an OFCEvent to a task line string using Tasks plugin settings
   */
  private _ofcEventToTaskLine(event: OFCEvent): string {
    const tasksPlugin = this.getTasksPlugin();
    if (!tasksPlugin) {
      // Fallback to default format if Tasks plugin not available
      const dateStr = (event as any).date;
      return `- [ ] ${event.title} 📅 ${dateStr}`;
    }

    // Query Tasks plugin settings for date format and emoji
    // Note: This might need to be adjusted based on actual Tasks plugin API structure
    const settings = tasksPlugin.settings || {};
    const dueDateEmoji = settings.dueDateEmoji || '📅';
    
    let taskLine = `- [ ] ${event.title}`;
    
    // Add due date if present
    if ((event as any).date) {
      const dateStr = (event as any).date;
      taskLine += ` ${dueDateEmoji} ${dateStr}`;
      
      // Add time if present
      if ((event as any).startTime) {
        taskLine += ` ${(event as any).startTime}`;
      }
    }
    
    return taskLine;
  }

  /**
   * Safely finds a task line in a file using the persistent ID
   */
  private async _findTaskLine(handle: EventHandle): Promise<{
    file: any;
    lineNumber: number;
    originalLine: string;
  } | null> {
    const parts = handle.persistentId.split('::');
    if (parts.length < 2) {
      return null;
    }

    const [filePath, lineNumberStr] = parts;
    const lineNumber = parseInt(lineNumberStr, 10);
    
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      return null;
    }

    try {
      const content = await this.app.read(file as any);
      const lines = content.split('\n');
      
      if (lineNumber >= 0 && lineNumber < lines.length) {
        return {
          file,
          lineNumber,
          originalLine: lines[lineNumber]
        };
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }

    return null;
  }

  /**
   * Returns undated tasks for the backlog view (will be implemented in Step 3)
   */
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._scanVaultForTasks();
    return this._undatedTasks || [];
  }

  /**
   * Schedules an undated task by adding a due date to it
   */
  public async scheduleTask(taskId: string, date: Date): Promise<void> {
    const tasksPlugin = this.getTasksPlugin();
    if (!tasksPlugin) {
      throw new Error('Tasks plugin is not available. Please ensure the Obsidian Tasks plugin is installed and enabled.');
    }

    try {
      // Find the current task line
      const parts = taskId.split('::');
      if (parts.length < 2) {
        throw new Error(`Invalid task ID format: ${taskId}`);
      }

      const [filePath, lineNumberStr] = parts;
      const lineNumber = parseInt(lineNumberStr, 10);
      
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await this.app.read(file as any);
      const lines = content.split('\n');
      
      if (lineNumber >= 0 && lineNumber < lines.length) {
        const originalLine = lines[lineNumber];
        
        // Parse the task to get the clean content
        const parseResult = this.parser.parseLine(originalLine, filePath, lineNumber);
        if (parseResult.type === 'none') {
          throw new Error('Line is not a valid task');
        }

        // Get the task content without any existing due date
        const taskContent = this.parser.getTaskContentWithoutDate(parseResult.task.content);
        
        // Query Tasks plugin settings for date format and emoji
        const settings = tasksPlugin.settings || {};
        const dueDateEmoji = settings.dueDateEmoji || '📅';
        
        // Format the date (YYYY-MM-DD format)
        const formattedDate = date.toISOString().split('T')[0];
        
        // Create the new task line with due date
        const completionChar = parseResult.type === 'undated' && parseResult.task.completed === true ? 'x' : 
                              parseResult.type === 'undated' && parseResult.task.completed === 'cancelled' ? '-' : ' ';
        const newTaskLine = `- [${completionChar}] ${taskContent} ${dueDateEmoji} ${formattedDate}`;
        
        // Call the Tasks API to edit the task
        await tasksPlugin.apiV1.editTaskLineModal(originalLine, newTaskLine);
        
        // Invalidate cache to trigger re-scan
        this._invalidateCache();
      } else {
        throw new Error(`Invalid line number: ${lineNumber}`);
      }
    } catch (error) {
      console.error('Error scheduling task via Tasks plugin:', error);
      throw new Error(`Failed to schedule task: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    if (event.type !== 'single') {
      throw new Error('Tasks provider can only create single events.');
    }

    const tasksPlugin = this.getTasksPlugin();
    if (!tasksPlugin) {
      throw new Error('Tasks plugin is not available. Please ensure the Obsidian Tasks plugin is installed and enabled.');
    }

    try {
      // Convert OFCEvent to task line format
      const prefilledTaskLine = this._ofcEventToTaskLine(event);
      
      // Call the Tasks API to open the creation modal
      // The user will confirm and the Tasks plugin handles the file write
      await tasksPlugin.apiV1.createTaskLineModal(prefilledTaskLine);
      
      // Invalidate cache to trigger re-scan
      this._invalidateCache();
      
      // Return the event as-is since Tasks plugin handles the actual creation
      return [event, null];
    } catch (error) {
      console.error('Error creating task via Tasks plugin:', error);
      throw new Error(`Failed to create task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const tasksPlugin = this.getTasksPlugin();
    if (!tasksPlugin) {
      throw new Error('Tasks plugin is not available. Please ensure the Obsidian Tasks plugin is installed and enabled.');
    }

    try {
      // Find the current task line
      const taskInfo = await this._findTaskLine(handle);
      if (!taskInfo) {
        throw new Error(`Could not find task with handle ${handle.persistentId}`);
      }

      const { originalLine } = taskInfo;
      
      // Convert new event to task line format
      const newTaskLine = this._ofcEventToTaskLine(newEventData);
      
      // Call the Tasks API to open the edit modal
      await tasksPlugin.apiV1.editTaskLineModal(originalLine, newTaskLine);
      
      // Invalidate cache to trigger re-scan
      this._invalidateCache();
      
      return null;
    } catch (error) {
      console.error('Error updating task via Tasks plugin:', error);
      throw new Error(`Failed to update task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    try {
      // Find the task line to delete
      const taskInfo = await this._findTaskLine(handle);
      if (!taskInfo) {
        throw new Error(`Could not find task with handle ${handle.persistentId}`);
      }

      const { file, lineNumber } = taskInfo;
      
      // Delete the line directly since Tasks plugin has no delete API
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');
        lines.splice(lineNumber, 1); // Remove the specific line
        return lines.join('\n');
      });
      
      // Invalidate cache to trigger re-scan
      this._invalidateCache();
    } catch (error) {
      console.error('Error deleting task:', error);
      throw new Error(`Failed to delete task: ${error instanceof Error ? error.message : String(error)}`);
    }
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