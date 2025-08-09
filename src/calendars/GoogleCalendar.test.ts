/**
 * @file GoogleCalendar.test.ts
 * @brief Comprehensive tests for GoogleCalendar functionality
 */

import { DateTime } from 'luxon';
import GoogleCalendar from './GoogleCalendar';
import FullCalendarPlugin from '../main';
import { CalendarInfo, OFCEvent } from '../types';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../types/settings';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: class {},
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
  }),
  { virtual: true }
);

// Mock dependencies
jest.mock('./parsing/google/request', () => ({
  makeAuthenticatedRequest: jest.fn()
}));

jest.mock('./parsing/google/auth', () => ({
  getGoogleAuthToken: jest.fn().mockResolvedValue('mock-token')
}));

jest.mock('./parsing/google/parser_gcal', () => ({
  fromGoogleEvent: jest.fn(),
  toGoogleEvent: jest.fn()
}));

jest.mock('./utils/Timezone', () => ({
  convertEvent: jest.fn((event, tz) => event)
}));

jest.mock('./parsing/categoryParser', () => ({
  enhanceEvent: jest.fn((event, provider, settings) => event)
}));

jest.mock('../types', () => ({
  validateEvent: jest.fn(event => event)
}));

import { makeAuthenticatedRequest } from './parsing/google/request';
import { getGoogleAuthToken } from './parsing/google/auth';
import { fromGoogleEvent, toGoogleEvent } from './parsing/google/parser_gcal';
import { convertEvent } from './utils/Timezone';
import { enhanceEvent } from './parsing/categoryParser';
import { validateEvent } from '../types';

const mockMakeAuthenticatedRequest = makeAuthenticatedRequest as jest.MockedFunction<typeof makeAuthenticatedRequest>;
const mockGetGoogleAuthToken = getGoogleAuthToken as jest.MockedFunction<typeof getGoogleAuthToken>;
const mockFromGoogleEvent = fromGoogleEvent as jest.MockedFunction<typeof fromGoogleEvent>;
const mockToGoogleEvent = toGoogleEvent as jest.MockedFunction<typeof toGoogleEvent>;
const mockConvertEvent = convertEvent as jest.MockedFunction<typeof convertEvent>;
const mockEnhanceEvent = enhanceEvent as jest.MockedFunction<typeof enhanceEvent>;
const mockValidateEvent = validateEvent as jest.MockedFunction<typeof validateEvent>;

describe('GoogleCalendar', () => {
  let calendar: GoogleCalendar;
  let mockPlugin: jest.Mocked<FullCalendarPlugin>;
  let calendarInfo: Extract<CalendarInfo, { type: 'google' }>;
  let settings: FullCalendarSettings;

  beforeEach(() => {
    // Create mock plugin
    mockPlugin = {
      app: {} as any,
      manifest: {} as any,
      settings: DEFAULT_SETTINGS
    } as any;

    // Create calendar info
    calendarInfo = {
      type: 'google',
      id: 'calendar-123',
      name: 'Test Google Calendar',
      color: 'blue',
      googleCalendarId: 'test@gmail.com'
    };

    // Create settings with timezone
    settings = {
      ...DEFAULT_SETTINGS,
      displayTimezone: 'America/New_York'
    };

    calendar = new GoogleCalendar(mockPlugin, calendarInfo, settings);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('basic properties', () => {
    it('should return correct type', () => {
      expect(calendar.type).toBe('google');
    });

    it('should return correct id with google prefix', () => {
      expect(calendar.id).toBe('google::calendar-123');
    });

    it('should return correct identifier', () => {
      expect(calendar.identifier).toBe('calendar-123');
    });

    it('should return correct name', () => {
      expect(calendar.name).toBe('Test Google Calendar');
    });
  });

  describe('getEvents', () => {
    it('should return empty array when no display timezone is set', async () => {
      const calendarWithoutTimezone = new GoogleCalendar(
        mockPlugin,
        calendarInfo,
        { ...settings, displayTimezone: undefined }
      );

      const events = await calendarWithoutTimezone.getEvents();

      expect(events).toEqual([]);
      expect(mockMakeAuthenticatedRequest).not.toHaveBeenCalled();
    });

    it('should fetch events from Google Calendar API', async () => {
      const mockGoogleEvents = {
        items: [
          {
            id: 'event-1',
            summary: 'Test Event',
            start: { dateTime: '2024-01-15T09:00:00Z' },
            end: { dateTime: '2024-01-15T10:00:00Z' }
          },
          {
            id: 'event-2',
            summary: 'All Day Event',
            start: { date: '2024-01-16' },
            end: { date: '2024-01-17' }
          }
        ]
      };

      const mockParsedEvents: OFCEvent[] = [
        {
          type: 'single',
          title: 'Test Event',
          date: '2024-01-15',
          endDate: null,
          allDay: false,
          startTime: '09:00',
          endTime: '10:00'
        },
        {
          type: 'single',
          title: 'All Day Event',
          date: '2024-01-16',
          endDate: '2024-01-17',
          allDay: true
        }
      ];

      mockMakeAuthenticatedRequest.mockResolvedValue(mockGoogleEvents);
      mockFromGoogleEvent.mockImplementation((event, index) => mockParsedEvents[index]);
      mockConvertEvent.mockImplementation(event => event);
      mockEnhanceEvent.mockImplementation(event => event);
      mockValidateEvent.mockImplementation(event => event);

      const events = await calendar.getEvents();

      expect(mockMakeAuthenticatedRequest).toHaveBeenCalledWith(
        mockPlugin,
        expect.stringContaining('https://www.googleapis.com/calendar/v3/calendars/calendar-123/events'),
        'GET'
      );

      expect(events).toHaveLength(2);
      expect(events[0][0]).toEqual(mockParsedEvents[0]);
      expect(events[1][0]).toEqual(mockParsedEvents[1]);

      // Verify timezone conversion was called
      expect(mockConvertEvent).toHaveBeenCalledTimes(2);
      expect(mockEnhanceEvent).toHaveBeenCalledTimes(2);
    });

    it('should handle API request failure gracefully', async () => {
      mockMakeAuthenticatedRequest.mockRejectedValue(new Error('API Error'));

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      mockMakeAuthenticatedRequest.mockRejectedValue(new Error('Network error'));

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should handle malformed API response', async () => {
      mockMakeAuthenticatedRequest.mockResolvedValue({ items: null });

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should skip invalid events during parsing', async () => {
      const mockGoogleEvents = {
        items: [
          {
            id: 'valid-event',
            summary: 'Valid Event',
            start: { dateTime: '2024-01-15T09:00:00Z' },
            end: { dateTime: '2024-01-15T10:00:00Z' }
          },
          {
            id: 'invalid-event',
            summary: null // Invalid event
          }
        ]
      };

      const validEvent: OFCEvent = {
        type: 'single',
        title: 'Valid Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00'
      };

      mockMakeAuthenticatedRequest.mockResolvedValue(mockGoogleEvents);

      mockFromGoogleEvent.mockImplementation((event, index) => {
        if (index === 0) return validEvent;
        throw new Error('Invalid event');
      });

      mockConvertEvent.mockImplementation(event => event);
      mockEnhanceEvent.mockImplementation(event => event);
      mockValidateEvent.mockImplementation(event => event);

      const events = await calendar.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual(validEvent);
    });

    it('should set correct date range for API request', async () => {
      mockMakeAuthenticatedRequest.mockResolvedValue({ items: [] });

      await calendar.getEvents();

      const [url] = mockMakeAuthenticatedRequest.mock.calls[0];
      const urlObj = new URL(url);

      expect(urlObj.searchParams.get('singleEvents')).toBe('false');
      expect(urlObj.searchParams.has('timeMin')).toBe(true);
      expect(urlObj.searchParams.has('timeMax')).toBe(true);

      // Verify it's approximately a 2-year range (1 year in past, 1 year in future)
      const timeMin = new Date(urlObj.searchParams.get('timeMin')!);
      const timeMax = new Date(urlObj.searchParams.get('timeMax')!);
      const yearDifference = timeMax.getFullYear() - timeMin.getFullYear();
      expect(yearDifference).toBe(2);
    });
  });

  describe('createEvent', () => {
    it('should create event via Google Calendar API', async () => {
      const newEvent: OFCEvent = {
        type: 'single',
        title: 'New Test Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      const googleEventData = {
        summary: 'New Test Event',
        start: { dateTime: '2024-01-15T14:00:00-05:00' },
        end: { dateTime: '2024-01-15T15:00:00-05:00' }
      };

      const createdGoogleEvent = {
        ...googleEventData,
        id: 'new-event-123'
      };

      const expectedEvent: OFCEvent = {
        ...newEvent,
        uid: 'new-event-123'
      };

      mockToGoogleEvent.mockReturnValue(JSON.stringify(googleEventData));
      mockMakeAuthenticatedRequest.mockResolvedValue(createdGoogleEvent);
      mockFromGoogleEvent.mockReturnValue(expectedEvent);
      mockEnhanceEvent.mockReturnValue(expectedEvent);

      const result = await calendar.createEvent(newEvent);

      expect(mockToGoogleEvent).toHaveBeenCalledWith(newEvent);
      expect(mockMakeAuthenticatedRequest).toHaveBeenCalledWith(
        mockPlugin,
        expect.stringContaining('/events'),
        'POST',
        JSON.stringify(googleEventData)
      );

      expect(result).toEqual([expectedEvent, null]);
    });

    it('should handle creation failure', async () => {
      const newEvent: OFCEvent = {
        type: 'single',
        title: 'Failed Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      mockToGoogleEvent.mockReturnValue('{}');
      mockMakeAuthenticatedRequest.mockResolvedValue(null);

      await expect(calendar.createEvent(newEvent)).rejects.toThrow(
        'Failed to create Google Calendar event. The API returned an empty response.'
      );
    });

    it('should handle network errors during creation', async () => {
      const newEvent: OFCEvent = {
        type: 'single',
        title: 'Network Error Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      mockToGoogleEvent.mockReturnValue('{}');
      mockMakeAuthenticatedRequest.mockRejectedValue(new Error('Network timeout'));

      await expect(calendar.createEvent(newEvent)).rejects.toThrow('Network timeout');
    });

    it('should handle invalid response parsing', async () => {
      const newEvent: OFCEvent = {
        type: 'single',
        title: 'Parse Error Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      mockToGoogleEvent.mockReturnValue('{}');
      mockMakeAuthenticatedRequest.mockResolvedValue({ id: 'test' });
      mockFromGoogleEvent.mockReturnValue(null);

      await expect(calendar.createEvent(newEvent)).rejects.toThrow(
        "Could not parse the event returned by Google's API after creation."
      );
    });
  });

  describe('modifyEvent', () => {
    it('should update event via Google Calendar API', async () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        uid: 'event-123'
      };

      const newEvent: OFCEvent = {
        type: 'single',
        title: 'Updated Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00',
        uid: 'event-123'
      };

      const location = null;

      const googleEventData = JSON.stringify({
        summary: 'Updated Event',
        start: { dateTime: '2024-01-15T10:00:00-05:00' },
        end: { dateTime: '2024-01-15T11:00:00-05:00' }
      });

      mockToGoogleEvent.mockReturnValue(googleEventData);
      mockMakeAuthenticatedRequest.mockResolvedValue({});

      const updateCallback = jest.fn();
      const result = await calendar.modifyEvent(oldEvent, newEvent, location, updateCallback);

      expect(mockToGoogleEvent).toHaveBeenCalledWith(newEvent);
      expect(mockMakeAuthenticatedRequest).toHaveBeenCalledWith(
        mockPlugin,
        expect.stringContaining('/events/event-123'),
        'PUT',
        googleEventData
      );

      expect(updateCallback).toHaveBeenCalledWith(null);
      expect(result).toEqual({ isDirty: false });
    });

    it('should handle modification failure due to missing UID', async () => {
      const oldEvent: OFCEvent = { type: 'single', title: 'Old', date: '2024-01-15', endDate: null, allDay: true };
      const newEvent: OFCEvent = { type: 'single', title: 'New', date: '2024-01-15', endDate: null, allDay: true };
      const location = null;

      const updateCallback = jest.fn();

      await expect(calendar.modifyEvent(oldEvent, newEvent, location, updateCallback)).rejects.toThrow(
        'Cannot modify a Google event without a UID/ID.'
      );
    });

    it('should handle skip date changes (instance cancellation)', async () => {
      const oldEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        uid: 'recurring-123',
        skipDates: []
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        skipDates: ['2024-01-15'] // New skip date
      };

      // Mock the cancelInstance method by adding it to the calendar
      (calendar as any).cancelInstance = jest.fn().mockResolvedValue(undefined);

      const updateCallback = jest.fn();
      const result = await calendar.modifyEvent(oldEvent, newEvent, null, updateCallback);

      expect((calendar as any).cancelInstance).toHaveBeenCalledWith(oldEvent, '2024-01-15');
      expect(updateCallback).toHaveBeenCalledWith(null);
      expect(result).toEqual({ isDirty: false });
    });
  });

  describe('deleteEvent', () => {
    it('should delete event via Google Calendar API', async () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Event to Delete',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'event-123'
      };

      const location = null;

      mockMakeAuthenticatedRequest.mockResolvedValue({});

      await calendar.deleteEvent(event, location);

      expect(mockMakeAuthenticatedRequest).toHaveBeenCalledWith(
        mockPlugin,
        expect.stringContaining('/events/event-123'),
        'DELETE'
      );
    });

    it('should handle deletion failure due to missing UID', async () => {
      const event: OFCEvent = { type: 'single', title: 'Event', date: '2024-01-15', endDate: null, allDay: true };
      const location = null;

      await expect(calendar.deleteEvent(event, location)).rejects.toThrow(
        'Cannot delete a Google event without a UID.'
      );
    });

    it('should handle network errors during deletion', async () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'event-123'
      };

      mockMakeAuthenticatedRequest.mockRejectedValue(new Error('Network error'));

      await expect(calendar.deleteEvent(event, null)).rejects.toThrow('Network error');
    });
  });

  describe('getLocalIdentifier', () => {
    it('should return event UID as local identifier', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test Event Title',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'google-event-id-123'
      };

      const identifier = calendar.getLocalIdentifier(event);

      expect(identifier).toBe('google-event-id-123');
    });

    it('should return null for events without UID', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Event without UID',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const identifier = calendar.getLocalIdentifier(event);

      expect(identifier).toBe(null);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle API response without items array', async () => {
      mockMakeAuthenticatedRequest.mockResolvedValue({});

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should handle parsing errors during event conversion', async () => {
      const mockGoogleEvents = {
        items: [
          {
            id: 'event-1',
            summary: 'Test Event'
          }
        ]
      };

      mockMakeAuthenticatedRequest.mockResolvedValue(mockGoogleEvents);

      mockFromGoogleEvent.mockImplementation(() => {
        throw new Error('Parsing error');
      });

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should handle timezone conversion errors', async () => {
      const mockGoogleEvents = {
        items: [
          {
            id: 'event-1',
            summary: 'Test Event',
            start: { dateTime: '2024-01-15T09:00:00Z' },
            end: { dateTime: '2024-01-15T10:00:00Z' }
          }
        ]
      };

      const mockParsedEvent: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00'
      };

      mockMakeAuthenticatedRequest.mockResolvedValue(mockGoogleEvents);

      mockFromGoogleEvent.mockReturnValue(mockParsedEvent);
      mockConvertEvent.mockImplementation(() => {
        throw new Error('Timezone conversion failed');
      });

      const events = await calendar.getEvents();

      expect(events).toEqual([]);
    });

    it('should test checkForDuplicate method', async () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const result = await calendar.checkForDuplicate(event);

      expect(result).toBe(false);
    });

    it('should test bulk category methods', async () => {
      const getCategory = jest.fn();
      const knownCategories = new Set(['cat1', 'cat2']);

      // These are no-ops for Google Calendar
      await calendar.bulkAddCategories(getCategory, false);
      await calendar.bulkRemoveCategories(knownCategories);

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should test directory and path methods', () => {
      expect(calendar.directory).toBe('');
      expect(calendar.containsPath('/some/path')).toBe(false);
    });

    it('should test getEventsInFile method', async () => {
      const mockFile = {} as any;
      const result = await calendar.getEventsInFile(mockFile);

      expect(result).toEqual([]);
    });
  });
});