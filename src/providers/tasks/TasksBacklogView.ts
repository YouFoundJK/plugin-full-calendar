/**
 * @file TasksBacklogView.ts
 * @brief Backlog view for undated tasks from the Tasks plugin
 * 
 * @description
 * Provides a sidebar view displaying undated tasks that can be dragged
 * onto the calendar to schedule them. Implements performance optimizations
 * with pagination for large task lists.
 * 
 * @license See LICENSE.md
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { TasksPluginProvider } from './TasksPluginProvider';
import { ParsedUndatedTask } from './typesTask';
import { TasksParser } from './TasksParser';
import FullCalendarPlugin from '../../main';

export const TASKS_BACKLOG_VIEW_TYPE = 'tasks-backlog-view';

export class TasksBacklogView extends ItemView {
  private plugin: FullCalendarPlugin;
  private provider: TasksPluginProvider | null = null;
  private undatedTasks: ParsedUndatedTask[] = [];
  private displayedCount = 0;
  private readonly INITIAL_LOAD_COUNT = 200;
  private readonly LOAD_MORE_COUNT = 100;
  private parser: TasksParser;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.parser = new TasksParser();
  }

  getViewType(): string {
    return TASKS_BACKLOG_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Tasks Backlog';
  }

  getIcon(): string {
    return 'list-checks';
  }

  async onOpen(): Promise<void> {
    await this.loadTasksProvider();
    await this.refresh();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Finds the Tasks plugin provider instance
   */
  private async loadTasksProvider(): Promise<void> {
    if (!this.plugin.providerRegistry) {
      return;
    }

    // Find the first Tasks provider instance
    const sources = this.plugin.providerRegistry.getAllSources();
    const tasksSource = sources.find((source: any) => source.type === 'tasks');
    
    if (tasksSource) {
      const instances = (this.plugin.providerRegistry as any).instances;
      this.provider = instances.get(tasksSource.id) as TasksPluginProvider;
    }
  }

  /**
   * Refreshes the backlog view with current undated tasks
   */
  public async refresh(): Promise<void> {
    if (!this.provider) {
      await this.loadTasksProvider();
    }

    if (this.provider) {
      try {
        this.undatedTasks = await this.provider.getUndatedTasks();
        this.displayedCount = Math.min(this.INITIAL_LOAD_COUNT, this.undatedTasks.length);
        this.render();
      } catch (error) {
        console.error('Error loading undated tasks:', error);
        this.renderError('Failed to load tasks');
      }
    } else {
      // Show helpful message when no Tasks calendar is configured
      this.renderEmpty('No Tasks calendar source configured.\n\nTo use the Tasks Backlog:\n1. Go to Full Calendar settings\n2. Add a new calendar source\n3. Select "Obsidian Tasks" as the type\n4. Configure the Tasks calendar settings');
    }
  }

  /**
   * Renders the backlog view
   */
  private render(): void {
    const container = this.containerEl;
    container.empty();

    // Header
    const header = container.createDiv({ cls: 'tasks-backlog-header' });
    header.createEl('h3', { text: 'Tasks Backlog', cls: 'tasks-backlog-title' });
    header.createEl('p', { 
      text: `${this.undatedTasks.length} undated tasks`,
      cls: 'tasks-backlog-count'
    });

    if (this.undatedTasks.length === 0) {
      this.renderEmpty('No undated tasks found');
      return;
    }

    // Task list container
    const listContainer = container.createDiv({ cls: 'tasks-backlog-list' });

    // Render displayed tasks
    for (let i = 0; i < this.displayedCount; i++) {
      const task = this.undatedTasks[i];
      this.renderTaskItem(listContainer, task);
    }

    // Load more button if needed
    if (this.displayedCount < this.undatedTasks.length) {
      this.renderLoadMoreButton(container);
    }

    // Instructions
    const instructions = container.createDiv({ cls: 'tasks-backlog-instructions' });
    instructions.createEl('p', { 
      text: 'Drag tasks onto the calendar to schedule them',
      cls: 'tasks-backlog-hint'
    });
  }

  /**
   * Renders a single task item with drag functionality
   */
  private renderTaskItem(container: HTMLElement, task: ParsedUndatedTask): void {
    const taskEl = container.createDiv({ 
      cls: 'tasks-backlog-item',
      attr: { draggable: 'true' }
    });

    // Clean the task content of any task plugin emojis before displaying
    const cleanContent = this.parser.getTaskContentWithoutDate(task.content);

    // Task content
    const contentEl = taskEl.createDiv({ cls: 'tasks-backlog-item-content' });
    contentEl.createEl('span', { 
      text: cleanContent,
      cls: 'tasks-backlog-item-text'
    });

    // File info
    const fileInfoEl = taskEl.createDiv({ cls: 'tasks-backlog-item-info' });
    const fileName = task.filePath.split('/').pop() || task.filePath;
    fileInfoEl.createEl('span', { 
      text: fileName,
      cls: 'tasks-backlog-item-file'
    });

    // Completion status indicator
    if (task.completed === 'cancelled') {
      taskEl.classList.add('tasks-backlog-item-cancelled');
    } else if (task.completed) {
      taskEl.classList.add('tasks-backlog-item-completed');
    }

    // Set up drag functionality
    this.setupDragHandlers(taskEl, task);
  }

  /**
   * Sets up drag and drop handlers for a task item
   */
  private setupDragHandlers(taskEl: HTMLElement, task: ParsedUndatedTask): void {
    const taskId = `${task.filePath}::${task.lineNumber}`;
    
    // Set data attribute for calendar drop handling
    taskEl.setAttribute('data-task-id', taskId);
    
    taskEl.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return;
      
      // Store the task ID for drop handling
      e.dataTransfer.setData('text/plain', taskId);
      e.dataTransfer.effectAllowed = 'move';
      
      // Add visual feedback
      taskEl.classList.add('tasks-backlog-item-dragging');
    });

    taskEl.addEventListener('dragend', () => {
      taskEl.classList.remove('tasks-backlog-item-dragging');
    });
  }

  /**
   * Renders the "Load More" button
   */
  private renderLoadMoreButton(container: HTMLElement): void {
    const buttonContainer = container.createDiv({ cls: 'tasks-backlog-load-more' });
    const button = buttonContainer.createEl('button', {
      text: `Load ${Math.min(this.LOAD_MORE_COUNT, this.undatedTasks.length - this.displayedCount)} more tasks`,
      cls: 'mod-cta tasks-backlog-load-more-btn'
    });

    button.addEventListener('click', () => {
      this.displayedCount = Math.min(
        this.displayedCount + this.LOAD_MORE_COUNT,
        this.undatedTasks.length
      );
      this.render();
    });
  }

  /**
   * Renders empty state
   */
  private renderEmpty(message: string): void {
    const container = this.containerEl;
    container.empty();

    const emptyEl = container.createDiv({ cls: 'tasks-backlog-empty' });
    
    // Handle multi-line messages by splitting on \n
    const lines = message.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        emptyEl.createEl('p', { 
          text: line, 
          cls: i === 0 ? 'tasks-backlog-empty-text' : 'tasks-backlog-empty-instruction'
        });
      } else {
        emptyEl.createEl('br');
      }
    }
  }

  /**
   * Renders error state
   */
  private renderError(message: string): void {
    const container = this.containerEl;
    container.empty();

    const errorEl = container.createDiv({ cls: 'tasks-backlog-error' });
    errorEl.createEl('p', { text: message, cls: 'tasks-backlog-error-text' });
  }
}