/**
 * @file Timezone.test.ts
 * @brief Comprehensive tests for timezone management functionality
 */

import { DateTime } from 'luxon';
import { Notice } from 'obsidian';
import { convertEvent, manageTimezone } from './Timezone';
import { OFCEvent } from '../../types';
import FullCalendarPlugin from '../../main';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
  }),
  { virtual: true }
);

// Mock DateTime to control timezone operations
jest.mock('luxon', () => {
  const actualLuxon = jest.requireActual('luxon');
  return {
    ...actualLuxon,
    DateTime: {
      ...actualLuxon.DateTime,
      fromFormat: jest.fn(),
      fromISO: jest.fn(),
      now: jest.fn()
    }
  };
});

const mockNotice = Notice as jest.MockedFunction<typeof Notice>;
const mockDateTime = DateTime as jest.Mocked<typeof DateTime>;

describe('Timezone Management', () => {
  let mockPlugin: jest.Mocked<FullCalendarPlugin>;

  beforeEach(() => {
    // Create mock plugin
    mockPlugin = {
      app: {} as any,
      manifest: {} as any,
      settings: {
        displayTimezone: 'America/New_York',
        lastSystemTimezone: null
      },
      saveSettings: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('convertEvent', () => {
    describe('all-day events', () => {
      it('should return all-day events unchanged', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'All Day Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result).toEqual(event);
        expect(result).not.toBe(event); // Should be a new object
      });

      it('should handle multi-day all-day events', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Multi-day Event',
          date: '2024-01-15',
          endDate: '2024-01-17',
          allDay: true
        };

        const result = convertEvent(event, 'America/New_York', 'Asia/Tokyo');

        expect(result).toEqual(event);
      });
    });

    describe('single timed events', () => {
      beforeEach(() => {
        // Mock successful time parsing
        const mockParsedTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('14:30')
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockParsedTime);

        // Mock timezone conversion
        const mockConvertedDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-15'),
          toFormat: jest.fn().mockReturnValue('19:30'),
          setZone: jest.fn().mockReturnThis()
        } as any;

        mockDateTime.fromISO.mockReturnValue({
          setZone: jest.fn().mockReturnValue(mockConvertedDateTime)
        } as any);
      });

      it('should convert single event times correctly', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Meeting',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30',
          endTime: '15:30'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(mockDateTime.fromFormat).toHaveBeenCalledWith('14:30', 'HH:mm');
        expect(result.startTime).toBe('19:30');
        expect(result.endTime).toBe('19:30');
        expect(result.date).toBe('2024-01-15');
      });

      it('should handle events without end time', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Quick Meeting',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.startTime).toBe('19:30');
        expect(result.endTime).toBeUndefined();
      });

      it('should handle events spanning multiple days after conversion', () => {
        // Mock end time conversion to next day
        const mockEndDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-16'),
          toFormat: jest.fn().mockReturnValue('02:30'),
          setZone: jest.fn().mockReturnThis()
        } as any;

        mockDateTime.fromISO.mockImplementation((iso: string) => ({
          setZone: jest.fn().mockReturnValue(
            iso.includes('23:30') ? mockEndDateTime : {
              toISODate: jest.fn().mockReturnValue('2024-01-15'),
              toFormat: jest.fn().mockReturnValue('19:30'),
              setZone: jest.fn().mockReturnThis()
            }
          )
        } as any));

        const event: OFCEvent = {
          type: 'single',
          title: 'Late Meeting',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30',
          endTime: '23:30'
        };

        const result = convertEvent(event, 'America/New_York', 'Asia/Tokyo');

        expect(result.date).toBe('2024-01-15');
        expect(result.endDate).toBe('2024-01-16');
      });

      it('should handle multi-day events with explicit end date', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Conference',
          date: '2024-01-15',
          endDate: '2024-01-16',
          allDay: false,
          startTime: '09:00',
          endTime: '17:00'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.date).toBe('2024-01-15');
        expect(result.endDate).toBe('2024-01-15'); // Assuming same day after conversion
      });
    });

    describe('recurring events', () => {
      beforeEach(() => {
        const mockParsedTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('19:30')
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockParsedTime);
      });

      it('should convert recurring event times', () => {
        const event: OFCEvent = {
          type: 'recurring',
          title: 'Weekly Standup',
          daysOfWeek: ['M', 'W', 'F'],
          allDay: false,
          startTime: '14:30',
          endTime: '15:00'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.startTime).toBe('19:30');
        expect(result.endTime).toBe('19:30');
        expect(result.daysOfWeek).toEqual(['M', 'W', 'F']);
      });

      it('should handle all-day recurring events', () => {
        const event: OFCEvent = {
          type: 'recurring',
          title: 'Daily Reminder',
          daysOfWeek: ['M', 'T', 'W', 'T', 'F'],
          allDay: true
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result).toEqual(event);
      });

      it('should handle recurring events with skip dates', () => {
        const event: OFCEvent = {
          type: 'recurring',
          title: 'Weekly Meeting',
          daysOfWeek: ['M'],
          allDay: false,
          startTime: '10:00',
          endTime: '11:00',
          skipDates: ['2024-01-15', '2024-01-22']
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.skipDates).toEqual(['2024-01-15', '2024-01-22']);
        expect(result.startTime).toBe('19:30');
      });
    });

    describe('rrule events', () => {
      beforeEach(() => {
        const mockParsedTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('08:00')
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockParsedTime);
      });

      it('should convert rrule event times', () => {
        const event: OFCEvent = {
          type: 'rrule',
          title: 'Monthly Report',
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
          allDay: false,
          startTime: '03:00',
          endTime: '04:00'
        };

        const result = convertEvent(event, 'America/Los_Angeles', 'America/New_York');

        expect(result.startTime).toBe('08:00');
        expect(result.endTime).toBe('08:00');
        expect(result.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=1');
      });

      it('should handle all-day rrule events', () => {
        const event: OFCEvent = {
          type: 'rrule',
          title: 'Monthly Holiday',
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
          allDay: true
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result).toEqual(event);
      });
    });

    describe('error handling', () => {
      it('should handle invalid start time gracefully', () => {
        const mockInvalidTime = {
          isValid: false
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockInvalidTime);

        const event: OFCEvent = {
          type: 'single',
          title: 'Invalid Time Event',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: 'invalid-time',
          endTime: '15:00'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result).toEqual(event);
      });

      it('should handle invalid end time gracefully', () => {
        const mockValidStartTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('14:30')
        } as any;

        const mockInvalidEndTime = {
          isValid: false
        } as any;

        mockDateTime.fromFormat.mockImplementation((time: string) => {
          if (time === '14:30') return mockValidStartTime;
          return mockInvalidEndTime;
        });

        const mockConvertedDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-15'),
          toFormat: jest.fn().mockReturnValue('19:30')
        } as any;

        mockDateTime.fromISO.mockReturnValue({
          setZone: jest.fn().mockReturnValue(mockConvertedDateTime)
        } as any);

        const event: OFCEvent = {
          type: 'single',
          title: 'Partial Invalid Event',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30',
          endTime: 'invalid-end'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.startTime).toBe('19:30');
        expect(result.endTime).toBe('invalid-end'); // Should remain unchanged
      });

      it('should handle 12-hour time format', () => {
        const mockValidTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('14:30')
        } as any;

        const mockInvalidTime = {
          isValid: false
        } as any;

        mockDateTime.fromFormat.mockImplementation((time: string, format: string) => {
          if (format === 'HH:mm') return mockInvalidTime;
          if (format === 'h:mm a') return mockValidTime;
          return mockInvalidTime;
        });

        const mockConvertedDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-15'),
          toFormat: jest.fn().mockReturnValue('19:30')
        } as any;

        mockDateTime.fromISO.mockReturnValue({
          setZone: jest.fn().mockReturnValue(mockConvertedDateTime)
        } as any);

        const event: OFCEvent = {
          type: 'single',
          title: '12-hour Format Event',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '2:30 PM',
          endTime: '3:30 PM'
        };

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(mockDateTime.fromFormat).toHaveBeenCalledWith('2:30 PM', 'HH:mm');
        expect(mockDateTime.fromFormat).toHaveBeenCalledWith('2:30 PM', 'h:mm a');
        expect(result.startTime).toBe('19:30');
      });
    });

    describe('edge cases', () => {
      it('should handle same source and target timezone', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Same Timezone Event',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30',
          endTime: '15:30'
        };

        const mockParsedTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('14:30')
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockParsedTime);

        const mockConvertedDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-15'),
          toFormat: jest.fn().mockReturnValue('14:30')
        } as any;

        mockDateTime.fromISO.mockReturnValue({
          setZone: jest.fn().mockReturnValue(mockConvertedDateTime)
        } as any);

        const result = convertEvent(event, 'America/New_York', 'America/New_York');

        expect(result.startTime).toBe('14:30');
        expect(result.endTime).toBe('14:30');
      });

      it('should preserve event properties not related to time', () => {
        const event: OFCEvent = {
          type: 'single',
          title: 'Event with Extra Props',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '14:30',
          endTime: '15:30',
          isTask: true,
          completed: false,
          color: 'red',
          uid: 'unique-id-123'
        };

        const mockParsedTime = {
          isValid: true,
          toFormat: jest.fn().mockReturnValue('19:30')
        } as any;

        mockDateTime.fromFormat.mockReturnValue(mockParsedTime);

        const mockConvertedDateTime = {
          toISODate: jest.fn().mockReturnValue('2024-01-15'),
          toFormat: jest.fn().mockReturnValue('19:30')
        } as any;

        mockDateTime.fromISO.mockReturnValue({
          setZone: jest.fn().mockReturnValue(mockConvertedDateTime)
        } as any);

        const result = convertEvent(event, 'America/New_York', 'Europe/London');

        expect(result.isTask).toBe(true);
        expect(result.completed).toBe(false);
        expect(result.color).toBe('red');
        expect(result.uid).toBe('unique-id-123');
        expect(result.title).toBe('Event with Extra Props');
      });
    });
  });

  describe('manageTimezone', () => {
    beforeEach(() => {
      // Mock system timezone detection
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        value: jest.fn().mockReturnValue({ timeZone: 'America/Chicago' })
      });
    });

    it('should detect system timezone change and show notice', async () => {
      mockPlugin.settings.lastSystemTimezone = 'America/New_York';

      await manageTimezone(mockPlugin);

      expect(mockNotice).toHaveBeenCalledWith(
        expect.stringContaining('system timezone has changed')
      );
      expect(mockPlugin.settings.lastSystemTimezone).toBe('America/Chicago');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should not show notice when timezone has not changed', async () => {
      mockPlugin.settings.lastSystemTimezone = 'America/Chicago';

      await manageTimezone(mockPlugin);

      expect(mockNotice).not.toHaveBeenCalled();
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should initialize lastSystemTimezone on first run', async () => {
      mockPlugin.settings.lastSystemTimezone = null;

      await manageTimezone(mockPlugin);

      expect(mockNotice).not.toHaveBeenCalled();
      expect(mockPlugin.settings.lastSystemTimezone).toBe('America/Chicago');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should handle undefined lastSystemTimezone', async () => {
      mockPlugin.settings.lastSystemTimezone = undefined;

      await manageTimezone(mockPlugin);

      expect(mockNotice).not.toHaveBeenCalled();
      expect(mockPlugin.settings.lastSystemTimezone).toBe('America/Chicago');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should handle timezone detection errors gracefully', async () => {
      // Mock timezone detection failure
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        value: jest.fn().mockImplementation(() => {
          throw new Error('Timezone detection failed');
        })
      });

      await expect(manageTimezone(mockPlugin)).resolves.not.toThrow();
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should handle notice creation failure gracefully', async () => {
      mockPlugin.settings.lastSystemTimezone = 'America/New_York';
      mockNotice.mockImplementation(() => {
        throw new Error('Notice creation failed');
      });

      await expect(manageTimezone(mockPlugin)).resolves.not.toThrow();
      expect(mockPlugin.settings.lastSystemTimezone).toBe('America/Chicago');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex multi-timezone event conversion', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'International Meeting',
        date: '2024-06-15', // During DST
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '16:00'
      };

      // Mock time parsing and conversion for DST scenario
      const mockStartTime = {
        isValid: true,
        toFormat: jest.fn().mockReturnValue('14:00')
      } as any;

      const mockEndTime = {
        isValid: true,
        toFormat: jest.fn().mockReturnValue('16:00')
      } as any;

      mockDateTime.fromFormat.mockImplementation((time: string) => {
        if (time === '14:00') return mockStartTime;
        if (time === '16:00') return mockEndTime;
        return { isValid: false } as any;
      });

      const mockStartConverted = {
        toISODate: jest.fn().mockReturnValue('2024-06-15'),
        toFormat: jest.fn().mockReturnValue('19:00') // +5 hours for BST
      } as any;

      const mockEndConverted = {
        toISODate: jest.fn().mockReturnValue('2024-06-15'),
        toFormat: jest.fn().mockReturnValue('21:00') // +5 hours for BST
      } as any;

      mockDateTime.fromISO.mockImplementation((iso: string) => ({
        setZone: jest.fn().mockReturnValue(
          iso.includes('14:00') ? mockStartConverted : mockEndConverted
        )
      } as any));

      const result = convertEvent(event, 'America/New_York', 'Europe/London');

      expect(result.startTime).toBe('19:00');
      expect(result.endTime).toBe('21:00');
      expect(result.date).toBe('2024-06-15');
    });

    it('should handle winter/summer time transitions', () => {
      const winterEvent: OFCEvent = {
        type: 'single',
        title: 'Winter Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      const summerEvent: OFCEvent = {
        type: 'single',
        title: 'Summer Meeting',
        date: '2024-07-15',
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      // Mock different timezone offsets for winter vs summer
      const mockWinterTime = {
        isValid: true,
        toFormat: jest.fn().mockReturnValue('14:00')
      } as any;

      mockDateTime.fromFormat.mockReturnValue(mockWinterTime);

      const mockWinterConverted = {
        toISODate: jest.fn().mockReturnValue('2024-01-15'),
        toFormat: jest.fn().mockReturnValue('19:00') // +5 hours GMT
      } as any;

      const mockSummerConverted = {
        toISODate: jest.fn().mockReturnValue('2024-07-15'),
        toFormat: jest.fn().mockReturnValue('19:00') // +5 hours BST (but would be different in reality)
      } as any;

      mockDateTime.fromISO.mockImplementation((iso: string) => ({
        setZone: jest.fn().mockReturnValue(
          iso.includes('2024-01-15') ? mockWinterConverted : mockSummerConverted
        )
      } as any));

      const winterResult = convertEvent(winterEvent, 'America/New_York', 'Europe/London');
      const summerResult = convertEvent(summerEvent, 'America/New_York', 'Europe/London');

      expect(winterResult.startTime).toBe('19:00');
      expect(summerResult.startTime).toBe('19:00');
    });
  });
});