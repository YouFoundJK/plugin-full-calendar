# ActivityWatch Architecture

!!! abstract "Scope"
    This section is the implementation source of truth for ActivityWatch ingestion, FSM derivation, continuity correction, and sync-boundary behavior.

## Module map

| Layer | Responsibility | Primary files |
|---|---|---|
| API access | Fetch bucket metadata and event slices from ActivityWatch server | `src/features/activitywatch/api.ts`, `src/features/activitywatch/sync.ts` |
| Timeline derivation | Flatten overlapping watcher streams into a single splinter timeline | `src/features/activitywatch/fsm.ts` |
| Intent inference | Per-profile FSM hypothesis generation and conflict allocation | `src/features/activitywatch/fsm.ts` |
| Calendar mutation | Continuity rewrite (create-first/delete-later) or fallback overlap mutation | `src/features/activitywatch/sync.ts` |
| UI/settings | Profile/rule editing and sync controls | `src/features/activitywatch/ui/ActivityWatchConfigComponent.tsx`, `src/features/activitywatch/ui/ActivityWatchSettingsModal.tsx` |

## Core contracts

- Input contract: ActivityWatch bucket events are normalized to `FlattenedEvent`.
- Internal timeline contract: `splinterEvents()` produces non-overlapping `SplitEvent` intervals.
- Session contract: FSM emits profile candidates, then best-fit allocator emits final blocks.
- Output contract: Final blocks are materialized as timed single `OFCEvent` entries in the configured target calendar.

## Reading order

1. [Implementation and Algorithms](implementation.md)
2. [User behavior controls](../../user/features/activitywatch.md)
3. [System event ownership](../system/eventcache.md)
