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

interface RecurringEvent {
  type: 'recurring';
  title: string;
  startRecur?: string;
  endRecur?: string;
  startTime: string;
  endTime: string;
  daysOfWeek: ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
  allDay: false;
  skipDates: string[];
}

const recurringEvent = (props: Partial<RecurringEvent>): RecurringEvent =>
  ({
    type: 'recurring',
    title: 'Test Recurring',
    allDay: false,
    startRecur: '2025-06-01',
    startTime: '10:00',
    endTime: '11:00',
    daysOfWeek: ['M'], // Monday
    skipDates: [],
    ...props
  }) as RecurringEvent;

describe('Timezone conversion for recurring events', () => {
  it('should convert start/end times', () => {
    const event = recurringEvent({
      startTime: '10:00',
      endTime: '11:00'
    });

    // Prague (UTC+2) -> UTC
    // 10:00 -> 08:00
    const result = convertEvent(event as OFCEvent, 'Europe/Prague', 'UTC') as RecurringEvent;

    expect(result.startTime).toBe('08:00');
    expect(result.endTime).toBe('09:00');
  });

  it('should shift daysOfWeek forward when crossing midnight (UTC -> East)', () => {
    const event = recurringEvent({
      startTime: '23:00',
      endTime: '23:30',
      daysOfWeek: ['U'] // Sunday
    });

    // Sunday 23:00 UTC -> Monday 01:00 Prague (UTC+2)
    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RecurringEvent;

    expect(result.startTime).toBe('01:00');
    expect(result.endTime).toBe('01:30');
    expect(result.daysOfWeek).toEqual(['M']); // Should be Monday
  });

  it('should shift daysOfWeek backward when crossing midnight (UTC -> West)', () => {
    const event = recurringEvent({
      startTime: '01:00',
      endTime: '02:00',
      daysOfWeek: ['M'] // Monday
    });

    // Monday 01:00 UTC -> Sunday 21:00 New York (UTC-4)
    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RecurringEvent;

    expect(result.startTime).toBe('21:00');
    expect(result.endTime).toBe('22:00');
    expect(result.daysOfWeek).toEqual(['U']); // Should be Sunday
  });

  it('should wrap daysOfWeek correctly (Saturday -> Sunday)', () => {
    const event = recurringEvent({
      startTime: '23:00',
      daysOfWeek: ['S'] // Saturday
    });

    // Saturday 23:00 UTC -> Sunday 01:00 Prague
    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RecurringEvent;

    expect(result.daysOfWeek).toEqual(['U']);
  });

  it('should wrap daysOfWeek correctly (Sunday -> Saturday)', () => {
    const event = recurringEvent({
      startTime: '01:00',
      daysOfWeek: ['U'] // Sunday
    });

    // Sunday 01:00 UTC -> Saturday 21:00 New York
    const result = convertEvent(event as OFCEvent, 'UTC', 'America/New_York') as RecurringEvent;

    expect(result.daysOfWeek).toEqual(['S']);
  });

  it('should convert skipDates', () => {
    const event = recurringEvent({
      startTime: '10:00',
      skipDates: ['2025-06-15'] // A Sunday
    });

    // 2025-06-15 10:00 Prague -> 2025-06-15 08:00 UTC (Same day)
    const result = convertEvent(event as OFCEvent, 'Europe/Prague', 'UTC') as RecurringEvent;

    expect(result.skipDates).toEqual(['2025-06-15']);
  });

  it('should shift skipDates when crossing midnight', () => {
    const event = recurringEvent({
      startTime: '23:00',
      skipDates: ['2025-06-15'] // Sunday
    });

    // 2025-06-15 23:00 UTC -> 2025-06-16 01:00 Prague (Next day)
    const result = convertEvent(event as OFCEvent, 'UTC', 'Europe/Prague') as RecurringEvent;

    expect(result.skipDates).toEqual(['2025-06-16']);
  });
});
