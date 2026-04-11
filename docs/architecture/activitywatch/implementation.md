# ActivityWatch Implementation and Algorithms

## End-to-end pipeline

1. Sync determines the fetch window and boundary context.
2. Bucket events are fetched and normalized to `FlattenedEvent`.
3. `executeFSM()` performs:
   - Phase 0: splinter timeline generation
   - Phase 1: profile hypothesis generation
   - Phase 2: greedy best-fit overlap resolution
4. Final blocks are converted into Full Calendar events.
5. Continuity pass updates existing events by ignore/extend/replace semantics.

## Rule semantics

Rule precedence for each splinter is strict:

1. Hard break
2. Primary evidence
3. Supporting evidence
4. Mismatch

Behavioral invariants:

- Supporting evidence can sustain warmup/active, but cannot start from idle.
- Activation threshold increases only from primary evidence.
- Session commits end at last evidence timestamp, not trailing mismatches.

## Sync-boundary methodology

### Problem being solved

If sync windows are short and a long-running session is sustained mainly by supporting evidence (for example AFK), a fresh FSM run can lose continuity because supporting evidence cannot activate from idle.

### Boundary warm-start

Auto sync now seeds FSM state from the existing calendar event that overlaps `lastSyncTime`.

Selection policy:

- Candidate must overlap sync boundary (`start <= boundary + buffer` and `end >= boundary - buffer`).
- Candidate must match known ActivityWatch profile signature (profile name + color).
- Candidate title must be non-empty after normalization.

Seed policy:

- Seed only when matched profile has supporting evidence rules.
- Seed state is `active`.
- `sessionStartMs` comes from existing event start.
- `lastEvidenceEndMs` is set to boundary time.
- `targetTimeMs` is clamped to threshold, so profile starts as activated.

Result:

- The next run can continue profile continuity from boundary without replaying long history.

## Lookback policy

Auto sync uses bounded lookback:

- Base lookback: `threshold + softBreak + safety`.
- If boundary seed profile exists, use that profile's base lookback.
- Clamp with floor and cap:
  - minimum 30 minutes
  - maximum 6 hours

This bounds runtime and avoids unbounded growth from very long sessions.

## Continuity update policy in calendar

For each derived block in chronological order:

1. Ignore if already swallowed by an equivalent existing block.
2. Extend matching block when same profile and normalized title continue.
3. Replace stale overlapping ActivityWatch profile blocks when newly derived profile differs.
4. Create block when no existing block can be reused.

This ensures late context can correct earlier coarse inferences.

## Performance note

Current splinter implementation evaluates each adjacent boundary interval against all events, which can degrade on large windows. The warm-start plus bounded lookback significantly reduces risk. A future optimization is sweep-line active-set splintering for near `O(N log N)` behavior.

## Key implementation anchors

- `src/features/activitywatch/sync.ts`
- `src/features/activitywatch/fsm.ts`
- `src/features/activitywatch/sync.test.ts`
