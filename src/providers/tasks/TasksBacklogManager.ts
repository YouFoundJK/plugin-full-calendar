/**
 * @file TasksBacklogManager.ts
 * @brief Manages the lifecycle of the Tasks Backlog view
 * 
 * @description
 * Handles registering/unregistering the Tasks Backlog view and its associated
 * command based on whether any Tasks calendar sources are configured.
 * 
 * @license See LICENSE.md
 */

import { WorkspaceLeaf } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { TasksBacklogView, TASKS_BACKLOG_VIEW_TYPE } from './TasksBacklogView';

export class TasksBacklogManager {
  private plugin: FullCalendarPlugin;
  private isLoaded = false;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Registers the backlog view and command
   */
  public onload(): void {
    if (this.isLoaded) {
      return;
    }

    // Register the view
    this.plugin.registerView(
      TASKS_BACKLOG_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TasksBacklogView(leaf, this.plugin)
    );

    // Register the command to open the backlog
    this.plugin.addCommand({
      id: 'open-tasks-backlog',
      name: 'Open Tasks Backlog',
      callback: () => this.openBacklogView()
    });

    // Add ribbon icon
    this.plugin.addRibbonIcon('list-checks', 'Tasks Backlog', () => {
      this.openBacklogView();
    });

    this.isLoaded = true;
  }

  /**
   * Unregisters the backlog view and cleans up
   */
  public onunload(): void {
    if (!this.isLoaded) {
      return;
    }

    // Close any open backlog views
    this.plugin.app.workspace.detachLeavesOfType(TASKS_BACKLOG_VIEW_TYPE);

    this.isLoaded = false;
  }

  /**
   * Opens or focuses the Tasks Backlog view
   */
  public async openBacklogView(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    
    // Check if backlog view is already open
    let leaf = workspace.getLeavesOfType(TASKS_BACKLOG_VIEW_TYPE)[0];
    
    if (!leaf) {
      // Create new leaf in right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: TASKS_BACKLOG_VIEW_TYPE,
          active: true
        });
      } else {
        return; // Could not create leaf
      }
    } else {
      // Focus existing view
      workspace.revealLeaf(leaf);
    }

    // Refresh the view if it exists
    const view = leaf?.view as TasksBacklogView;
    if (view && view.refresh) {
      await view.refresh();
    }
  }

  /**
   * Refreshes the backlog view if it's open
   */
  public async refreshBacklogView(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    const leaves = workspace.getLeavesOfType(TASKS_BACKLOG_VIEW_TYPE);
    
    for (const leaf of leaves) {
      const view = leaf.view as TasksBacklogView;
      if (view && view.refresh) {
        await view.refresh();
      }
    }
  }

  /**
   * Returns whether the backlog is currently loaded
   */
  public isBacklogLoaded(): boolean {
    return this.isLoaded;
  }
}