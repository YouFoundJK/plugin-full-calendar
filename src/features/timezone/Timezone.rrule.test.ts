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
  startDate: string; // ISO string with time
  endDate?: string;
  rrule: string;
  allDay?: false;
  skipDates: string[];
}

const rruleEvent = (props: Partial<RRuleEvent>): RRuleEvent =>
  ({
    type: 'rrule',
    title: 'Test RRule',
    startDate: '2025-06-01T10:00:00', // Sunday
    rrule: 'FREQ=WEEKLY;BYDAY=SU',
    skipDates: [],
    ...props
  }) as RRuleEvent;

describe('Timezone conversion for RRule events', () => {
  it('should convert startDate time', () => {
    const event = rruleEvent({
      startDate: '2025-06-01T10:00:00', // 10:00 Prague
      rrule: 'FREQ=WEEKLY;BYDAY=SU'
    });

    // Prague (UTC+2) -> UTC
    // 10:00 -> 08:00
    const result = convertEvent(event as OFCEvent, 'Europe/Prague', 'UTC') as RRuleEvent;

    expect(result.startDate).toContain('T08:00:00');
  });

  it('should shift BYDAY in rrule when crossing midnight (UTC -> East)', () => {
    // Sunday 23:00 UTC
    const event = rruleEvent({
      startDate: '2025-06-01T23:00:00',
      rrule: 'FREQ=WEEKLY;BYDAY=SU'
    });

    // Sunday 23:00 UTC -> Monday 01:00 Prague (UTC+2)
    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RRuleEvent;

    expect(result.startDate).toContain('T01:00:00');
    expect(result.rrule).toContain('BYDAY=MO');
  });

  it('should shift BYDAY backward when crossing midnight (UTC -> West)', () => {
    // Monday 01:00 UTC
    const event = rruleEvent({
      startDate: '2025-06-02T01:00:00', // Monday
      rrule: 'FREQ=WEEKLY;BYDAY=MO'
    });

    // Monday 01:00 UTC -> Sunday 21:00 New York (UTC-4)
    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RRuleEvent;

    expect(result.startDate).toContain('T21:00:00');
    expect(result.rrule).toContain('BYDAY=SU');
  });

  it('should handle complex rrules (multiple days)', () => {
    // Monday and Wednesday at 01:00 UTC
    const event = rruleEvent({
      startDate: '2025-06-02T01:00:00',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE'
    });

    // Shift West -> Sunday and Tuesday 21:00
    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RRuleEvent;

    expect(result.rrule).toContain('BYDAY=SU,TU');
  });
});
