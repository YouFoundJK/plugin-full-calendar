/**
 * @file EventEnhancer.test.ts
 * @brief Tests for EventEnhancer task normalization functionality.
 */

import { EventEnhancer } from './EventEnhancer';
import { OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';

// Mock settings
const mockSettings: FullCalendarSettings = {
  enableAdvancedCategorization: false,
  displayTimezone: 'America/New_York'
} as FullCalendarSettings;

describe('EventEnhancer task normalization', () => {
  let enhancer: EventEnhancer;

  beforeEach(() => {
    enhancer = new EventEnhancer(mockSettings);
  });

  describe('task property enhancement', () => {
    it('should add task property for legacy completed single events', () => {
      const rawEvent: any = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        completed: '2024-01-15'  // Legacy property in raw data
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe('x');
    });

    it('should add task property for legacy incomplete single events', () => {
      const rawEvent: any = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        completed: false  // Legacy property in raw data
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe(' ');
    });

    it('should add task property for legacy recurring tasks', () => {
      const rawEvent: any = {
        type: 'recurring',
        title: 'Recurring task',
        endDate: null,
        skipDates: [],
        daysOfWeek: ['M', 'W', 'F'],
        allDay: true,
        isTask: true  // Legacy property in raw data
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe(' ');
    });

    it('should preserve existing task property', () => {
      const rawEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: '/'
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe('/');
    });

    it('should set task to null for non-task events', () => {
      const rawEvent: OFCEvent = {
        type: 'single',
        title: 'Regular event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe(null);
    });
  });

  describe('integration with existing functionality', () => {
    it('should enhance tasks with category parsing when enabled', () => {
      const enhancerWithCategories = new EventEnhancer({
        ...mockSettings,
        enableAdvancedCategorization: true
      });

      const rawEvent: any = {
        type: 'single',
        title: 'Work - Complete project task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        completed: false  // Legacy property in raw data
      };

      const enhanced = enhancerWithCategories.enhance(rawEvent);

      expect(enhanced.task).toBe(' ');
      expect(enhanced.category).toBe('Work');
      expect(enhanced.title).toBe('Complete project task');
    });

    it('should handle timezone conversion for tasks', () => {
      const rawEvent: any = {
        type: 'single',
        title: 'Timed task',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'UTC',
        completed: 'x'  // Legacy property in raw data
      };

      const enhanced = enhancer.enhance(rawEvent);

      expect(enhanced.task).toBe('x');
      expect(enhanced.timezone).toBe('UTC'); // Preserved for write-back
      // Times should be converted to display timezone
      // @ts-expect-error - Testing time property existence
      expect(enhanced.startTime).not.toBe('10:00');
    });
  });

  describe('prepareForStorage legacy cleanup', () => {
    it('should remove legacy task properties during Step 2', () => {
      const enhancedEvent: any = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: 'x',
        completed: '2024-01-15',
        isTask: true
      };

      const prepared = enhancer.prepareForStorage(enhancedEvent);

      expect(prepared.task).toBe('x');
      expect((prepared as any).completed).toBeUndefined();
      expect((prepared as any).isTask).toBeUndefined();
    });

    it('should preserve task property when cleaning up', () => {
      const enhancedEvent: any = {
        type: 'recurring',
        title: 'Recurring task',
        endDate: null,
        skipDates: [],
        daysOfWeek: ['M', 'W'],
        allDay: true,
        task: '/',
        isTask: true
      };

      const prepared = enhancer.prepareForStorage(enhancedEvent);

      expect(prepared.task).toBe('/');
      expect((prepared as any).isTask).toBeUndefined();
    });

    it('should handle events without task properties', () => {
      const regularEvent: OFCEvent = {
        type: 'single',
        title: 'Regular event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: null
      };

      const prepared = enhancer.prepareForStorage(regularEvent);

      expect(prepared.task).toBe(null);
      expect(prepared.title).toBe('Regular event');
    });
  });
});
