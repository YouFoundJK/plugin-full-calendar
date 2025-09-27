// src/providers/tasks/TasksPluginProvider.ts

/**
 * @file TasksPluginProvider.ts
 * @brief Obsidian Tasks integration as a calendar source.
 *
 * @description
 * This provider integrates with the Obsidian Tasks plugin by subscribing to its
 * cache. It displays tasks with due dates on the Full Calendar and supports
 * full CUD (Create, Update, Delete) operations by surgically modifying the
 * underlying markdown files.
 *
 * @license See LICENSE.md
 */

import { TFile, Notice } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent } from './TasksConfigComponent';
import React from 'react';
import { ParsedUndatedTask } from './typesTask';
const getDueDateEmoji = (): string => '📅';
const getStartDateEmoji = (): string => '🛫';

// This is our own internal, simplified interface for a task from the Tasks plugin's cache.
// It prevents the need to import anything from the Tasks plugin itself.
interface CalendarTask {
  id: string; // A unique ID created by us, e.g., "filePath::lineNumber"
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  scheduledDate: Date | null;
  originalMarkdown: string; // The full original line from the file.
  filePath: string;
  lineNumber: number; // 1-based line number.
  isDone: boolean;
}

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

  // Live array of all tasks from the Tasks plugin.
  private allTasks: CalendarTask[] = [];
  private isSubscribed = false;
  private isTasksCacheWarm = false;
  private tasksPromise: Promise<void> | null = null;

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
    // No parser instantiation needed anymore.
  }

  /**
   * On-demand cache warming: requests initial data from the Tasks plugin and waits for response.
   */
  private _ensureTasksCacheIsWarm(): Promise<void> {
    if (this.isTasksCacheWarm) {
      return Promise.resolve();
    }
    if (this.tasksPromise) {
      return this.tasksPromise;
    }
    this.tasksPromise = new Promise((resolve, reject) => {
      console.log('Full Calendar: Tasks cache is cold. Requesting data from Tasks plugin...');
      const callback = (cacheData: any) => {
        if (
          cacheData &&
          (cacheData.state === 'Warm' || cacheData.state?.name === 'Warm') &&
          cacheData.tasks
        ) {
          console.log(`Full Calendar: Received initial data with ${cacheData.tasks.length} tasks.`);
          this.allTasks = this.parseTasksForCalendar(cacheData.tasks);
          this.isTasksCacheWarm = true;
          this.tasksPromise = null;
          resolve();
        }
      };
      (this.plugin.app.workspace as any).trigger(
        'obsidian-tasks-plugin:request-cache-update',
        callback
      );
      setTimeout(() => {
        if (!this.isTasksCacheWarm) {
          console.error(
            "Full Calendar: Timed out waiting for Tasks plugin's cache. The Tasks plugin may not be enabled or may have failed to load."
          );
          this.tasksPromise = null;
          reject(new Error("Timed out waiting for Tasks plugin's cache."));
        }
      }, 5000);
    });
    return this.tasksPromise;
  }

  /**
   * Initializes the provider by subscribing to live updates from the Tasks plugin.
   * Only processes updates after initial cache warming.
   */
  public initialize(): void {
    if (this.isSubscribed) {
      return;
    }
    console.log('Full Calendar: Initializing Tasks event subscriber for live updates.');

    const handleLiveCacheUpdate = (cacheData: any) => {
      if (
        !this.isTasksCacheWarm ||
        !cacheData ||
        !(cacheData.state === 'Warm' || cacheData.state?.name === 'Warm') ||
        !cacheData.tasks
      ) {
        return;
      }
      console.log(`Full Calendar: Received live update with ${cacheData.tasks.length} tasks.`);
      this.allTasks = this.parseTasksForCalendar(cacheData.tasks);
      this.plugin.cache?.resync?.();
      this.plugin.providerRegistry.refreshBacklogViews();
    };

    (this.plugin.app.workspace as any).on(
      'obsidian-tasks-plugin:cache-update',
      handleLiveCacheUpdate
    );
    this.isSubscribed = true;
  }

  /**
   * Parses the raw task data from the Tasks plugin into our internal, simplified CalendarTask format.
   */
  private parseTasksForCalendar(tasks: any[]): CalendarTask[] {
    if (!tasks) return [];
    // DEBUG: Log the first raw task just before parsing, and the first parsed task after.
    if (tasks.length > 0) {
      console.log('[DEBUG] Tasks Provider: Input to parseTasksForCalendar (first task):', tasks[0]);
    }

    const calendarTasks = tasks.map(task => ({
      id: `${task.path}::${task.lineNumber}`,
      title: task.description,
      // The Tasks plugin provides moment.js objects; convert them to native JS Dates.
      startDate: task.startDate ? task.startDate.toDate() : null,
      dueDate: task.dueDate ? task.dueDate.toDate() : null,
      scheduledDate: task.scheduledDate ? task.scheduledDate.toDate() : null,
      originalMarkdown: task.originalMarkdown,
      filePath: task.path,
      lineNumber: task.lineNumber,
      isDone: task.isDone
    }));

    if (calendarTasks.length > 0) {
      console.log(
        '[DEBUG] Tasks Provider: Output of parseTasksForCalendar (first task):',
        calendarTasks[0]
      );
    }

    return calendarTasks;
  }

  // ====================================================================
  // DATA-SERVING METHODS (READ)
  // ====================================================================

  async getEvents(): Promise<EditableEventResponse[]> {
    await this._ensureTasksCacheIsWarm();
    const events: EditableEventResponse[] = [];
    // DEBUG: Log the first internal CalendarTask before it's converted to an OFCEvent.
    if (this.allTasks.length > 0) {
      console.log(
        '[DEBUG] Tasks Provider: Input to getEvents (first internal task):',
        this.allTasks[0]
      );
    }

    for (const task of this.allTasks) {
      // A task is only displayed on the calendar if it has some kind of date.
      const primaryDate = task.startDate || task.scheduledDate || task.dueDate;
      if (primaryDate) {
        const ofcEvent: OFCEvent = {
          type: 'single',
          title: task.title,
          allDay: true,
          // The primary date for an event is its start/scheduled date, falling back to due date.
          date: window.moment(primaryDate).format('YYYY-MM-DD'),
          // An event becomes multi-day only if it has a distinct due date after its primary date.
          endDate:
            task.dueDate && task.dueDate > primaryDate
              ? window.moment(task.dueDate).format('YYYY-MM-DD')
              : null,
          completed: task.isDone ? window.moment().toISOString() : false,
          uid: task.id // The UID is our persistent handle.
        };

        const location: EventLocation = {
          file: { path: task.filePath },
          lineNumber: task.lineNumber
        };
        events.push([ofcEvent, location]);
      }
    }

    // DEBUG: Log the first resulting OFCEvent.
    if (events.length > 0) {
      console.log('[DEBUG] Tasks Provider: Output of getEvents (first OFCEvent):', events[0][0]);
    }

    return events;
  }

  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._ensureTasksCacheIsWarm();
    return (
      this.allTasks
        // An undated task for the backlog has no dates and is not done.
        .filter(t => !t.startDate && !t.dueDate && !t.scheduledDate && !t.isDone)
        // Map to the format expected by the backlog view.
        .map(t => ({
          title: t.title,
          isDone: t.isDone,
          location: {
            path: t.filePath,
            lineNumber: t.lineNumber
          }
        }))
    );
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const events: EditableEventResponse[] = [];
    // Filter the live cache for tasks in the specified file. This is very fast.
    const tasksInFile = this.allTasks.filter(task => task.filePath === file.path);

    for (const task of tasksInFile) {
      const primaryDate = task.startDate || task.scheduledDate || task.dueDate;
      if (primaryDate) {
        const ofcEvent: OFCEvent = {
          type: 'single',
          title: task.title,
          allDay: true,
          date: window.moment(primaryDate).format('YYYY-MM-DD'),
          endDate:
            task.dueDate && task.dueDate > primaryDate
              ? window.moment(task.dueDate).format('YYYY-MM-DD')
              : null,
          completed: task.isDone ? window.moment().toISOString() : false,
          uid: task.id
        };

        const location: EventLocation = {
          file: { path: task.filePath },
          lineNumber: task.lineNumber
        };
        events.push([ofcEvent, location]);
      }
    }
    return events;
  }

  // ====================================================================
  // FILE-WRITING METHODS (CUD)
  // ====================================================================

  /**
   * Surgically replaces a line in a file.
   */
  private async replaceTaskInFile(filePath: string, lineNumber: number, newLines: string[]) {
    const file = this.app.getFileByPath(filePath);
    if (!file) throw new Error(`File not found: ${filePath}`);

    await this.app.rewrite(file, content => {
      const lines = content.split('\n');
      // line number is 1-based, convert to 0-based index.
      lines.splice(lineNumber - 1, 1, ...newLines);
      return lines.join('\n');
    });
  }

  /**
   * Updates the date component of a task's original markdown line.
   */
  private updateTaskLine(originalMarkdown: string, newDate: Date): string {
    const dueDateSymbol = getDueDateEmoji();
    const newDateString = window.moment(newDate).format('YYYY-MM-DD');
    const newDueDateComponent = `${dueDateSymbol} ${newDateString}`;
    const dueDateRegex = /📅\s*\d{4}-\d{2}-\d{2}/;

    // If a due date already exists, replace it.
    if (originalMarkdown.match(dueDateRegex)) {
      return originalMarkdown.replace(dueDateRegex, newDueDateComponent);
    } else {
      // Otherwise, append it, being careful to preserve any block links (^uuid).
      const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
      const blockLinkMatch = originalMarkdown.match(blockLinkRegex);
      if (blockLinkMatch) {
        const contentWithoutBlockLink = originalMarkdown.replace(blockLinkRegex, '');
        return `${contentWithoutBlockLink.trim()} ${newDueDateComponent}${blockLinkMatch[1]}`;
      } else {
        return `${originalMarkdown.trim()} ${newDueDateComponent}`;
      }
    }
  }

  // --- REPLACE createEvent and updateEvent with new versions ---
  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    new Notice('Use the Tasks plugin interface to create new tasks.');
    throw new Error(
      'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
    );
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    // This method is now deprecated in favor of the editInProviderUI flow.
    // It should not be called for tasks.
    new Notice('Please edit tasks using the Tasks modal (Ctrl/Cmd + Click on the event).');
    throw new Error('updateEvent is deprecated for the Tasks provider.');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const [filePath, lineNumberStr] = handle.persistentId.split('::');
    if (!filePath || !lineNumberStr) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }
    // To delete a task, we replace its line with an empty string.
    await this.replaceTaskInFile(filePath, parseInt(lineNumberStr, 10), []);
  }

  public async scheduleTask(taskId: string, date: Date): Promise<void> {
    const [filePath, lineNumberStr] = taskId.split('::');
    if (!filePath || !lineNumberStr) {
      throw new Error('Invalid task handle format for scheduling.');
    }
    const lineNumber = parseInt(lineNumberStr, 10);

    const task = this.allTasks.find(t => t.filePath === filePath && t.lineNumber === lineNumber);
    if (!task) {
      throw new Error(`Cannot find original task to schedule at ${taskId}`);
    }

    const newLine = this.updateTaskLine(task.originalMarkdown, date);
    await this.replaceTaskInFile(filePath, lineNumber, [newLine]);
  }

  public async editInProviderUI(eventId: string): Promise<void> {
    const tasksApi = (this.plugin.app as any).plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if (!tasksApi) {
      new Notice('Obsidian Tasks plugin API not available.');
      return;
    }

    // Step 1: Use the eventId (Session ID) to look up the full OFCEvent from the main cache.
    const eventFromCache = this.plugin.cache?.getEventById(eventId);
    if (!eventFromCache || !eventFromCache.uid) {
      throw new Error(
        `Could not find event or its persistent UID in the main cache for session ID ${eventId}.`
      );
    }
    const persistentId = eventFromCache.uid; // This is the "filePath::lineNumber" ID.

    // Step 2: Use the persistentId to find the corresponding task in the provider's internal cache.
    const task = this.allTasks.find(t => t.id === persistentId);
    if (!task) {
      // This error is more specific and helpful for debugging.
      throw new Error(`Task with persistent ID ${persistentId} not found in the provider's cache.`);
    }

    // Step 3: Proceed with the rest of the logic, which is now guaranteed to have the correct data.
    const originalMarkdown = task.originalMarkdown;
    const editedTaskLine = await tasksApi.editTaskLineModal(originalMarkdown);

    if (editedTaskLine && editedTaskLine !== originalMarkdown) {
      await this.replaceTaskInFile(task.filePath, task.lineNumber, [editedTaskLine]);
    }
  }

  // ====================================================================
  // PROVIDER METADATA & CONFIG
  // ====================================================================

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      hasCustomEditUI: true // Declare the new capability
    };
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  public isFileRelevant(file: TFile): boolean {
    return file.extension === 'md';
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    throw new Error('Tasks provider does not support recurring event overrides.');
  }

  // UI Components for settings remain the same.
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
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
}
