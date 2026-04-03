# Events Architecture

This page describes how event logic is organized.

## Core Components

- Event state orchestration: `src/core/EventCache.ts`
- Event indexing and lookup: `src/core/EventStore.ts`
- Event normalization pipeline: `src/core/EventEnhancer.ts`
- Recurrence behavior: `src/features/recur_events/`

## Design Boundaries

- UI actions trigger changes, but EventCache owns event state.
- Recurrence logic is delegated to dedicated feature managers.
- Provider write operations are routed through provider registry.

## Related User Docs

- [Event Management](manage.md)
- [Recurring Events](recurring.md)
- [Tasks](tasks.md)
- [Timezone Support](timezones.md)
