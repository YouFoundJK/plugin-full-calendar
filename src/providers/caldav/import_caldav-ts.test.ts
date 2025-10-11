import { importCalendars } from './import_caldav-ts';
import { Authentication } from '../../types';

// Mock the tsdav module
jest.mock('tsdav', () => ({
  fetchCalendars: jest.fn(),
  getBasicAuthHeaders: jest.fn()
}));

describe('import_caldav-ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('importCalendars', () => {
    it('should discover calendars and return configurations', async () => {
      const { fetchCalendars, getBasicAuthHeaders } = require('tsdav');
      
      const mockAuthHeaders = { authorization: 'Basic dGVzdDp0ZXN0' };
      (getBasicAuthHeaders as jest.Mock).mockReturnValue(mockAuthHeaders);
      
      (fetchCalendars as jest.Mock).mockResolvedValue([
        {
          displayName: 'Personal Calendar',
          url: 'https://calendar.zoho.in/caldav/123/events/',
          description: 'My personal calendar',
          calendarColor: '#FF0000'
        },
        {
          displayName: 'Work Calendar',
          url: 'https://calendar.zoho.in/caldav/456/events/',
          description: 'Work-related events',
          calendarColor: '#0000FF'
        }
      ]);

      const auth: Authentication = {
        type: 'basic',
        username: 'testuser',
        password: 'testpass'
      };

      const url = 'https://calendar.zoho.in/caldav/';
      const existingIds: string[] = [];

      const configs = await importCalendars(auth, url, existingIds);

      expect(getBasicAuthHeaders).toHaveBeenCalled();
      
      expect(fetchCalendars).toHaveBeenCalledWith({
        account: expect.objectContaining({
          accountType: 'caldav',
          serverUrl: 'https://calendar.zoho.in/caldav/',
          rootUrl: 'https://calendar.zoho.in/caldav/',
          principalUrl: 'https://calendar.zoho.in/caldav/',
          homeUrl: 'https://calendar.zoho.in/caldav/',
          credentials: {
            username: 'testuser',
            password: 'testpass'
          }
        }),
        headers: mockAuthHeaders
      });

      expect(configs).toHaveLength(2);

      expect(configs[0]).toMatchObject({
        type: 'caldav-ts',
        name: 'Personal Calendar',
        url: 'https://calendar.zoho.in/caldav/',
        homeUrl: 'https://calendar.zoho.in/caldav/123/events/',
        username: 'testuser',
        password: 'testpass',
        color: '#888888'
      });

      expect(configs[1]).toMatchObject({
        type: 'caldav-ts',
        name: 'Work Calendar',
        url: 'https://calendar.zoho.in/caldav/',
        homeUrl: 'https://calendar.zoho.in/caldav/456/events/',
        username: 'testuser',
        password: 'testpass',
        color: '#888888'
      });

      expect(existingIds).toHaveLength(2);
    });

    it('should handle displayName as Record<string, unknown>', async () => {
      const { fetchCalendars, getBasicAuthHeaders } = require('tsdav');
      
      (getBasicAuthHeaders as jest.Mock).mockReturnValue({});
      
      (fetchCalendars as jest.Mock).mockResolvedValue([
        {
          displayName: { 'xml:lang': 'en', value: 'Complex Name' },
          url: 'https://calendar.zoho.in/caldav/123/events/'
        }
      ]);

      const auth: Authentication = {
        type: 'basic',
        username: 'testuser',
        password: 'testpass'
      };

      const url = 'https://calendar.zoho.in/caldav/';
      const existingIds: string[] = [];

      const configs = await importCalendars(auth, url, existingIds);

      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('Unnamed Calendar');
    });

    it('should handle URL with trailing slash', async () => {
      const { fetchCalendars, getBasicAuthHeaders } = require('tsdav');
      
      (getBasicAuthHeaders as jest.Mock).mockReturnValue({});
      
      (fetchCalendars as jest.Mock).mockResolvedValue([
        {
          displayName: 'Test Calendar',
          url: 'https://calendar.zoho.in/caldav/123/events'
        }
      ]);

      const auth: Authentication = {
        type: 'basic',
        username: 'testuser',
        password: 'testpass'
      };

      const url = 'https://calendar.zoho.in/caldav';
      const existingIds: string[] = [];

      const configs = await importCalendars(auth, url, existingIds);

      expect(configs[0].homeUrl).toBe('https://calendar.zoho.in/caldav/123/events/');
    });

    it('should throw error when no calendars found', async () => {
      const { fetchCalendars, getBasicAuthHeaders } = require('tsdav');
      
      (getBasicAuthHeaders as jest.Mock).mockReturnValue({});
      (fetchCalendars as jest.Mock).mockResolvedValue([]);

      const auth: Authentication = {
        type: 'basic',
        username: 'testuser',
        password: 'testpass'
      };

      const url = 'https://calendar.zoho.in/caldav/';
      const existingIds: string[] = [];

      await expect(importCalendars(auth, url, existingIds)).rejects.toThrow(
        'No calendars found on this CalDAV server.'
      );
    });

    it('should generate unique IDs for multiple calendars', async () => {
      const { fetchCalendars, getBasicAuthHeaders } = require('tsdav');
      
      (getBasicAuthHeaders as jest.Mock).mockReturnValue({});
      
      (fetchCalendars as jest.Mock).mockResolvedValue([
        {
          displayName: 'Calendar 1',
          url: 'https://calendar.zoho.in/caldav/123/events/'
        },
        {
          displayName: 'Calendar 2',
          url: 'https://calendar.zoho.in/caldav/456/events/'
        },
        {
          displayName: 'Calendar 3',
          url: 'https://calendar.zoho.in/caldav/789/events/'
        }
      ]);

      const auth: Authentication = {
        type: 'basic',
        username: 'testuser',
        password: 'testpass'
      };

      const url = 'https://calendar.zoho.in/caldav/';
      const existingIds: string[] = ['caldav-ts_1'];

      const configs = await importCalendars(auth, url, existingIds);

      expect(configs).toHaveLength(3);
      expect(configs[0].id).toBe('caldav-ts_2');
      expect(configs[1].id).toBe('caldav-ts_3');
      expect(configs[2].id).toBe('caldav-ts_4');
      expect(existingIds).toHaveLength(4);
    });
  });
});
