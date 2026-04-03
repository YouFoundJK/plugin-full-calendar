# EventCache Contract

!!! abstract "Why this page exists"
    This page is the implementation contract for the central state engine. If you need to reason about event lifecycle, optimistic updates, rollback, publish behavior, or cache ownership, start here.

## Role in the architecture

`EventCache` is the single runtime authority for event state. It does not directly parse files or call remote APIs; it delegates source I/O to `ProviderRegistry`, stores normalized events in `EventStore`, and broadcasts deterministic updates to UI and feature subscribers.

## Responsibilities

| Responsibility | Practical behavior |
|---|---|
| Staged population | Calls `ProviderRegistry.fetchAllByPriority()` and progressively syncs provider results. |
| State ownership | Persists canonical event state in `EventStore` and exposes query APIs for views/features. |
| Mutation orchestration | Executes optimistic add/update/delete, then commits or rolls back based on provider result. |
| Publish/subscribe hub | Emits `update` payloads (`events`, `calendar`, `resync`) and `time-tick` state for reminder/time UI flows. |
| Identifier bridge | Uses `ProviderRegistry` to map persistent provider identifiers to session IDs used by the UI. |

## Mutation lifecycle (authoritative path)

1. UI action calls a cache mutation API (`addEvent`, `updateEventWithId`, `deleteEventWithId`).
2. Cache performs optimistic in-memory state update in `EventStore`.
3. Cache flushes an update payload to subscribers for immediate UX response.
4. Cache delegates durable write to the owning provider via `ProviderRegistry`.
5. Success path replaces optimistic state with provider-authoritative result; failure path rolls back and republishes correction.

!!! warning "Invariant"
    No subsystem should mutate persistent event state outside `EventCache`. Direct provider-to-UI mutation paths are architectural violations.

## Subscription contract

- `update`: event-level or calendar-level changes for rendering/sync.
- `time-tick`: high-frequency temporal state for reminders and now-indicator style behavior.

Consumers should subscribe/unsubscribe cleanly and must handle batched updates instead of assuming one-event-at-a-time delivery.

## Integration anchors

- `src/core/EventCache.ts`
- `src/core/EventStore.ts`
- `src/providers/ProviderRegistry.ts`
- `src/core/TimeEngine.ts`
- `src/ui/view.ts`
