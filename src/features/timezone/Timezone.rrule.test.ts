/**
 * @file Timezone.rrule.test.ts
 * @brief Tests for timezone handling of rrule events.
 *
 * @description
 * Validates that `convertEvent` correctly SKIPS timezone conversion for rrule events.
 * The rrule expansion + timezone shifting is handled by the monkeypatched FullCalendar
 * rrule plugin at render time, NOT by the convertEvent pipeline.
 *
 * @license See LICENSE.md
 */
import { convertEvent } from './Timezone';
import { OFCEvent } from '../../types';

jest.mock(
  'obsidian',
  () => ({
    Notice: class {
      constructor() {}
    }
  }),
  { virtual: true }
);

jest.mock('../i18n/i18n', () => ({
  t: (key: string) => key
}));

interface RRuleEvent {
  type: 'rrule';
  title: string;
  startDate: string;
  endDate?: string;
  rrule: string;
  allDay?: false;
  skipDates: string[];
  timezone?: string;
  startTime?: string;
  endTime?: string;
}

const rruleEvent = (props: Partial<RRuleEvent>): RRuleEvent =>
  ({
    type: 'rrule',
    title: 'Test RRule',
    startDate: '2025-06-01T10:00:00',
    rrule: 'FREQ=WEEKLY;BYDAY=SU',
    skipDates: [],
    ...props
  }) as RRuleEvent;

describe('convertEvent for rrule events (should return unmodified)', () => {
  it('should NOT convert startDate time — rrule events are passed through unchanged', () => {
    const event = rruleEvent({
      startDate: '2025-06-01',
      startTime: '10:00',
      endTime: '11:00',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      timezone: 'Europe/Prague'
    });

    // Prague (UTC+2) -> UTC: should NOT change for rrule events
    const result = convertEvent(event as OFCEvent, 'Europe/Prague', 'UTC') as RRuleEvent;

    // The event must be returned completely unmodified
    expect(result.startDate).toBe('2025-06-01');
    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBe('11:00');
    expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=SU');
  });

  it("should NOT shift BYDAY when crossing midnight — that is the monkeypatch's job", () => {
    const event = rruleEvent({
      startDate: '2025-06-01',
      startTime: '23:00',
      endTime: '23:30',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      timezone: 'UTC'
    });

    // UTC -> Prague: should NOT change for rrule events
    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RRuleEvent;

    expect(result.startTime).toBe('23:00');
    expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=SU'); // No BYDAY shift
  });

  it('should NOT shift BYDAY backward — rrule events pass through unchanged', () => {
    const event = rruleEvent({
      startDate: '2025-06-02',
      startTime: '01:00',
      endTime: '02:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timezone: 'UTC'
    });

    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RRuleEvent;

    expect(result.startTime).toBe('01:00');
    expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('should preserve skipDates unchanged', () => {
    const event = rruleEvent({
      startDate: '2025-06-01',
      startTime: '23:00',
      endTime: '23:30',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      skipDates: ['2025-06-08', '2025-06-15'],
      timezone: 'UTC'
    });

    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RRuleEvent;

    expect(result.skipDates).toEqual(['2025-06-08', '2025-06-15']);
  });

  it('should preserve timezone property unchanged', () => {
    const event = rruleEvent({
      startDate: '2025-06-01',
      startTime: '10:00',
      endTime: '11:00',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      timezone: 'Europe/Bucharest'
    });

    const result = convertEvent(
      event as OFCEvent,
      'Europe/Bucharest',
      'America/New_York'
    ) as RRuleEvent;

    // timezone should NOT be changed to the target zone — it stays as the original source
    expect(result.timezone).toBe('Europe/Bucharest');
  });

  it('should handle all-day rrule events (also returned unchanged)', () => {
    const event = {
      type: 'rrule',
      title: 'All Day Weekly',
      startDate: '2025-06-01',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      allDay: true,
      skipDates: [],
      endDate: null
    } as OFCEvent;

    const result = convertEvent(event, 'America/Los_Angeles', 'Asia/Tokyo');

    expect((result as any).startDate).toBe('2025-06-01');
  });

  it('should handle complex rrules (multiple BYDAY) — returned unchanged', () => {
    const event = rruleEvent({
      startDate: '2025-06-02',
      startTime: '01:00',
      endTime: '02:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
      timezone: 'UTC'
    });

    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RRuleEvent;

    // No BYDAY mutation — rrule events are pass-through
    expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
  });
});
