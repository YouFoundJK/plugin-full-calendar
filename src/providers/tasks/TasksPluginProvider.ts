/**
 * @file TasksPluginProvider.ts
 * @brief Provider for Obsidian Tasks plugin integration
 * 
 * @description
 * This provider integrates with the Obsidian Tasks plugin to:
 * 1. Scan the vault once to collect both dated and undated tasks
 * 2. Cache results for performance
 * 3. Provide writable operations through Tasks plugin API
 * 4. Support backlog functionality for undated tasks
 * 
 * @license See LICENSE.md
 */

import { TFile, Notice } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksPluginProviderConfig, ParsedDatedTask, ParsedUndatedTask } from './typesTasks';
import { TasksParser } from './TasksParser';
import { TasksConfigComponent } from './TasksConfigComponent';

export class TasksPluginProvider implements CalendarProvider<TasksPluginProviderConfig> {
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: TasksPluginProviderConfig;
  private parser: TasksParser;

  // Caching mechanism for single-pass scanning
  private _datedTasks: [OFCEvent, EventLocation | null][] | null = null;
  private _undatedTasks: ParsedUndatedTask[] | null = null;

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;

  constructor(
    source: TasksPluginProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    this.source = source;
    this.plugin = plugin;
    this.app = app || (plugin.app as any);
    this.parser = new TasksParser();
  }

  getCapabilities(): CalendarProviderCapabilities {
    // Step 2 will change these to true when we implement write operations
    return {
      canCreate: false,
      canEdit: false,
      canDelete: false
    };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // For tasks, we'll use the file path and line number as persistent ID
    if ('filePath' in event && 'lineNumber' in event) {
      return {
        persistentId: this.parser.generateTaskId(
          (event as any).filePath,
          (event as any).lineNumber
        )
      };
    }
    return null;
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    await this._scanVaultForTasks();
    return this._datedTasks || [];
  }

  async getEventsInFile(file: TFile): Promise<[OFCEvent, EventLocation | null][]> {
    const fileContent = await this.app.read(file);
    const lines = fileContent.split('\n');
    const events: [OFCEvent, EventLocation | null][] = [];

    lines.forEach((line: string, index: number) => {
      const result = this.parser.parseLine(line, file.path, index + 1);
      if (result.type === 'dated') {
        const event = this.parser.convertToOFCEvent(result.task);
        // Add file location metadata
        (event as any).filePath = result.task.filePath;
        (event as any).lineNumber = result.task.lineNumber;
        
        const location: EventLocation = {
          file: { path: result.task.filePath },
          lineNumber: result.task.lineNumber
        };
        events.push([event, location]);
      }
    });

    return events;
  }

  /**
   * Get undated tasks for backlog view (Step 3)
   */
  async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._scanVaultForTasks();
    return this._undatedTasks || [];
  }

  /**
   * Single-pass vault scanning for both dated and undated tasks
   */
  private async _scanVaultForTasks(): Promise<void> {
    // Return immediately if cache is already populated
    if (this._datedTasks !== null) {
      return;
    }

    const datedTasks: [OFCEvent, EventLocation | null][] = [];
    const undatedTasks: ParsedUndatedTask[] = [];

    // Get all markdown files in the vault - access through plugin.app
    const markdownFiles = (this.plugin.app as any).vault.getMarkdownFiles();
    
    for (const file of markdownFiles) {
      try {
        const fileContent = await this.app.read(file);
        const lines = fileContent.split('\n');

        lines.forEach((line: string, index: number) => {
          const result = this.parser.parseLine(line, file.path, index + 1);
          
          if (result.type === 'dated') {
            const event = this.parser.convertToOFCEvent(result.task);
            // Add file location metadata
            (event as any).filePath = result.task.filePath;
            (event as any).lineNumber = result.task.lineNumber;
            
            const location: EventLocation = {
              file: { path: result.task.filePath },
              lineNumber: result.task.lineNumber
            };
            datedTasks.push([event, location]);
          } else if (result.type === 'undated') {
            undatedTasks.push(result.task);
          }
        });
      } catch (error) {
        console.warn(`Failed to read file ${file.path}:`, error);
      }
    }

    // Populate cache
    this._datedTasks = datedTasks;
    this._undatedTasks = undatedTasks;
  }

  /**
   * Invalidate cache to trigger re-scan on next data request
   */
  private _invalidateCache(): void {
    this._datedTasks = null;
    this._undatedTasks = null;
  }

  // Write operations (Step 2) - placeholder implementations
  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Task creation not yet implemented');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('Task updating not yet implemented');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('Task deletion not yet implemented');
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Tasks do not support recurring instances');
  }

  getConfigurationComponent() {
    return TasksConfigComponent;
  }

  // File watching handlers
  async handleFileUpdate(file: TFile): Promise<void> {
    this._invalidateCache();
  }

  async handleFileDelete(filePath: string): Promise<void> {
    this._invalidateCache();
  }
}