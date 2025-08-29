/**
 * @file DateNavigation.test.ts
 * @brief Tests for the DateNavigation functionality
 */

import {
  getAvailableNavigationOptions,
  getNavigationLabel,
  getNavigationView
} from './DateNavigation';
import type { NavigationContext } from './DateNavigation';

describe('DateNavigation', () => {
  describe('getAvailableNavigationOptions', () => {
    it('should return correct options for day view', () => {
      const context: NavigationContext = {
        currentView: 'timeGridDay',
        currentDate: new Date(),
        isNarrow: false
      };

      const options = getAvailableNavigationOptions(context);
      expect(options).toContain('thisMonth');
      expect(options).toContain('thisWeek');
      expect(options).toContain('customDate');
    });

    it('should return correct options for week view', () => {
      const context: NavigationContext = {
        currentView: 'timeGridWeek',
        currentDate: new Date(),
        isNarrow: false
      };

      const options = getAvailableNavigationOptions(context);
      expect(options).toContain('thisMonth');
      expect(options).not.toContain('thisWeek');
      expect(options).toContain('customDate');
    });

    it('should return correct options for month view', () => {
      const context: NavigationContext = {
        currentView: 'dayGridMonth',
        currentDate: new Date(),
        isNarrow: false
      };

      const options = getAvailableNavigationOptions(context);
      expect(options).not.toContain('thisMonth');
      expect(options).not.toContain('thisWeek');
      expect(options).toContain('customDate');
    });
  });

  describe('getNavigationLabel', () => {
    it('should return correct labels for navigation options', () => {
      expect(getNavigationLabel('thisMonth')).toBe('This Month');
      expect(getNavigationLabel('thisWeek')).toBe('This Week');
      expect(getNavigationLabel('customDate')).toBe('Custom Date...');
    });
  });

  describe('getNavigationView', () => {
    it('should return correct views for desktop', () => {
      expect(getNavigationView('thisMonth', false)).toBe('dayGridMonth');
      expect(getNavigationView('thisWeek', false)).toBe('timeGridWeek');
      expect(getNavigationView('customDate', false)).toBe('timeGridDay');
    });

    it('should return correct views for mobile/narrow', () => {
      expect(getNavigationView('thisMonth', true)).toBe('timeGridWeek');
      expect(getNavigationView('thisWeek', true)).toBe('timeGrid3Days');
      expect(getNavigationView('customDate', true)).toBe('timeGridDay');
    });
  });
});
