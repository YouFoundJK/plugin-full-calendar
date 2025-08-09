/**
 * @file RecurringEventManager.test.ts
 * @brief Tests for RecurringEventManager bug fixes
 */

import { OFCEvent } from '../../types';
import { RecurringEventManager } from './RecurringEventManager';
import EventCache from '../EventCache';
import { EditableCalendar } from '../../calendars/EditableCalendar';
import { CalendarInfo } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/settings';

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
jest.mock('../EventCache');
jest.mock('../../calendars/EditableCalendar');

describe('RecurringEventManager', () => {
  let manager: RecurringEventManager;
  let mockCache: jest.Mocked<EventCache>;
  let mockCalendar: jest.Mocked<EditableCalendar>;

  beforeEach(() => {
    // Create mock calendar
    mockCalendar = {
      id: 'test-calendar',
      getLocalIdentifier: jest.fn((event: OFCEvent) => event.title)
    } as any;

    // Create mock cache
    mockCache = {
      getEventById: jest.fn(),
      getInfoForEditableEvent: jest.fn(),
      updateEventWithId: jest.fn(),
      deleteEvent: jest.fn(),
      processEvent: jest.fn(),
      addEvent: jest.fn(),
      flushUpdateQueue: jest.fn(),
      getSessionId: jest.fn(),
      store: {
        getEventDetails: jest.fn(),
        getAllEvents: jest.fn()
      } as any,
      calendars: new Map([['test-calendar', mockCalendar]])
    } as any;

    manager = new RecurringEventManager(mockCache);
  });

  describe('toggleRecurringInstance - undoing completed task', () => {
    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Weekly Meeting',
      daysOfWeek: ['M'],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      isTask: true,
      skipDates: ['2023-11-20']
    };

    const originalOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      completed: '2023-11-20T10:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    const modifiedTimingOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '10:00', // Modified from 09:00
      endTime: '11:00', // Modified from 10:00
      completed: '2023-11-20T11:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    it('should delete override when timing is unchanged from original', async () => {
      // Setup: child override has original timing
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: originalOverrideEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should delete the override
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('child-event-id');
      expect(mockCache.updateEventWithId).not.toHaveBeenCalled();
    });

    it('should preserve override and change completion status when timing is modified', async () => {
      // Setup: child override has modified timing
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedTimingOverrideEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override but change completion status
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when endDate is modified', async () => {
      const modifiedEndDateOverride: OFCEvent = {
        ...originalOverrideEvent,
        endDate: '2023-11-21', // Multi-day event
        completed: '2023-11-20T10:00:00.000Z'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedEndDateOverride,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when allDay status is changed', async () => {
      const modifiedAllDayOverride: OFCEvent = {
        type: 'single',
        title: 'Weekly Meeting',
        date: '2023-11-20',
        endDate: null,
        allDay: true, // Changed from false
        completed: '2023-11-20T10:00:00.000Z',
        recurringEventId: 'Weekly Meeting'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedAllDayOverride,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });
  });

  describe('modifyRecurringInstance', () => {
    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Daily Standup',
      daysOfWeek: ['M', 'T', 'W', 'T', 'F'],
      allDay: false,
      startTime: '09:00',
      endTime: '09:30',
      isTask: false
    };

    beforeEach(() => {
      mockCache.getEventById.mockReturnValue(masterEvent);
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: masterEvent,
        calendar: mockCalendar,
        location: { path: 'recurring.md', lineNumber: 1 }
      });

      // Ensure masterEvent has skipDates property
      masterEvent.skipDates = masterEvent.skipDates || [];
    });

    it('should create override for single instance modification', async () => {
      const modifiedEvent: OFCEvent = {
        type: 'single',
        title: 'Daily Standup - Remote',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '10:30',
        recurringEventId: 'Daily Standup'
      };

      mockCache.addEvent.mockResolvedValue(true);

      await manager.modifyRecurringInstance('master-id', '2024-01-15', modifiedEvent);

      expect(mockCache.addEvent).toHaveBeenCalledWith('test-calendar', modifiedEvent);
      expect(mockCache.flushUpdateQueue).toHaveBeenCalled();
    });

    it('should handle override creation for task completion', async () => {
      const taskMasterEvent: OFCEvent = {
        ...masterEvent,
        isTask: true
      };

      mockCache.getEventById.mockReturnValue(taskMasterEvent);

      const completedOverride: OFCEvent = {
        type: 'single',
        title: 'Daily Standup',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '09:30',
        completed: '2024-01-15T09:30:00.000Z',
        recurringEventId: 'Daily Standup'
      };

      mockCache.addEvent.mockResolvedValue(true);

      await manager.modifyRecurringInstance('master-id', '2024-01-15', completedOverride);

      expect(mockCache.addEvent).toHaveBeenCalledWith('test-calendar', completedOverride);
    });

    it('should handle override creation failure gracefully', async () => {
      const modifiedEvent: OFCEvent = {
        type: 'single',
        title: 'Modified Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '10:30',
        recurringEventId: 'Daily Standup'
      };

      mockCache.addEvent.mockResolvedValue(false);

      const result = await manager.modifyRecurringInstance('master-id', '2024-01-15', modifiedEvent);

      expect(result).toBe(false);
      expect(mockCache.addEvent).toHaveBeenCalledWith('test-calendar', modifiedEvent);
    });
  });

  describe('handleDelete', () => {
    it('should handle deleting current instance when user chooses current', async () => {
      const singleEvent: OFCEvent = {
        type: 'single',
        title: 'Meeting Override',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00',
        recurringEventId: 'Weekly Meeting'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: singleEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });
      mockCache.getSessionId.mockResolvedValue('master-event-id');

      const result = await manager.handleDelete('override-id', singleEvent, { instanceDate: '2024-01-15' });

      expect(result).toBe(true);
      expect(mockCache.processEvent).toHaveBeenCalled();
    });

    it('should handle non-recurring event deletion', async () => {
      const singleEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00'
      };

      const result = await manager.handleDelete('event-id', singleEvent);

      expect(result).toBe(false); // Should return false for non-recurring events
    });

    it('should handle master recurring event deletion', async () => {
      const recurringEvent: OFCEvent = {
        type: 'recurring',
        title: 'Weekly Meeting',
        daysOfWeek: ['M'],
        allDay: false,
        startTime: '09:00',
        endTime: '10:00'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: recurringEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock finding children
      mockCache.store.getAllEvents.mockReturnValue([
        { id: 'child-1', calendarId: 'test-calendar', event: { recurringEventId: 'Weekly Meeting' } }
      ]);

      const result = await manager.handleDelete('master-id', recurringEvent);

      expect(result).toBe(true);
    });
  });

  describe('promoteRecurringChildren and deleteAllRecurring', () => {
    beforeEach(() => {
      const mockEvents = [
        { id: 'master-1', calendarId: 'test-calendar', event: { title: 'Master Event', recurringEventId: undefined } },
        { id: 'child-1', calendarId: 'test-calendar', event: { title: 'Override 1', recurringEventId: 'Master Event' } },
        { id: 'child-2', calendarId: 'test-calendar', event: { title: 'Override 2', recurringEventId: 'Master Event' } },
        { id: 'other-1', calendarId: 'test-calendar', event: { title: 'Other Event', recurringEventId: 'Different Master' } }
      ];

      mockCache.store.getAllEvents.mockReturnValue(mockEvents);
      mockCache.store.getEventDetails.mockImplementation((id) => {
        const event = mockEvents.find(e => e.id === id);
        return event ? { calendarId: event.calendarId, event: event.event } : null;
      });
      mockCalendar.getLocalIdentifier.mockImplementation((event: OFCEvent) => event.title);
    });

    it('should promote child events when deleting master', async () => {
      await manager.promoteRecurringChildren('master-1');

      expect(mockCache.processEvent).toHaveBeenCalledTimes(2);
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('master-1', { force: true, silent: true });
      expect(mockCache.flushUpdateQueue).toHaveBeenCalled();
    });

    it('should delete all recurring events and children', async () => {
      await manager.deleteAllRecurring('master-1');

      expect(mockCache.deleteEvent).toHaveBeenCalledWith('child-1', { force: true, silent: true });
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('child-2', { force: true, silent: true });
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('master-1', { force: true, silent: true });
      expect(mockCache.flushUpdateQueue).toHaveBeenCalled();
    });

    it('should handle master with no children', async () => {
      mockCache.store.getAllEvents.mockReturnValue([
        { id: 'master-1', calendarId: 'test-calendar', event: { title: 'Master Event', recurringEventId: undefined } }
      ]);

      await manager.promoteRecurringChildren('master-1');

      expect(mockCache.deleteEvent).toHaveBeenCalledWith('master-1', { force: true });
      expect(mockCache.processEvent).not.toHaveBeenCalled();
    });

    it('should handle calendar without getLocalIdentifier method', async () => {
      const calendarWithoutMethod = { 
        id: 'test',
        getLocalIdentifier: undefined  // Explicitly undefined
      } as any;
      
      mockCache.store.getEventDetails.mockReturnValue({
        calendarId: 'test-calendar',
        event: { title: 'Master Event', recurringEventId: undefined }
      });
      
      mockCache.calendars.set('test-calendar', calendarWithoutMethod);

      await manager.promoteRecurringChildren('master-1');

      // Should still delete the master even if no children are found
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('master-1', { force: true });
    });
  });

  describe('hasModifiedTiming', () => {
    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Regular Meeting',
      daysOfWeek: ['M'],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00'
    };

    it('should detect modified start time', () => {
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00', // Modified
        endTime: '10:00',
        recurringEventId: 'Regular Meeting'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, masterEvent, '2024-01-15');
      expect(result).toBe(true);
    });

    it('should detect modified end time', () => {
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '11:00', // Modified
        recurringEventId: 'Regular Meeting'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, masterEvent, '2024-01-15');
      expect(result).toBe(true);
    });

    it('should detect modified allDay status', () => {
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: true, // Modified
        recurringEventId: 'Regular Meeting'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, masterEvent, '2024-01-15');
      expect(result).toBe(true);
    });

    it('should detect modified endDate (multi-day)', () => {
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: '2024-01-16', // Multi-day
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        recurringEventId: 'Regular Meeting'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, masterEvent, '2024-01-15');
      expect(result).toBe(true);
    });

    it('should return false for unmodified timing', () => {
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Regular Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        recurringEventId: 'Regular Meeting'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, masterEvent, '2024-01-15');
      expect(result).toBe(false);
    });

    it('should handle single type override with non-recurring master', () => {
      const singleMaster: OFCEvent = {
        type: 'single',
        title: 'Single Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false
      };

      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Single Event',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        recurringEventId: 'Single Event'
      };

      const result = manager['hasModifiedTiming'](overrideEvent, singleMaster, '2024-01-15');
      expect(result).toBe(false);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing master event in toggleRecurringInstance', async () => {
      mockCache.getEventById.mockReturnValue(null);
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: { type: 'single' } as OFCEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      await manager.toggleRecurringInstance('child-id', '2024-01-15', false);

      // Should still update the event even without master
      expect(mockCache.updateEventWithId).toHaveBeenCalled();
    });

    it('should handle calendar retrieval failure', async () => {
      mockCache.getInfoForEditableEvent.mockReturnValue(null);

      const result = await manager.modifyRecurringInstance('master-id', '2024-01-15', {} as OFCEvent);

      expect(result).toBe(false);
      expect(mockCache.addEvent).not.toHaveBeenCalled();
    });

    it('should handle missing calendar in getInfoForEditableEvent', async () => {
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: {} as OFCEvent,
        calendar: null as any,
        location: { path: 'test.md', lineNumber: 1 }
      });

      const result = await manager.modifyRecurringInstance('master-id', '2024-01-15', {} as OFCEvent);

      expect(result).toBe(false);
    });
  });
});
