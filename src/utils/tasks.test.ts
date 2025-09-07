/**
 * @file tasks.test.ts
 * @brief Tests for updated task utility functions.
 */

import { isTask, unmakeTask, updateTaskStatus, toggleTask } from './tasks';
import { OFCEvent } from '../types';

describe('Updated task utilities (Step 3)', () => {
  describe('isTask', () => {
    it('should return true for events with non-null task status', () => {
      const taskEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: 'x'
      };
      
      expect(isTask(taskEvent)).toBe(true);
    });

    it('should return true for events with empty string task status', () => {
      const taskEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: ' '
      };
      
      expect(isTask(taskEvent)).toBe(true);
    });

    it('should return false for events with null task status', () => {
      const regularEvent: OFCEvent = {
        type: 'single',
        title: 'Regular event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: null
      };
      
      expect(isTask(regularEvent)).toBe(false);
    });

    it('should return false for events without task property', () => {
      const eventWithoutTask = {
        type: 'single',
        title: 'Old event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      } as OFCEvent;
      
      expect(isTask(eventWithoutTask)).toBe(false);
    });
  });

  describe('unmakeTask', () => {
    it('should set task to null for any event type', () => {
      const taskEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: 'x'
      };
      
      const result = unmakeTask(taskEvent);
      
      expect(result.task).toBe(null);
      expect(result.title).toBe('Test task'); // Other properties preserved
    });

    it('should work with recurring events', () => {
      const recurringTask: OFCEvent = {
        type: 'recurring',
        title: 'Recurring task',
        endDate: null,
        skipDates: [],
        daysOfWeek: ['M', 'W'],
        allDay: true,
        task: '/'
      };
      
      const result = unmakeTask(recurringTask);
      
      expect(result.task).toBe(null);
      expect(result.type).toBe('recurring');
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status to specified value', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: ' '
      };
      
      const result = updateTaskStatus(event, 'x');
      
      expect(result.task).toBe('x');
      expect(result.title).toBe('Test task'); // Other properties preserved
    });

    it('should handle setting to null', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: 'x'
      };
      
      const result = updateTaskStatus(event, null);
      
      expect(result.task).toBe(null);
    });

    it('should handle various status characters', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: ' '
      };
      
      expect(updateTaskStatus(event, '/').task).toBe('/');
      expect(updateTaskStatus(event, '-').task).toBe('-');
      expect(updateTaskStatus(event, '>').task).toBe('>');
      expect(updateTaskStatus(event, '?').task).toBe('?');
    });
  });

  describe('toggleTask (deprecated)', () => {
    it('should toggle to done when isDone is true', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: ' '
      };
      
      const result = toggleTask(event, true);
      
      expect(result.task).toBe('x');
    });

    it('should toggle to todo when isDone is false', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: 'x'
      };
      
      const result = toggleTask(event, false);
      
      expect(result.task).toBe(' ');
    });

    it('should create task from non-task when isDone is true', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Regular event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: null
      };
      
      const result = toggleTask(event, true);
      
      expect(result.task).toBe('x');
    });

    it('should create task from non-task when isDone is false', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Regular event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        task: null
      };
      
      const result = toggleTask(event, false);
      
      expect(result.task).toBe(' ');
    });
  });
});