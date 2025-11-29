/**
 * @file interop.test.ts
 * @brief Tests for interop module, focusing on timezone-aware event conversion.
 *
 * @description
 * This test suite validates the toEventInput function's handling of:
 * - Recurring events with RRULE and DTSTART timezone specification
 * - Display timezone conversion for rrule events
 * - Correct RRULE string generation with TZID
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { toEventInput } from './interop';
import { OFCEvent } from '../types';
import { FullCalendarSettings, DEFAULT_SETTINGS } from '../types/settings';

jest.mock(
  'obsidian',
  () => ({
    Notice: class {
      constructor() {}
    }
  }),
  { virtual: true }
);

// Mock the view module for category colors
jest.mock('../ui/view', () => ({
  getCalendarColors: (color: string) => ({ color, textColor: '#ffffff' })
}));

describe('interop toEventInput tests', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Budapest'
  };

  describe('Single event conversion', () => {
    it('should convert a simple single event to EventInput', () => {
      const event = {
        type: 'single',
        title: 'Test Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('test-id');
      expect(result!.title).toBe('Test Event');
      expect(result!.allDay).toBe(false);
    });

    it('should handle all-day single events', () => {
      const event = {
        type: 'single',
        title: 'All Day',
        date: '2025-06-15',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.allDay).toBe(true);
    });
  });

  describe('Recurring event RRULE generation', () => {
    it('should generate weekly RRULE with TZID', () => {
      const event = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M', 'W', 'F'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('weekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.rrule).toBeDefined();

      const rrule = result!.rrule as string;
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
      expect(rrule).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should generate monthly by day RRULE', () => {
      const event = {
        type: 'recurring',
        title: 'Monthly Payment',
        startRecur: '2025-01-15',
        startTime: '09:00',
        endTime: '09:30',
        dayOfMonth: 15,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('monthly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
    });

    it('should include EXDATE for skipDates', () => {
      const event = {
        type: 'recurring',
        title: 'With Exceptions',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        skipDates: ['2025-01-13', '2025-01-20'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('exceptions-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('EXDATE;TZID=Europe/Prague:20250113');
      expect(rrule).toContain('EXDATE;TZID=Europe/Prague:20250120');
    });

    it('should handle repeat interval', () => {
      const event = {
        type: 'recurring',
        title: 'Bi-weekly',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        repeatInterval: 2,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('biweekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('INTERVAL=2');
    });
  });

  describe('rrule type event conversion (Google Calendar style)', () => {
    it('should convert rrule event with display timezone', () => {
      const event = {
        type: 'rrule',
        title: 'Football',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('football-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // Should have DTSTART with display timezone
      expect(rrule).toContain('DTSTART;TZID=Europe/Budapest');
    });

    it('should calculate correct duration for timed events', () => {
      const event = {
        type: 'rrule',
        title: 'Long Meeting',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '17:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('long-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.duration).toBeDefined();
      // Duration is returned as ISO time string
      expect(result!.duration).toBe('08:00');
    });

    it('should handle events crossing midnight', () => {
      const event = {
        type: 'rrule',
        title: 'Night Shift',
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        startDate: '2025-01-03',
        startTime: '22:00',
        endTime: '06:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('night-id', event, baseSettings);

      expect(result).not.toBeNull();
      // Duration should be 8 hours
      expect(result!.duration).toBe('08:00');
    });
  });

  describe('Display timezone conversion for rrule events', () => {
    it('should convert rrule event from source to display timezone', () => {
      const event = {
        type: 'rrule',
        title: 'Prague Event',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-06-05',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('prague-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('DTSTART;TZID=Europe/Budapest:20250605T080000');
    });

    it('should adjust time when converting between different offset timezones', () => {
      const event = {
        type: 'rrule',
        title: 'Tokyo Event',
        rrule: 'FREQ=DAILY',
        startDate: '2025-06-15',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('tokyo-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // 8:00 Tokyo (UTC+9) = 1:00 Prague (CEST, UTC+2)
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague:20250615T010000');
    });
  });

  describe('Category and extended properties', () => {
    it('should apply category coloring when enabled', () => {
      const event = {
        type: 'single',
        title: 'Categorized Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'Work',
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        enableAdvancedCategorization: true,
        categorySettings: [{ name: 'Work', color: '#ff0000' }]
      };

      const result = toEventInput('cat-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.color).toBe('#ff0000');
    });

    it('should include extended properties', () => {
      const event = {
        type: 'single',
        title: 'Full Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        uid: 'unique-123',
        category: 'Work',
        subCategory: 'Meeting',
        endDate: null
      } as OFCEvent;

      const result = toEventInput('full-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.extendedProps).toEqual(
        expect.objectContaining({
          uid: 'unique-123',
          category: 'Work',
          subCategory: 'Meeting',
          cleanTitle: 'Full Event',
          isShadow: false
        })
      );
    });
  });
});

describe('DST edge cases in RRULE generation', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Prague'
  };

  it('should maintain local time in RRULE across DST change', () => {
    const event = {
      type: 'recurring',
      title: 'Football Practice',
      startRecur: '2025-10-01',
      endRecur: '2025-11-30',
      startTime: '08:00',
      endTime: '09:30',
      daysOfWeek: ['T', 'R'],
      allDay: false,
      timezone: 'Europe/Prague'
    } as OFCEvent;

    const result = toEventInput('dst-football-id', event, baseSettings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    // DTSTART should specify 08:00 in Prague timezone
    expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
    expect(rrule).toContain('T080000');
  });

  it('should handle US timezone with different DST dates', () => {
    const event = {
      type: 'recurring',
      title: 'US Meeting',
      startRecur: '2025-03-01',
      startTime: '09:00',
      endTime: '10:00',
      daysOfWeek: ['M', 'W', 'F'],
      allDay: false,
      timezone: 'America/New_York'
    } as OFCEvent;

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      displayTimezone: 'America/New_York'
    };

    const result = toEventInput('us-meeting-id', event, settings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    expect(rrule).toContain('TZID=America/New_York');
    expect(rrule).toContain('T090000');
  });
});
