import { getInlineAttributes, getInlineEventFromLine } from './DailyNoteCalendar';

describe('DailyNoteCalendar', () => {
  describe('getInlineAttributes', () => {
    it.each([
      ['one variable [hello:: world]', { hello: 'world' }],
      ['[first:: a] message [second:: b]', { first: 'a', second: 'b' }],
      ['this is a long string with [some brackets] but no actual:: inline fields', {}]
    ])('%p', (line: string, obj: any) => {
      expect(getInlineAttributes(line)).toEqual(obj);
    });
  });

  describe('getInlineEventFromLine', () => {
    const MOCK_GLOBALS = { date: '2023-01-01', type: 'single' as const };

    it('should return null if no inline fields and no category', () => {
      const line = '- [ ] Simple task';
      expect(getInlineEventFromLine(line, MOCK_GLOBALS)).toBeNull();
    });

    it('should parse an event with only a category', () => {
      const line = '- [ ] Work - Review PR';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Review PR');
      expect(result?.category).toBe('Work');
    });

    it('should parse an event with a category and inline fields', () => {
      const line = '- [x] Life - Pay bills [startTime:: 14:00]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Pay bills');
      expect(result?.category).toBe('Life');

      // TYPE GUARD: Ensure the event is not allDay and is a single event
      if (result && !result.allDay && result.type === 'single') {
        expect(result.startTime).toBe('14:00');
        expect(result.completed).not.toBe(false);
      } else {
        // Fail the test if the type is wrong
        fail('Parsed event was allDay or not a single event type');
      }
    });

    it('should parse an event with a multi-level category', () => {
      const line = '- [ ] Chores - Home - Clean garage';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Clean garage');
      expect(result?.category).toBe('Chores - Home');
    });

    it('should parse an event with only inline fields and no category', () => {
      const line = '- [ ] A task with a time [startTime:: 09:00]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('A task with a time');
      expect(result?.category).toBeUndefined();

      // TYPE GUARD: Ensure the event is not allDay
      if (result && !result.allDay) {
        expect(result.startTime).toBe('09:00');
      } else {
        fail('Parsed event was allDay');
      }
    });

    it('should handle extra whitespace gracefully', () => {
      const line = '  - [ ]   Work   -   Deploy to production  ';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Deploy to production');
      expect(result?.category).toBe('Work');
    });
  });
});
