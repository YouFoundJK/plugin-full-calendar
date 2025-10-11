import { CalDAVProviderTS } from './CalDAVProviderTS';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';
import FullCalendarPlugin from '../../main';

// Mock the tsdav module
jest.mock('tsdav', () => ({
  createDAVClient: jest.fn()
}));

describe('CalDAVProviderTS', () => {
  let provider: CalDAVProviderTS;
  let mockPlugin: FullCalendarPlugin;
  let config: CalDAVProviderTSConfig;

  beforeEach(() => {
    config = {
      id: 'caldav-ts_1',
      name: 'Test Calendar',
      url: 'https://calendar.zoho.in/caldav/',
      homeUrl: 'https://calendar.zoho.in/caldav/123/events/',
      username: 'testuser',
      password: 'testpass'
    } as CalDAVProviderTSConfig;

    mockPlugin = {} as FullCalendarPlugin;
    provider = new CalDAVProviderTS(config, mockPlugin);
  });

  describe('Static properties', () => {
    it('should have correct type', () => {
      expect(CalDAVProviderTS.type).toBe('caldav-ts');
    });

    it('should have correct display name', () => {
      expect(CalDAVProviderTS.displayName).toBe('CalDAV (ts-dav)');
    });
  });

  describe('Instance properties', () => {
    it('should have correct type', () => {
      expect(provider.type).toBe('caldav-ts');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('CalDAV (ts-dav)');
    });

    it('should be marked as remote', () => {
      expect(provider.isRemote).toBe(true);
    });

    it('should have correct load priority', () => {
      expect(provider.loadPriority).toBe(110);
    });
  });

  describe('getCapabilities', () => {
    it('should return read-only capabilities', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.canCreate).toBe(false);
      expect(capabilities.canEdit).toBe(false);
      expect(capabilities.canDelete).toBe(false);
    });
  });

  describe('getEventHandle', () => {
    it('should return handle for event with uid', () => {
      const event: any = { uid: 'test-uid' };
      const handle = provider.getEventHandle(event);
      expect(handle).toEqual({ persistentId: 'test-uid' });
    });

    it('should return null for event without uid', () => {
      const event: any = {};
      const handle = provider.getEventHandle(event);
      expect(handle).toBeNull();
    });
  });

  describe('CRUD operations', () => {
    it('should throw error on createEvent', async () => {
      await expect(provider.createEvent({} as any)).rejects.toThrow(
        'Creating events on a CalDAV calendar is not yet supported.'
      );
    });

    it('should throw error on updateEvent', async () => {
      await expect(provider.updateEvent()).rejects.toThrow(
        'Updating events on a CalDAV calendar is not yet supported.'
      );
    });

    it('should throw error on deleteEvent', async () => {
      await expect(provider.deleteEvent()).rejects.toThrow(
        'Deleting events on a CalDAV calendar is not yet supported.'
      );
    });

    it('should throw error on createInstanceOverride', async () => {
      await expect(provider.createInstanceOverride()).rejects.toThrow(
        'Cannot create a recurring event override on a read-only calendar.'
      );
    });
  });

  describe('getEvents', () => {
    it('should use ts-dav to fetch calendar objects', async () => {
      const { createDAVClient } = require('tsdav');
      const mockFetchCalendarObjects = jest.fn().mockResolvedValue([
        {
          data: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20251015T100000Z
DTEND:20251015T110000Z
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`
        }
      ]);

      const mockClient = {
        fetchCalendarObjects: mockFetchCalendarObjects
      };

      (createDAVClient as jest.Mock).mockResolvedValue(mockClient);

      const events = await provider.getEvents();

      expect(createDAVClient).toHaveBeenCalledWith({
        serverUrl: config.url,
        credentials: {
          username: config.username,
          password: config.password
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      });

      expect(mockFetchCalendarObjects).toHaveBeenCalledWith({
        calendar: {
          url: config.homeUrl
        },
        timeRange: expect.objectContaining({
          start: expect.any(String),
          end: expect.any(String)
        })
      });

      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const { createDAVClient } = require('tsdav');
      (createDAVClient as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(provider.getEvents()).rejects.toThrow(
        'Failed to fetch events from CalDAV server: Network error'
      );
    });
  });
});
