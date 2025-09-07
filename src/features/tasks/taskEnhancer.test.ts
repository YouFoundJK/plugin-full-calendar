/**
 * @file taskEnhancer.test.ts
 * @brief Tests for task status normalization logic.
 */

import { normalizeTaskStatus } from './taskEnhancer';
import { OFCEvent } from '../../types';

describe('normalizeTaskStatus', () => {
  describe('new task property handling', () => {
    it('should return task status when task property is present', () => {
      const event = { task: 'x' } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe('x');
    });

    it('should return null when task property is explicitly null', () => {
      const event = { task: null } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });

    it('should return task status even with legacy properties present', () => {
      const event = {
        task: '/',
        type: 'single' as const,
        completed: 'x' // Legacy property should be ignored
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe('/');
    });
  });

  describe('legacy single event handling', () => {
    it('should return "x" for completed single events', () => {
      const event = {
        type: 'single' as const,
        completed: '2024-01-15'
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe('x');
    });

    it('should return " " for incomplete single events', () => {
      const event = {
        type: 'single' as const,
        completed: false
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(' ');
    });

    it('should return null for single events without completed property', () => {
      const event = {
        type: 'single' as const
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });

    it('should return null for single events with null completed property', () => {
      const event = {
        type: 'single' as const,
        completed: null
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });
  });

  describe('legacy recurring event handling', () => {
    it('should return " " for recurring events with isTask=true', () => {
      const event = {
        type: 'recurring' as const,
        isTask: true
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(' ');
    });

    it('should return null for recurring events with isTask=false', () => {
      const event = {
        type: 'recurring' as const,
        isTask: false
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });

    it('should return null for recurring events without isTask property', () => {
      const event = {
        type: 'recurring' as const
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });
  });

  describe('legacy rrule event handling', () => {
    it('should return " " for rrule events with isTask=true', () => {
      const event = {
        type: 'rrule' as const,
        isTask: true
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(' ');
    });

    it('should return null for rrule events with isTask=false', () => {
      const event = {
        type: 'rrule' as const,
        isTask: false
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });
  });

  describe('non-task events', () => {
    it('should return null for regular single events', () => {
      const event = {
        type: 'single' as const,
        title: 'Regular event'
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });

    it('should return null for regular recurring events', () => {
      const event = {
        type: 'recurring' as const,
        title: 'Regular recurring event'
      } as Partial<OFCEvent>;
      expect(normalizeTaskStatus(event)).toBe(null);
    });
  });
});