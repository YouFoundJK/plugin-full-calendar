/**
 * @jest-environment jsdom
 */
import { CalDAVProvider } from './CalDAVProvider';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { fetchCalendarInfo } from './helper_caldav';
import { importCalendars } from './import_caldav';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';

// Mock obsidianFetch
jest.mock('./obsidian-fetch_caldav', () => ({
  obsidianFetch: jest.fn()
}));

const mockObsidianFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

describe('CalDAVProvider', () => {
  let provider: CalDAVProvider;
  let mockPlugin: FullCalendarPlugin;
  const mockConfig: CalDAVProviderConfig = {
    id: 'caldav_1',
    name: 'Test Calendar',
    url: 'https://example.com/caldav/',
    homeUrl: 'https://example.com/caldav/user/calendar/events/',
    username: 'user',
    password: 'password'
  };

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
    provider = new CalDAVProvider(mockConfig, mockPlugin);
    mockObsidianFetch.mockReset();
  });

  it('should fetch events using a single REPORT request after validating URL', async () => {
    const mockPropfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    const mockReportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/event1.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"12345"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1
SUMMARY:Test Event 1
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
END:VEVENT
END:VCALENDAR
</c:calendar-data>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response) // First call: PROPFIND
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockReportResponse)
      } as Response); // Second call: REPORT

    const events = await provider.getEvents();

    expect(mockObsidianFetch).toHaveBeenCalledTimes(2);

    // Verify PROPFIND
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Depth: '0'
        }) as Record<string, unknown>
      })
    );

    // Verify REPORT
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'REPORT',
        headers: expect.objectContaining({
          Depth: '1'
        }) as Record<string, unknown>,
        body: expect.stringContaining('<c:calendar-data/>') as string
      })
    );

    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('Test Event 1');
  });

  it('should throw error if URL is not a calendar collection', async () => {
    const mockPropfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <!-- No calendar tag -->
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(mockPropfindResponse)
    } as Response);

    await expect(provider.getEvents()).rejects.toThrow('Invalid collection URL or not a calendar');
  });
});

describe('fetchCalendarInfo', () => {
  beforeEach(() => {
    mockObsidianFetch.mockReset();
  });

  it('returns isCalendar=true with displayName and color from a full PROPFIND response', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:href>/cal/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Work Calendar</d:displayname>
              <ical:calendar-color>#FF5733FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/', {
      username: 'user',
      password: 'pass'
    });

    expect(result.isCalendar).toBe(true);
    expect(result.displayName).toBe('Work Calendar');
    expect(result.color).toBe('#FF5733'); // alpha stripped
  });

  it('passes through a 6-digit hex color without modification', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Personal</d:displayname>
              <ical:calendar-color>#3A86FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.color).toBe('#3A86FF');
  });

  it('returns undefined displayName and color when server omits them', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.isCalendar).toBe(true);
    expect(result.displayName).toBeUndefined();
    expect(result.color).toBeUndefined();
  });

  it('returns isCalendar=false when resourcetype is not a calendar', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
              <d:displayname>Files</d:displayname>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/files/');
    expect(result.isCalendar).toBe(false);
  });

  it('returns isCalendar=false on HTTP error', async () => {
    mockObsidianFetch.mockResolvedValueOnce({
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/', {
      username: 'bad',
      password: 'creds'
    });
    expect(result.isCalendar).toBe(false);
  });

  it('handles color values without a leading # prefix', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <ical:calendar-color>FF5733FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.color).toBe('#FF5733');
  });
});

describe('importCalendars', () => {
  beforeEach(() => {
    mockObsidianFetch.mockReset();
  });

  it('uses server-provided name and color when available', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Home</d:displayname>
              <ical:calendar-color>#AABBCCDD</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const sources = await importCalendars(
      { type: 'basic', username: 'u', password: 'p' },
      'https://example.com/cal/',
      []
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('Home');
    expect(sources[0].color).toBe('#AABBCC'); // alpha stripped
  });

  it('falls back to defaults when server omits name and color', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const sources = await importCalendars(
      { type: 'basic', username: 'u', password: 'p' },
      'https://example.com/cal/',
      []
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('CalDAV Calendar');
    expect(sources[0].color).toBe('#888888');
  });

  it('throws when the URL is not a calendar collection', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    await expect(
      importCalendars(
        { type: 'basic', username: 'u', password: 'p' },
        'https://example.com/files/',
        []
      )
    ).rejects.toThrow('does not appear to be a valid CalDAV calendar collection');
  });
});
