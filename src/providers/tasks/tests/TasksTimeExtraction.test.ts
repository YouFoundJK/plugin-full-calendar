/**
 * @file TasksTimeExtraction.test.ts
 * @brief Tests for time pattern extraction from task titles.
 */

import { extractTimeFromTitle } from '../TasksPluginProvider';

describe('extractTimeFromTitle', () => {
  it('returns no time info for a plain title', () => {
    expect(extractTimeFromTitle('Buy groceries')).toEqual({
      startTime: null,
      endTime: null,
      cleanTitle: 'Buy groceries'
    });
  });

  it('extracts a single time (HH:MM)', () => {
    expect(extractTimeFromTitle('Team meeting (18:00)')).toEqual({
      startTime: '18:00',
      endTime: null,
      cleanTitle: 'Team meeting'
    });
  });

  it('extracts a time range (HH:MM-HH:MM)', () => {
    expect(extractTimeFromTitle('Team meeting (18:00-20:00)')).toEqual({
      startTime: '18:00',
      endTime: '20:00',
      cleanTitle: 'Team meeting'
    });
  });

  it('handles time pattern at the start of title', () => {
    expect(extractTimeFromTitle('(09:00-10:00) Morning standup')).toEqual({
      startTime: '09:00',
      endTime: '10:00',
      cleanTitle: 'Morning standup'
    });
  });

  it('handles time pattern in the middle of title', () => {
    expect(extractTimeFromTitle('Call with (14:30-15:00) client')).toEqual({
      startTime: '14:30',
      endTime: '15:00',
      cleanTitle: 'Call with client'
    });
  });

  it('prefers the range pattern over single time when both formats could match', () => {
    const result = extractTimeFromTitle('Event (10:00-11:00)');
    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBe('11:00');
  });

  it('strips the time pattern from the title', () => {
    const { cleanTitle } = extractTimeFromTitle('Dentist (08:30)');
    expect(cleanTitle).toBe('Dentist');
  });

  it('extracts a single-digit hour time (H:MM)', () => {
    expect(extractTimeFromTitle('Morning run (9:00)')).toEqual({
      startTime: '9:00',
      endTime: null,
      cleanTitle: 'Morning run'
    });
  });

  it('extracts a time range with single-digit hours (H:MM-H:MM)', () => {
    expect(extractTimeFromTitle('Yoga class (8:00-9:30)')).toEqual({
      startTime: '8:00',
      endTime: '9:30',
      cleanTitle: 'Yoga class'
    });
  });

  it('extracts a mixed range with single and double-digit hours', () => {
    expect(extractTimeFromTitle('Long meeting (9:00-10:30)')).toEqual({
      startTime: '9:00',
      endTime: '10:30',
      cleanTitle: 'Long meeting'
    });
  });

  it('does not match partial time-like patterns without parentheses', () => {
    expect(extractTimeFromTitle('Meet at 18:00 for dinner')).toEqual({
      startTime: null,
      endTime: null,
      cleanTitle: 'Meet at 18:00 for dinner'
    });
  });
});
