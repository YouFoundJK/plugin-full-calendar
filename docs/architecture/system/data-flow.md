# Data Flow

!!! abstract "Flow Philosophy"
    All runtime paths converge through the same center: **providers ingest and persist data, while EventCache arbitrates state and publishes updates**. This keeps read/write behavior consistent across local and remote calendars.

## Runtime Flows

### Initial Load
Plugin startup initializes registry, cache, and managers; providers supply raw records; normalization/enhancement runs; EventStore indexes results; subscribers then render the first stable state.

### User-Initiated Mutation
UI captures intent (create/edit/drag/resize), EventCache applies optimistic state transition, ProviderRegistry routes the write to the owning provider, and cache confirms or rolls back based on provider result.

### External Update Ingestion
Vault or remote changes are observed by providers, affected records are re-read, EventCache performs sync and diff, and subscribers receive batched notifications to avoid redundant rendering.

### Time Tick and Reminder Path
TimeEngine computes upcoming occurrences within its horizon, emits time state through cache notifications, and notification features trigger reminders according to configured rules.

!!! warning "Flow Invariants"
    Do not bypass EventCache for mutations. Do not emit provider-specific state directly to UI subscribers. Normalization and diffing must occur before broad publish to keep UI behavior deterministic.

## Code Anchors

Primary orchestrator: `src/core/EventCache.ts`  
Temporal computation: `src/core/TimeEngine.ts`  
Notification handling: `src/features/notifications/NotificationManager.ts`  
Provider dispatch: `src/providers/ProviderRegistry.ts`
