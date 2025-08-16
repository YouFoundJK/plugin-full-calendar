/**
 * @file EventEnhancer.ts
 * @brief Defines the event enhancement pipeline for advanced categorization.
 *
 * @description
 * This class provides a stateless pipeline for transforming OFCEvents. It decouples
 * the core data engine from the "Advanced Categorization" feature by centralizing
 * the logic for parsing categories from titles on the read path and reconstructing
 * titles for storage on the write path.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';
import { constructTitle, parseTitle } from '../utils/categoryParser';

export class EventEnhancer {
  private settings: FullCalendarSettings;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }
  /**
   * Updates the settings object used by the enhancer.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
  }
  /**
   * The "read path" transformation.
   * Takes a raw event from a provider and, if categorization is enabled,
   * parses its title to extract category and sub-category information.
   *
   * @param rawEvent The event object with an un-parsed title.
   * @returns An enhanced OFCEvent with title, category, and subCategory correctly populated.
   */
  public enhance(rawEvent: OFCEvent): OFCEvent {
    if (!this.settings.enableAdvancedCategorization) {
      // If the feature is off, just return the event as-is.
      return rawEvent;
    }

    // If the feature is on, parse the title.
    const { category, subCategory, title } = parseTitle(rawEvent.title);

    // Return a new event object with the parsed fields.
    return {
      ...rawEvent,
      title,
      category,
      subCategory
    };
  }

  /**
   * The "write path" transformation.
   * Takes a structured event from the cache/UI and, if categorization is enabled,
   * constructs a flat title string for storage and removes the separate category fields.
   *
   * @param structuredEvent An event with potentially separate category/subCategory fields.
   * @returns A new event object ready to be written to a provider, with a combined title
   *          and no separate category/subCategory properties.
   */
  public prepareForStorage(structuredEvent: OFCEvent): OFCEvent {
    if (!this.settings.enableAdvancedCategorization) {
      // If the feature is off, return the event as-is.
      return structuredEvent;
    }

    const eventForStorage = { ...structuredEvent };

    // Construct the full title string.
    eventForStorage.title = constructTitle(
      eventForStorage.category,
      eventForStorage.subCategory,
      eventForStorage.title
    );

    // Remove the separate category fields to avoid them being written to storage.
    delete eventForStorage.category;
    delete eventForStorage.subCategory;

    return eventForStorage;
  }
}
