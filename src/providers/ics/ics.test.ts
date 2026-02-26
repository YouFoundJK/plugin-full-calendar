import { getEventsFromICS } from './ics';

describe('ics tests', () => {
  it('parses all day event', () => {
    const ics = `BEGIN:VCALENDAR
PRODID:blah
X-WR-CALNAME:Test calendar
X-WR-TIMEZONE:Etc/UTC
VERSION:2.0
CALSCALE:GREGORIAN
X-PUBLISHED-TTL:PT5M
METHOD:PUBLISH
BEGIN:VEVENT
UID:7389432083-0-40713-74006
SEQUENCE:1
CLASS:PUBLIC
CREATED:20200101T000000Z
GEO:40.7128;-74.006
DTSTAMP:20230226T143136Z
DTSTART;VALUE=DATE:20230226
DESCRIPTION:Description!
LOCATION:New york city
URL:https://www.example.com
STATUS:CONFIRMED
SUMMARY:EVENT TITLE
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR`;
    const events = getEventsFromICS(ics);
    expect(events).toMatchSnapshot(ics);
  });

  it('parses gcal ics file and categories', () => {
    const ics = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Obsidian Test Calendar
X-WR-TIMEZONE:America/New_York
BEGIN:VTIMEZONE
TZID:America/New_York
X-LIC-LOCATION:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220302
DTEND;VALUE=DATE:20220303
DTSTAMP:20230302T233513Z
UID:5r09pnnlktaqivstai5vlbqb1h@google.com
CREATED:20220226T211158Z
DESCRIPTION:
LAST-MODIFIED:20220226T214634Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:All day event
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20220301T110000
DTEND;TZID=America/New_York:20220301T123000
RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TH,TU
DTSTAMP:20230302T233513Z
UID:5tt2avr2th0h65homv3b6jeqof@google.com
CREATED:20220226T211144Z
DESCRIPTION:
LAST-MODIFIED:20220226T214627Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Work - Recurring event
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220228T164500Z
DTEND:20220228T194500Z
DTSTAMP:20230302T233513Z
UID:40mdbe6fvc1rmd60n6r0c3go7e@google.com
X-GOOGLE-CONFERENCE:https://meet.google.com/riu-josb-pdb
CREATED:20220226T210517Z
DESCRIPTION:This is an example <i>event.</i>\n\nJoin with Google Meet: http
    s://meet.google.com/riu-josb-pdb\nOr dial: (US) +1 609-726-6186 PIN: 156393
    865#\nMore phone numbers: https://tel.meet/riu-josb-pdb?pin=1416269198709&h
    s=7\n\nLearn more about Meet at: https://support.google.com/a/users/answer/
    9282720
LAST-MODIFIED:20220226T214608Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Work - Project Alpha - Hello\\, iCal!
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220219T190000Z
DTEND:20220219T230000Z
DTSTAMP:20230302T233513Z
UID:44hekcaaf0or7547vhqa772mqj@google.com
CREATED:20220220T002201Z
DESCRIPTION:
LAST-MODIFIED:20220220T002201Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Work on GCal Sync
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220216
DTEND;VALUE=DATE:20220217
DTSTAMP:20230302T233513Z
UID:7ooluqb717vabebvc9gkc38c9l@google.com
CREATED:20220220T002146Z
DESCRIPTION:
LAST-MODIFIED:20220220T002146Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Announce Beta
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
        `;
    const events = getEventsFromICS(ics);
    expect(events).toMatchSnapshot(ics);
  });

  it('parses exactly on DST boundaries', () => {
    // Berlin DST transition 2024:
    // Starts: Sunday, March 31, 2024, 02:00:00 clocks are turned forward 1 hour to 03:00:00
    // Ends: Sunday, October 27, 2024, 03:00:00 clocks are turned backward 1 hour to 02:00:00
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
END:VTIMEZONE
BEGIN:VEVENT
UID:dst-transition-test-1
DTSTART;TZID=Europe/Berlin:20240330T100000
DTEND;TZID=Europe/Berlin:20240330T110000
SUMMARY:Before DST Starts
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-2
DTSTART;TZID=Europe/Berlin:20240331T100000
DTEND;TZID=Europe/Berlin:20240331T110000
SUMMARY:After DST Starts
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-3
DTSTART;TZID=Europe/Berlin:20241026T100000
DTEND;TZID=Europe/Berlin:20241026T110000
SUMMARY:Before DST Ends
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-4
DTSTART;TZID=Europe/Berlin:20241028T100000
DTEND;TZID=Europe/Berlin:20241028T110000
SUMMARY:After DST Ends
END:VEVENT
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(4);

    // We expect the local time components (startTime/endTime) in the OFCEvent
    // to match exactly what is in the ICS file, regardless of UTC representation
    const e1 = events.find(e => e.uid === 'dst-transition-test-1') as any;
    expect(e1.startTime).toBe('10:00');
    expect(e1.timezone).toBe('Europe/Berlin');

    const e2 = events.find(e => e.uid === 'dst-transition-test-2') as any;
    expect(e2.startTime).toBe('10:00');
    expect(e2.timezone).toBe('Europe/Berlin');

    const e3 = events.find(e => e.uid === 'dst-transition-test-3') as any;
    expect(e3.startTime).toBe('10:00');
    expect(e3.timezone).toBe('Europe/Berlin');

    const e4 = events.find(e => e.uid === 'dst-transition-test-4') as any;
    expect(e4.startTime).toBe('10:00');
    expect(e4.timezone).toBe('Europe/Berlin');
  });
});
