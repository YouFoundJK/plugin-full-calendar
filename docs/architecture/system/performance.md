# Performance & Staged Loading

!!! abstract "Philosophy"
    Full Calendar is designed to be **instant-on**, even for vaults with thousands of events spread across years of history. We achieve this through a staged loading strategy and an efficient in-memory indexing system.

## Staged Loading Sequence

When the plugin initializes (or when a full resync is triggered), the `ProviderRegistry` executes a two-stage fetch:

### Stage 1: The Critical Window
- **Range**: Current Date ± 45 days (approx. 3 months).
- **Goal**: Immediate UI population.
- **Behavior**: The plugin prioritizes these requests. Once complete, the calendar is considered "interactive" for the user's immediate needs.

### Stage 2: Background History
- **Range**: All time (Full Vault / Remote History).
- **Goal**: Completeness and searchability.
- **Behavior**: This stage runs at a lower priority in the background. As events are parsed, they are progressively streamed into the `EventCache`.

## Efficient In-Memory Indexing (`EventStore`)

To ensure that dragging events and switching views remains fluid, the `EventStore` maintains multiple synchronous indexes:

1.  **Primary Map**: `SessionID -> Event`. (O(1) access for UI updates).
2.  **Calendar Index**: `CalendarID -> Set<SessionID>`. (Fast filtering when toggling calendar visibility).
3.  **Path Index**: `FilePath -> Set<SessionID>`. (Instant updates when a file is modified externally).

## Optimistic UI & Rollback

Every user-initiated change (drag, resize, edit) follows an **Optimistic Pattern**:
1.  The `EventCache` updates the in-memory `EventStore` and notifies the UI **immediately**.
2.  The UI re-renders without waiting for file I/O or network responses.
3.  The `ProviderRegistry` attempts the durable write in the background.
4.  **Failure Path**: If the write fails (e.g., network timeout, file locked), the cache **rolls back** the in-memory change and triggers a second UI update to revert the event to its original position.

## Memory Management

- **Event Pruning**: Remote providers (like Google) implement a rolling cache. Events far outside the viewport are eventually purged from memory and re-fetched as needed to prevent unbounded memory growth.
- **Stateless Enhancers**: Normalization (Timezones, Categories) is performed by stateless functions to avoid object-bloat and reference-leakage.

---

[Event Cache](eventcache.md) · [Provider Architecture](../calendars/architecture.md) · [Data Flow](data-flow.md)
