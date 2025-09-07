/**
 * @file taskConstants.test.ts
 * @brief Tests for task constants and utility functions.
 */

import {
  TASK_STATUSES,
  TASK_STATUS_OPTIONS,
  TaskStatus,
  isValidTaskStatus,
  getTaskStatusLabel,
  getTaskStatusDescription
} from './taskConstants';

describe('taskConstants', () => {
  describe('TASK_STATUSES', () => {
    it('should define standard task status characters', () => {
      expect(TASK_STATUSES.TODO).toBe(' ');
      expect(TASK_STATUSES.DONE).toBe('x');
      expect(TASK_STATUSES.CANCELLED).toBe('-');
      expect(TASK_STATUSES.IN_PROGRESS).toBe('/');
      expect(TASK_STATUSES.DEFERRED).toBe('>');
      expect(TASK_STATUSES.QUESTION).toBe('?');
      expect(TASK_STATUSES.IMPORTANT).toBe('!');
      expect(TASK_STATUSES.SCHEDULED).toBe('<');
      expect(TASK_STATUSES.INFO).toBe('i');
    });
  });

  describe('TASK_STATUS_OPTIONS', () => {
    it('should include null option for non-tasks', () => {
      const notTaskOption = TASK_STATUS_OPTIONS.find(opt => opt.value === null);
      expect(notTaskOption).toBeDefined();
      expect(notTaskOption?.label).toBe('Not a task');
    });

    it('should include all status characters', () => {
      const statusValues = TASK_STATUS_OPTIONS.map(opt => opt.value).filter(v => v !== null);
      const expectedStatuses = Object.values(TASK_STATUSES);
      
      expectedStatuses.forEach(status => {
        expect(statusValues).toContain(status);
      });
    });

    it('should have consistent data structure', () => {
      TASK_STATUS_OPTIONS.forEach(option => {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(option).toHaveProperty('description');
        expect(typeof option.label).toBe('string');
        expect(typeof option.description).toBe('string');
      });
    });
  });

  describe('isValidTaskStatus', () => {
    it('should return true for null', () => {
      expect(isValidTaskStatus(null)).toBe(true);
    });

    it('should return true for valid status characters', () => {
      Object.values(TASK_STATUSES).forEach(status => {
        expect(isValidTaskStatus(status)).toBe(true);
      });
    });

    it('should return false for invalid characters', () => {
      expect(isValidTaskStatus('z')).toBe(false);
      expect(isValidTaskStatus('1')).toBe(false);
      expect(isValidTaskStatus('@')).toBe(false);
    });
  });

  describe('getTaskStatusLabel', () => {
    it('should return correct labels for valid statuses', () => {
      expect(getTaskStatusLabel(null)).toBe('Not a task');
      expect(getTaskStatusLabel(' ')).toBe('Todo');
      expect(getTaskStatusLabel('x')).toBe('Done');
      expect(getTaskStatusLabel('-')).toBe('Cancelled');
      expect(getTaskStatusLabel('/')).toBe('In Progress');
    });

    it('should return "Unknown" for invalid statuses', () => {
      expect(getTaskStatusLabel('z' as TaskStatus)).toBe('Unknown');
    });
  });

  describe('getTaskStatusDescription', () => {
    it('should return correct descriptions for valid statuses', () => {
      expect(getTaskStatusDescription(null)).toBe('Regular calendar event');
      expect(getTaskStatusDescription(' ')).toBe('Task to be done');
      expect(getTaskStatusDescription('x')).toBe('Completed task');
      expect(getTaskStatusDescription('-')).toBe('Cancelled task');
    });

    it('should return "Unknown task status" for invalid statuses', () => {
      expect(getTaskStatusDescription('z' as TaskStatus)).toBe('Unknown task status');
    });
  });
});