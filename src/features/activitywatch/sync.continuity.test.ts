import { __testing } from './sync';

describe('ActivityWatch continuity helpers', () => {
  const makePrior = (overrides: Partial<unknown> = {}) =>
    ({
      sessionId: 's1',
      calendarId: 'aw',
      cleanTitle: 'Focus Work',
      startMs: 1_000,
      endMs: 5_000,
      event: {
        type: 'single',
        title: 'Focus Work',
        category: 'blue',
        date: '2026-04-14',
        endDate: null,
        allDay: false,
        startTime: '00:00',
        endTime: '00:01',
        display: 'auto'
      },
      ...overrides
    }) as never;

  it('pickLatestEvent prefers largest end, then largest start', () => {
    const events = [
      makePrior({ startMs: 1_000, endMs: 9_000 }),
      makePrior({ startMs: 2_000, endMs: 9_000 }),
      makePrior({ startMs: 3_000, endMs: 8_000 })
    ];

    const picked = __testing.pickLatestEvent(events);
    expect(picked?.endMs).toBe(9_000);
    expect(picked?.startMs).toBe(2_000);
  });

  it('pickBestReconstructedBlockForPriorEvent prefers profile match with highest overlap', () => {
    const prior = makePrior({
      event: {
        type: 'single',
        title: 'Old',
        category: 'blue',
        date: '2026-04-14',
        endDate: null,
        allDay: false,
        startTime: '00:00',
        endTime: '00:01',
        display: 'auto'
      },
      cleanTitle: 'Old'
    });

    const blocks = [
      {
        startMs: 1_000,
        endMs: 3_000,
        title: 'A',
        profileColor: 'blue',
        profileName: 'Coding'
      },
      {
        startMs: 500,
        endMs: 5_000,
        title: 'B',
        profileColor: 'green',
        profileName: 'Study'
      },
      {
        startMs: 1_000,
        endMs: 5_000,
        title: 'C',
        profileColor: 'blue',
        profileName: 'Coding'
      }
    ];

    const picked = __testing.pickBestReconstructedBlockForPriorEvent(blocks as never, prior);
    expect(picked?.title).toBe('C');
  });

  it('coversPriorEventRange accepts near-full coverage with continuity buffer tolerance', () => {
    const prior = makePrior({ startMs: 10_000, endMs: 70_000 });
    const blocks = [
      {
        startMs: 10_000,
        endMs: 39_500,
        title: 'A',
        profileColor: 'blue',
        profileName: 'Coding'
      },
      {
        startMs: 39_500,
        endMs: 69_500,
        title: 'B',
        profileColor: 'blue',
        profileName: 'Coding'
      }
    ];

    const ok = __testing.coversPriorEventRange(blocks as never, prior, 1_000);
    expect(ok).toBe(true);
  });

  it('coversPriorEventRange rejects when uncovered gap exceeds tolerance', () => {
    const prior = makePrior({ startMs: 10_000, endMs: 70_000 });
    const blocks = [
      {
        startMs: 10_000,
        endMs: 35_000,
        title: 'A',
        profileColor: 'blue',
        profileName: 'Coding'
      },
      {
        startMs: 40_000,
        endMs: 65_000,
        title: 'B',
        profileColor: 'blue',
        profileName: 'Coding'
      }
    ];

    const ok = __testing.coversPriorEventRange(blocks as never, prior, 1_000);
    expect(ok).toBe(false);
  });
});
