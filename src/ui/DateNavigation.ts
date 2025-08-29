/**
 * @file DateNavigation.ts
 * @brief Handles date navigation logic for calendar views
 *
 * @description
 * This module provides functionality for quick date navigation including:
 * - Navigate to current month/week based on view type
 * - Custom date navigation with calendar picker
 * - Context-aware navigation options based on current calendar view
 *
 * Follows the Single Responsibility Principle by focusing solely on
 * date navigation concerns.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { Calendar } from '@fullcalendar/core';
import { Menu } from 'obsidian';
import { DatePicker, createHiddenDatePicker } from './components/DatePicker';

export type NavigationOption = 'thisMonth' | 'thisWeek' | 'customDate';

export interface NavigationContext {
  currentView: string;
  currentDate: Date;
  isNarrow: boolean;
}

/**
 * Determines which navigation options are available based on current view
 */
export function getAvailableNavigationOptions(context: NavigationContext): NavigationOption[] {
  const options: NavigationOption[] = [];

  // Add "This Month" for day and week views
  if (context.currentView.includes('Day') || context.currentView.includes('Week')) {
    options.push('thisMonth');
  }

  // Add "This Week" for day views only
  if (context.currentView.includes('Day')) {
    options.push('thisWeek');
  }

  // Always add custom date option
  options.push('customDate');

  return options;
}

/**
 * Gets the display label for a navigation option
 */
export function getNavigationLabel(option: NavigationOption): string {
  switch (option) {
    case 'thisMonth':
      return 'This Month';
    case 'thisWeek':
      return 'This Week';
    case 'customDate':
      return 'Custom Date...';
    default:
      return 'Unknown';
  }
}

/**
 * Gets the appropriate calendar view for a navigation option
 */
export function getNavigationView(option: NavigationOption, isNarrow: boolean): string {
  switch (option) {
    case 'thisMonth':
      return isNarrow ? 'timeGridWeek' : 'dayGridMonth';
    case 'thisWeek':
      return isNarrow ? 'timeGrid3Days' : 'timeGridWeek';
    case 'customDate':
      return 'timeGridDay'; // Show day view for specific dates
    default:
      return isNarrow ? 'timeGrid3Days' : 'timeGridWeek';
  }
}

/**
 * Main DateNavigation class that handles all navigation functionality
 */
export class DateNavigation {
  private calendar: Calendar;
  private datePicker: DatePicker | null = null;
  private container: HTMLElement;

  constructor(calendar: Calendar, container: HTMLElement) {
    this.calendar = calendar;
    this.container = container;
  }

  /**
   * Creates and shows the navigation dropdown menu
   */
  public showNavigationMenu(event: MouseEvent): void {
    const context = this.getCurrentContext();
    const availableOptions = getAvailableNavigationOptions(context);

    const menu = new Menu();

    availableOptions.forEach(option => {
      menu.addItem(item => {
        item.setTitle(getNavigationLabel(option)).onClick(() => {
          this.handleNavigationOption(option, context);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Handles navigation for right-click context menu
   */
  public showDateContextMenu(event: MouseEvent, clickedDate: Date): void {
    const context = this.getCurrentContext();
    const menu = new Menu();

    // Add view options for the specific date
    const viewOptions = [
      { view: 'dayGridMonth', label: 'View Month' },
      { view: 'timeGridWeek', label: 'View Week' },
      { view: 'timeGridDay', label: 'View Day' }
    ];

    viewOptions.forEach(({ view, label }) => {
      menu.addItem(item => {
        item.setTitle(label).onClick(() => {
          this.navigateToDate(clickedDate, view);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  private getCurrentContext(): NavigationContext {
    const view = this.calendar.view;
    return {
      currentView: view.type,
      currentDate: view.currentStart,
      isNarrow: this.container.clientWidth < 768 // Assume narrow if width < 768px
    };
  }

  private handleNavigationOption(option: NavigationOption, context: NavigationContext): void {
    const now = new Date();

    switch (option) {
      case 'thisMonth':
        this.navigateToDate(now, getNavigationView(option, context.isNarrow));
        break;
      case 'thisWeek':
        this.navigateToDate(now, getNavigationView(option, context.isNarrow));
        break;
      case 'customDate':
        this.showCustomDatePicker(context);
        break;
    }
  }

  private showCustomDatePicker(context: NavigationContext): void {
    // Clean up existing picker
    if (this.datePicker) {
      this.datePicker.destroy();
    }

    // Create a hidden date picker for date selection
    this.datePicker = createHiddenDatePicker(this.container, {
      mode: 'single',
      defaultDate: context.currentDate,
      onChange: (selectedDates: Date[]) => {
        if (selectedDates.length > 0) {
          const view = getNavigationView('customDate', context.isNarrow);
          this.navigateToDate(selectedDates[0], view);
          this.datePicker?.close();
        }
      }
    });

    // Open the picker immediately
    this.datePicker.open();
  }

  private navigateToDate(date: Date, viewType?: string): void {
    // Change view first if specified
    if (viewType && viewType !== this.calendar.view.type) {
      this.calendar.changeView(viewType);
    }

    // Navigate to the date
    this.calendar.gotoDate(date);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.datePicker) {
      this.datePicker.destroy();
      this.datePicker = null;
    }
  }
}

/**
 * Factory function to create a DateNavigation instance
 */
export function createDateNavigation(calendar: Calendar, container: HTMLElement): DateNavigation {
  return new DateNavigation(calendar, container);
}
