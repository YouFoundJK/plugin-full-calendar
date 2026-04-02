import {
  patchRRuleTimezoneExpansion,
  resetRRulePatchStateForTests,
  RRuleDateEnvLike,
  RRuleExpandData,
  RRuleFrameRange,
  RRulePluginLike,
  RRuleSetLike
} from './Timezone';

type TestRRuleSet = RRuleSetLike & {
  _dtstart?: Date;
  between?: (after: Date, before: Date, inc?: boolean) => Date[];
};

function createDateEnv(): RRuleDateEnvLike {
  return {
    toDate: (input: Date | string | number) => new Date(input),
    createMarker: (input: Date | string | number) => new Date(input)
  };
}

describe('patchRRuleTimezoneExpansion', () => {
  beforeEach(() => {
    resetRRulePatchStateForTests();
  });

  it('uses raw rruleSet.between dates and keeps Friday in Asia/Shanghai', () => {
    const originalExpand = jest.fn<Date[], [RRuleExpandData, RRuleFrameRange, RRuleDateEnvLike]>(
      () => [new Date('2026-03-07T02:00:00.000Z')]
    );

    const plugin: RRulePluginLike = {
      recurringTypes: [{ expand: originalExpand }]
    };

    patchRRuleTimezoneExpansion(plugin, 'Asia/Shanghai');

    const between = jest.fn<Date[], [Date, Date, boolean?]>(() => [
      new Date('2026-03-06T18:00:00.000Z')
    ]);

    const errd: RRuleExpandData = {
      rruleSet: {
        tzid: () => 'Asia/Shanghai',
        _dtstart: new Date('2026-02-06T18:00:00.000Z'),
        between
      } as TestRRuleSet
    };

    const frameRange: RRuleFrameRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-31T00:00:00.000Z')
    };

    const expanded = plugin.recurringTypes[0].expand(errd, frameRange, createDateEnv());

    expect(between).toHaveBeenCalledTimes(1);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].toISOString()).toBe('2026-03-06T10:00:00.000Z');
    expect(expanded[0].getUTCDay()).toBe(5);
  });

  it('falls back to original expand when tzid is missing', () => {
    const originalExpand = jest.fn<Date[], [RRuleExpandData, RRuleFrameRange, RRuleDateEnvLike]>(
      () => [new Date('2026-03-07T02:00:00.000Z')]
    );

    const plugin: RRulePluginLike = {
      recurringTypes: [{ expand: originalExpand }]
    };

    patchRRuleTimezoneExpansion(plugin, 'Asia/Shanghai');

    const errd: RRuleExpandData = {
      rruleSet: {
        tzid: () => null
      }
    };

    const frameRange: RRuleFrameRange = {
      start: new Date('2026-03-01T00:00:00.000Z'),
      end: new Date('2026-03-31T00:00:00.000Z')
    };

    const expanded = plugin.recurringTypes[0].expand(errd, frameRange, createDateEnv());

    expect(originalExpand).toHaveBeenCalledTimes(1);
    expect(expanded[0].toISOString()).toBe('2026-03-07T02:00:00.000Z');
  });
});
