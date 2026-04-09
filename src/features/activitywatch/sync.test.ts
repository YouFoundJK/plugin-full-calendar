import { executeFSM, FlattenedEvent } from './fsm';

describe('ActivityWatch FSM Best-Fit Integration', () => {
  it('Should properly execute Phase 1/Phase 2 slice and overlap resolution for the Obsidian/Browser/Zotero workflow', () => {
    // Defined Type 1 Profile: Obsidian, vscode, browser -> Threshold 15m
    const type1 = {
      id: 'p1',
      name: 'Type 1',
      color: 'Type 1 Color',
      activationThresholdMins: 15,
      softBreakLimitMins: 5,
      activationRules: [
        {
          id: '1',
          bucketType: 'window',
          matchField: 'app',
          matchPattern: 'Obsidian',
          useRegex: false
        },
        {
          id: '2',
          bucketType: 'window',
          matchField: 'app',
          matchPattern: 'vscode',
          useRegex: false
        },
        { id: '3', bucketType: 'web', matchField: 'url', matchPattern: 'browser', useRegex: false }
      ],
      supportingEvidenceRules: [],
      hardBreakRules: [],
      titleTemplate: 'Type 1 Output'
    };

    // Defined Type 2 Profile: Obsidian, zotero, browser -> Threshold 15m
    const type2 = {
      id: 'p2',
      name: 'Type 2',
      color: 'Type 2 Color',
      activationThresholdMins: 15, // needs at least 15m to activate
      softBreakLimitMins: 5,
      activationRules: [
        {
          id: '4',
          bucketType: 'window',
          matchField: 'app',
          matchPattern: 'Obsidian',
          useRegex: false
        },
        {
          id: '5',
          bucketType: 'window',
          matchField: 'app',
          matchPattern: 'zotero',
          useRegex: false
        },
        { id: '6', bucketType: 'web', matchField: 'url', matchPattern: 'browser', useRegex: false }
      ],
      supportingEvidenceRules: [],
      hardBreakRules: [],
      titleTemplate: 'Type 2 Output'
    };

    const flatEvents: FlattenedEvent[] = [
      // 0 to 5 mins: Obsidian
      {
        startMs: 0,
        endMs: 5 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { app: 'Obsidian' }
      },
      // 5 to 15 mins: Browser
      {
        startMs: 5 * 60 * 1000,
        endMs: 15 * 60 * 1000,
        fidelity: 2,
        bucketType: 'web',
        data: { url: 'browser' }
      },
      // 15 to 27 mins: Zotero
      {
        startMs: 15 * 60 * 1000,
        endMs: 27 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { app: 'zotero' }
      },
      // 27 to 50 mins: AFK (Mismatch for both)
      {
        startMs: 27 * 60 * 1000,
        endMs: 50 * 60 * 1000,
        fidelity: 1,
        bucketType: 'afk',
        data: { status: 'afk' }
      }
    ];

    const profiles: Parameters<typeof executeFSM>[1] = [type1, type2];
    const finalBlocks = executeFSM(flatEvents, profiles);

    // Mathematically:
    // Type 1 Fitness: Obsidian(5) + Browser(10) = 15m (Match) + Zotero(12) (Mismatch). Total duration 27?
    // Wait, Type 1 requires 15m to activate. It gets 5m + 10m = 15m TARGET! So it activates AT minute 15.
    // Then it hits Zotero(12m mismatch). Since Soft Break Limit is 5m, Zotero forces a break at Minute 20 (15+5).
    // The FSM truncates trailing mismatches, meaning the Type 1 session ends perfectly at Minute 15!
    // Fitness Score for Type 1 = 15m matches over a 15m block. (15)

    // Type 2 Fitness: Obsidian(5) + Browser(10) + Zotero(12) = 27m TARGET. Activates at min 15. Runs to min 27.
    // Then hits AFK, breaking at min 27.
    // Fitness Score for Type 2 = 27m matches. (27)

    // Greedy Allocation: Type 2 (27) > Type 1 (15).
    // Type 2 claims 0 to 27m.
    // Type 1 attempts to claim 0 to 15m, but it is 100% swallowed by Type 2.
    // End result: A single Type 2 block from 0 to 27m.

    expect(finalBlocks.length).toBe(1);
    expect(finalBlocks[0].profile.name).toBe('Type 2');
    expect(finalBlocks[0].startMs).toBe(0);
    expect(finalBlocks[0].endMs).toBe(27 * 60 * 1000);
  });

  it('Should match case-insensitively for buckets, fields and patterns', () => {
    const profile = {
      id: 'ci',
      name: 'Case Insensitive',
      color: 'blue',
      activationThresholdMins: 0,
      softBreakLimitMins: 0,
      activationRules: [
        {
          id: 'ci1',
          bucketType: 'WINDOW', // Upper case
          matchField: 'APP', // Upper case
          matchPattern: 'obsidian', // Lower case
          useRegex: false
        }
      ],
      supportingEvidenceRules: [],
      hardBreakRules: [],
      titleTemplate: '{APP}'
    };

    const events: FlattenedEvent[] = [
      {
        startMs: 0,
        endMs: 10 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window', // Lower case
        data: { app: 'Obsidian' } // Mixed case
      }
    ];

    const finalBlocks = executeFSM(events, [profile] as Parameters<typeof executeFSM>[1]);
    expect(finalBlocks.length).toBe(1);
    expect(finalBlocks[0].profile.name).toBe('Case Insensitive');
  });

  it('Should match case-insensitively using regex', () => {
    const profile = {
      id: 'cir',
      name: 'Regex CI',
      color: 'red',
      activationThresholdMins: 0,
      softBreakLimitMins: 0,
      activationRules: [
        {
          id: 'ci2',
          bucketType: 'any',
          matchField: 'title',
          matchPattern: 'YOUTUBE', // Upper case
          useRegex: true
        }
      ],
      supportingEvidenceRules: [],
      hardBreakRules: [],
      titleTemplate: 'YouTube session'
    };

    const events: FlattenedEvent[] = [
      {
        startMs: 0,
        endMs: 10 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { title: 'Watching youtube' } // Lower case
      }
    ];

    const finalBlocks = executeFSM(events, [profile] as Parameters<typeof executeFSM>[1]);
    expect(finalBlocks.length).toBe(1);
  });

  it('Should not start a session from supporting evidence alone', () => {
    const profile = {
      id: 'support-only',
      name: 'YouTube',
      color: 'media',
      activationThresholdMins: 5,
      softBreakLimitMins: 3,
      activationRules: [
        {
          id: 'p1',
          bucketType: 'window',
          matchField: 'title',
          matchPattern: 'youtube',
          useRegex: true
        }
      ],
      supportingEvidenceRules: [
        {
          id: 's1',
          bucketType: 'afk',
          matchField: 'status',
          matchPattern: 'afk',
          useRegex: false
        }
      ],
      hardBreakRules: [],
      titleTemplate: 'YouTube'
    };

    const events: FlattenedEvent[] = [
      {
        startMs: 0,
        endMs: 10 * 60 * 1000,
        fidelity: 1,
        bucketType: 'afk',
        data: { status: 'afk' }
      }
    ];

    const finalBlocks = executeFSM(events, [profile] as Parameters<typeof executeFSM>[1]);
    expect(finalBlocks.length).toBe(0);
  });

  it('Should sustain an active session with supporting evidence', () => {
    const profile = {
      id: 'support-sustain',
      name: 'YouTube',
      color: 'media',
      activationThresholdMins: 5,
      softBreakLimitMins: 3,
      activationRules: [
        {
          id: 'p2',
          bucketType: 'window',
          matchField: 'title',
          matchPattern: 'youtube',
          useRegex: true
        }
      ],
      supportingEvidenceRules: [
        {
          id: 's2',
          bucketType: 'afk',
          matchField: 'status',
          matchPattern: 'afk',
          useRegex: false
        }
      ],
      hardBreakRules: [],
      titleTemplate: 'YouTube - {title}'
    };

    const events: FlattenedEvent[] = [
      {
        startMs: 0,
        endMs: 5 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { title: 'Watching YouTube' }
      },
      {
        startMs: 5 * 60 * 1000,
        endMs: 9 * 60 * 1000,
        fidelity: 1,
        bucketType: 'afk',
        data: { status: 'afk' }
      },
      {
        startMs: 9 * 60 * 1000,
        endMs: 10 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { app: 'SomeOtherApp' }
      },
      {
        startMs: 10 * 60 * 1000,
        endMs: 12 * 60 * 1000,
        fidelity: 1,
        bucketType: 'window',
        data: { title: 'Still YouTube' }
      }
    ];

    const finalBlocks = executeFSM(events, [profile] as Parameters<typeof executeFSM>[1]);
    expect(finalBlocks.length).toBe(1);
    expect(finalBlocks[0].startMs).toBe(0);
    expect(finalBlocks[0].endMs).toBe(12 * 60 * 1000);
  });
});
