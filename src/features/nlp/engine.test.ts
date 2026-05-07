import payloadEnRaw from './payloads/en.json';
import { processNaturalLanguage } from './engine';
import type { NLPPayload } from './types';

const payloadEn = payloadEnRaw as NLPPayload;
describe('NLP engine', () => {
  describe('AM/PM edge cases', () => {
    it('converts 4 pm to 16:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Meeting at 4 pm', payloadEn, now);

      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Meeting');
    });

    it('converts 12 am to 00:00 (midnight)', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Backup at 12 am', payloadEn, now);

      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
    });

    it('keeps 12 pm as 12:00 (noon)', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Lunch at 12 pm', payloadEn, now);

      expect(result.hours).toBe(12);
      expect(result.minutes).toBe(0);
    });

    it('parses exact time with minutes', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Call at 4:30 pm', payloadEn, now);

      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(30);
      expect(result.title).toBe('Call');
    });
  });

  describe('named time anchors', () => {
    it('handles "at noon" as 12:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Lunch at noon', payloadEn, now);

      expect(result.hours).toBe(12);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Lunch');
    });

    it('handles "at midnight" as 00:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Deploy at midnight', payloadEn, now);

      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Deploy');
    });
  });

  describe('relative days', () => {
    it('handles "today"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('today Standup', payloadEn, now);

      expect(result.date).toBe('2026-05-07');
      expect(result.title).toBe('Standup');
    });

    it('handles "tomorrow"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('tomorrow Dentist', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.title).toBe('Dentist');
    });

    it('handles "yesterday"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('yesterday Retro', payloadEn, now);

      expect(result.date).toBe('2026-05-06');
      expect(result.title).toBe('Retro');
    });

    it('handles "day after tomorrow"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('day after tomorrow Workshop', payloadEn, now);

      expect(result.date).toBe('2026-05-09');
      expect(result.title).toBe('Workshop');
    });

    it('handles "in 3 days"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 3 days Conference', payloadEn, now);

      expect(result.date).toBe('2026-05-10');
      expect(result.title).toBe('Conference');
    });

    it('handles "in 2 weeks"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 2 weeks Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-21');
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('the "next" problem (weekday wrap-around)', () => {
    it('handles next weekday with explicit pm time', () => {
      const now = new Date('2026-05-06T09:00:00'); // Wednesday
      const result = processNaturalLanguage('next tuesday at 4:30 pm Team sync', payloadEn, now);

      // Wednesday → next Tuesday = +6 days
      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.date).toBe('2026-05-12');
      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(30);
      expect(result.title).toBe('Team sync');
      expect(result.matchedRules).toEqual(
        expect.arrayContaining(['next_weekday', 'time_exact_ampm'])
      );
    });

    it('wraps to next week when target is same day', () => {
      const now = new Date('2026-05-06T09:00:00'); // Wednesday (day 3)
      const result = processNaturalLanguage('next wednesday Planning', payloadEn, now);

      // Same day → must wrap to +7
      expect(result.date).toBe('2026-05-13');
    });

    it('wraps correctly when target is earlier in the week', () => {
      const now = new Date('2026-05-08T09:00:00'); // Friday (day 5)
      const result = processNaturalLanguage('next monday Standup', payloadEn, now);

      // Friday → Monday = +3 days
      expect(result.date).toBe('2026-05-11');
    });
  });

  describe('rollover edge cases', () => {
    it('rolls hours over to next day', () => {
      const now = new Date('2026-05-07T22:00:00');
      const result = processNaturalLanguage('in 3 hours Deploy release', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Deploy release');
    });

    it('rolls minutes over to next hour and next day', () => {
      const now = new Date('2026-05-07T23:30:00');
      const result = processNaturalLanguage('in 90 minutes Checkpoint', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Checkpoint');
    });
  });

  describe('collision guards', () => {
    it('"in 3 hours" does NOT match "in Work calendar"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('Meeting in Work calendar', payloadEn, now);

      // Should match target_calendar, NOT in_hours
      expect(result.targetCalendar).toBe('Work');
      expect(result.matchedRules).toContain('target_calendar');
      expect(result.matchedRules).not.toContain('in_hours');
      expect(result.matchedRules).not.toContain('in_minutes');
      expect(result.matchedRules).not.toContain('in_days');
    });
  });

  describe('multi-pass pipeline', () => {
    it('parses full compound sentence correctly', () => {
      const now = new Date('2026-05-07T09:00:00'); // Thursday
      const result = processNaturalLanguage(
        'next tuesday at 4 pm Team sync in Work calendar',
        payloadEn,
        now
      );

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.date).toBe('2026-05-12');
      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Team sync');
      expect(result.targetCalendar).toBe('Work');
      expect(result.matchedRules).toEqual(
        expect.arrayContaining(['next_weekday', 'time_exact_ampm', 'target_calendar'])
      );
    });

    it('strips all matched fragments to leave only the title', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('tomorrow at 3 pm Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(15);
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('navigation short-circuits', () => {
    it('short-circuits on NAVIGATE_WEEK', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open weekly view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_WEEK');
      expect(result.title).toBe('');
      expect(result.matchedRules).toEqual(['navigate_week']);
    });

    it('short-circuits on NAVIGATE_MONTH', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show month view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_MONTH');
      expect(result.title).toBe('');
    });

    it('short-circuits on NAVIGATE_DAY', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('view day view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_DAY');
      expect(result.title).toBe('');
    });

    it('short-circuits on OPEN_CALENDAR', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open calendar', payloadEn, now);

      expect(result.intent).toBe('OPEN_CALENDAR');
      expect(result.title).toBe('');
    });

    it('short-circuits on OPEN_SIDEBAR', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open sidebar', payloadEn, now);

      expect(result.intent).toBe('OPEN_SIDEBAR');
      expect(result.title).toBe('');
    });
  });

  describe('recurrence', () => {
    it('parses basic weekly recurrence', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('every monday Standup', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.recurrence).toEqual({
        freq: 'WEEKLY',
        interval: 1,
        byDay: ['MO']
      });
      expect(result.title).toBe('Standup');
    });

    it('parses daily recurrence', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('daily Standup at 9 am', payloadEn, now);

      expect(result.recurrence).toEqual({
        freq: 'DAILY',
        interval: 1,
        byDay: undefined
      });
      expect(result.hours).toBe(9);
      expect(result.title).toBe('Standup');
    });
  });

  describe('no-match fallback', () => {
    it('returns raw input as title when no rules match', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('Random meeting title', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.title).toBe('Random meeting title');
      expect(result.matchedRules).toEqual([]);
    });

    it('returns empty string as title for empty input', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.title).toBe('');
    });
  });

  describe('ADD_MINUTES and ADD_WEEKS', () => {
    it('handles "in 30 minutes"', () => {
      const now = new Date('2026-05-07T14:15:00');
      const result = processNaturalLanguage('in 30 minutes Break', payloadEn, now);

      expect(result.hours).toBe(14);
      expect(result.minutes).toBe(45);
      expect(result.title).toBe('Break');
    });

    it('handles "in 2 weeks"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 2 weeks Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-21');
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('relative navigation', () => {
    it('handles "next week"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('next week Planning', payloadEn, now);

      expect(result.date).toBe('2026-05-14');
      expect(result.title).toBe('Planning');
    });

    it('handles "next month"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('next month Review', payloadEn, now);

      expect(result.date).toBe('2026-06-06');
      expect(result.title).toBe('Review');
    });
  });
});
