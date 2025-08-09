/**
 * @file RecurringEventManager.test.ts
 * @brief Tests for RecurringEventManager public API
 */

import { Notice } from 'obsidian';
import { RecurringEventManager } from './RecurringEventManager';
import EventCache from '../EventCache';
import { OFCEvent } from '../../types';

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

// Mock DeleteRecurringModal
jest.mock('../../ui/modals/DeleteRecurringModal', () => ({
  DeleteRecurringModal: jest.fn()
}));

const mockNotice = Notice as jest.MockedFunction<typeof Notice>;

describe('RecurringEventManager', () => {
  let manager: RecurringEventManager;
  let mockCache: jest.Mocked<EventCache>;

  beforeEach(() => {
    // Create mock cache
    mockCache = {
      store: {
        getEvent: jest.fn(),
        getAllEventsFromCalendar: jest.fn().mockReturnValue([]),
        addEvent: jest.fn(),
        updateEvent: jest.fn(),
        removeEvent: jest.fn()
      },
      calendars: new Map(),
      addEvent: jest.fn().mockResolvedValue(true),
      updateEventWithId: jest.fn().mockResolvedValue(true),
      removeEventWithId: jest.fn().mockResolvedValue(true),
      flushUpdateQueue: jest.fn(),
      getEvent: jest.fn(),
      plugin: {
        app: {
          workspace: {
            getActiveViewOfType: jest.fn().mockReturnValue({
              getCalendar: jest.fn().mockReturnValue({
                getEventSourceById: jest.fn().mockReturnValue({
                  refetch: jest.fn()
                })
              })
            })
          }
        }
      }
    } as any;

    // Add mock calendar
    const mockCalendar = {
      id: 'test-calendar',
      type: 'fullnote',
      getLocalIdentifier: jest.fn().mockReturnValue('local-id'),
      createEvent: jest.fn().mockResolvedValue(true),
      updateEvent: jest.fn().mockResolvedValue(true),
      deleteEvent: jest.fn().mockResolvedValue(true)
    };
    mockCache.calendars.set('test-calendar', mockCalendar as any);

    manager = new RecurringEventManager(mockCache);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('handleDelete', () => {
    it('should handle single event deletion', async () => {
      const singleEvent: OFCEvent = {
        type: 'single',
        title: 'One-time Event',
        date: '2024-01-15',
        allDay: true
      };

      const result = await manager.handleDelete('event-id', singleEvent);

      expect(result).toBe(false); // Single events are not handled by this method
    });

    it('should handle recurring event deletion', async () => {
      const recurringEvent: OFCEvent = {
        type: 'recurring',
        title: 'Daily Standup',
        startRecur: '2024-01-01',
        daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
        allDay: false,
        startTime: '09:00',
        endTime: '09:30'
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event: recurringEvent
      });

      const result = await manager.handleDelete('master-id', recurringEvent);

      // The method shows a modal for user decision, so we can't predict the exact result
      expect(typeof result).toBe('boolean');
    });
  });

  describe('modifyRecurringInstance', () => {
    it('should handle invalid event type', async () => {
      const invalidEvent: OFCEvent = {
        type: 'recurring', // Invalid - should be 'single' for override
        title: 'Invalid Override',
        startRecur: '2024-01-01',
        daysOfWeek: ['M'],
        allDay: true
      };

      await expect(
        manager.modifyRecurringInstance('master-id', '2024-01-15', invalidEvent)
      ).rejects.toThrow('Cannot create a recurring override from a non-single event.');
    });

    it('should handle valid override creation', async () => {
      const masterEvent: OFCEvent = {
        type: 'recurring',
        title: 'Daily Standup',
        startRecur: '2024-01-01',
        daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
        allDay: false,
        startTime: '09:00',
        endTime: '09:30'
      };

      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Daily Standup - Remote',
        date: '2024-01-15',
        allDay: false,
        startTime: '10:00',
        endTime: '10:30',
        recurringEventId: 'Daily Standup'
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event: masterEvent
      });

      await manager.modifyRecurringInstance('master-id', '2024-01-15', overrideEvent);

      expect(mockCache.addEvent).toHaveBeenCalledWith(
        'test-calendar',
        expect.objectContaining({
          type: 'single',
          title: 'Daily Standup - Remote',
          recurringEventId: 'Daily Standup'
        }),
        { silent: true }
      );
      expect(mockCache.flushUpdateQueue).toHaveBeenCalled();
    });
  });

  describe('toggleRecurringInstance', () => {
    it('should handle task toggle for recurring instance', async () => {
      const masterEvent: OFCEvent = {
        type: 'recurring',
        title: 'Daily Task',
        startRecur: '2024-01-01',
        daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
        allDay: true,
        isTask: true
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event: masterEvent
      });

      await manager.toggleRecurringInstance('master-id', '2024-01-15');

      // The method should attempt to update the event
      expect(mockCache.addEvent).toHaveBeenCalled();
    });
  });

  describe('promoteRecurringChildren', () => {
    it('should handle promotion of child events', async () => {
      const masterEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2024-01-01',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar', 
        event: masterEvent
      });

      // Should not throw
      await expect(manager.promoteRecurringChildren('master-id')).resolves.not.toThrow();
    });
  });

  describe('deleteAllRecurring', () => {
    it('should handle deletion of all recurring instances', async () => {
      const masterEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2024-01-01',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event: masterEvent
      });

      // Should not throw
      await expect(manager.deleteAllRecurring('master-id')).resolves.not.toThrow();
    });
  });

  describe('updateRecurringChildren', () => {
    it('should handle updates to recurring children', async () => {
      const masterEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2024-01-01',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      mockCache.getEvent.mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event: masterEvent
      });

      // Should not throw
      await expect(
        manager.updateRecurringChildren('master-id', masterEvent)
      ).resolves.not.toThrow();
    });
  });

  describe('handleUpdate', () => {
    it('should handle update to recurring event', async () => {
      const oldEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2024-01-01',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      const newEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting - Updated',
        startRecur: '2024-01-01',
        daysOfWeek: ['M', 'W'],
        allDay: false,
        startTime: '15:00',
        endTime: '16:00'
      };

      // Should not throw
      await expect(
        manager.handleUpdate('master-id', oldEvent, newEvent)
      ).resolves.not.toThrow();
    });

    it('should handle non-recurring event updates', async () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'One-time Meeting',
        date: '2024-01-15',
        allDay: true
      };

      const newEvent: OFCEvent = {
        type: 'single',
        title: 'One-time Meeting - Updated',
        date: '2024-01-15',
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      };

      const result = await manager.handleUpdate('event-id', oldEvent, newEvent);

      expect(result).toBe(false); // Non-recurring events are not handled
    });
  });
});