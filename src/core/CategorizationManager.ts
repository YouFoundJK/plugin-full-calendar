import { Notice } from 'obsidian';
import FullCalendarPlugin from '../main';
import { EventLocation, OFCEvent } from '../types';
import { CalendarProvider } from '../providers/Provider';

// This was previously imported from EditableCalendar.ts.
// It's a function signature that defines how to get a category for a given event.
type CategoryProvider = (event: OFCEvent, location: EventLocation) => string | undefined;

/**
 * @file CategorizationManager.ts
 * @brief Manages bulk categorization operations for providers that support it.
 *
 * @description
 * This service class orchestrates the process of adding or removing categories
 * from event titles across all configured calendar providers that have implemented
 * bulk categorization methods. It acts as a single point of contact for the UI.
 *
 * @license See LICENSE.md
 */
export class CategorizationManager {
  private plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Gets all registered calendar providers that expose bulk categorization methods.
   * This is determined by checking for the existence of a `bulkAddCategories` method.
   * @returns An array of providers that can be used for bulk operations.
   */
  private getCategorizableProviders(): CalendarProvider<any>[] {
    // HACK: The ability to bulk-categorize is not yet part of the formal
    // CalendarProvider interface. For now, we identify them by checking
    // for the existence of the `bulkAddCategories` method.
    // This is a temporary solution until the interface is updated.
    return [...this.plugin.cache.getProviders()].filter(
      provider =>
        'bulkAddCategories' in provider && typeof (provider as any).bulkAddCategories === 'function'
    );
  }

  private async performBulkOperation(operation: () => Promise<void>): Promise<void> {
    if (this.plugin.cache.isBulkUpdating) {
      new Notice('A bulk update is already in progress.');
      return;
    }

    this.plugin.cache.isBulkUpdating = true;
    try {
      await operation();
    } catch (e) {
      console.error('Error during bulk operation:', e);
      new Notice('An error occurred during the bulk update. See console for details.');
    } finally {
      this.plugin.cache.isBulkUpdating = false;
      // After the update is complete, we must trigger a full cache refresh.
      // saveSettings is the canonical way to trigger a full cache reset and view reload.
      await this.plugin.saveSettings();
    }
  }

  public async bulkUpdateCategories(
    choice: 'smart' | 'force_folder' | 'force_default',
    defaultCategory?: string
  ): Promise<void> {
    await this.performBulkOperation(async () => {
      const categoryProvider: CategoryProvider = (event: OFCEvent, location: EventLocation) => {
        if (choice === 'force_default') {
          return defaultCategory;
        }
        // For both 'smart' and 'force_folder', the category comes from the parent folder.
        const parent = this.plugin.app.vault.getAbstractFileByPath(location.file.path)?.parent;
        if (!parent || parent.isRoot()) {
          return undefined;
        }
        return parent.name;
      };

      const force = choice !== 'smart';
      const categorizableProviders = this.getCategorizableProviders();

      // CORRECTED: Use a for...of loop for async operations.
      for (const provider of categorizableProviders) {
        // We've already checked that this method exists in getCategorizableProviders.
        await (provider as any).bulkAddCategories(categoryProvider, force);
      }
    });
  }

  public async bulkRemoveCategories(): Promise<void> {
    await this.performBulkOperation(async () => {
      // The manager is ONLY responsible for gathering categories from the settings.
      const settings = this.plugin.settings;
      const knownCategories = new Set<string>(
        settings.categorySettings.map((s: { name: string }) => s.name)
      );

      const categorizableProviders = this.getCategorizableProviders();
      for (const provider of categorizableProviders) {
        // HACK: Not all providers have `getFolderCategoryNames`.
        // This should be formalized in an interface.
        const folderCategories =
          'getFolderCategoryNames' in provider &&
          typeof (provider as any).getFolderCategoryNames === 'function'
            ? (provider as any).getFolderCategoryNames()
            : [];

        if (folderCategories.length > 0) {
          for (const name of folderCategories) {
            knownCategories.add(name);
          }
        }
      }
      for (const provider of categorizableProviders) {
        // We've already checked that `bulkRemoveCategories` exists.
        await (provider as any).bulkRemoveCategories(knownCategories);
      }
    });
  }
}
