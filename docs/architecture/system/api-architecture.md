# API Architecture

!!! abstract "Purpose"
    The Full Calendar API exposes safe, permissioned entry points for other plugins while keeping `EventCache` as the single source of truth.

## Components and Ownership

| Component | Responsibility | Must Not Own |
|---|---|---|
| `PublicAPI` | Bouncer surface on `app.plugins.plugins['full-calendar'].api`. Handles authorization and token exchange. | Event state or provider I/O. |
| `InternalAPI` | Executes actions (open views, change view, read cached events) using **[`PluginState`](core-systems.md)**. | Direct exposure to third-party callers. |
| `PluginState` | Runtime singleton for settings, cache, provider registry, and utility hooks. | Alternative state sources. |
| **[`EventCache`](eventcache.md)** | Canonical event state and mutation authority. | UI or provider-specific policy. |
| **[`ProviderRegistry`](../calendars/architecture.md)** | Provider I/O routing and ID mapping. | UI decisions. |

## Authorization and Token Storage

- `PublicAPI.requestAccess(pluginId, reason, requestedScopes?)` shows a permissions modal and stores an approved token in settings.
- Tokens are stored in `FullCalendarSettings.apiTokens` as `{ pluginId, reason, requestedScopes, grantedScopes, grantedAt }` keyed by a UUID.
- `PublicAPI.withToken(token)` returns `AuthorizedAPI` or `null` if the token is missing or invalid.

## Scope Model

The API is scope-gated. Each method requires a scope (e.g. `events:read`, `events:write`, `settings:write`).
`system:full-access` unlocks an unsafe gateway that exposes internal state for trusted integrations.

## API Surface (AuthorizedAPI)

The authorized surface provides granular control over the calendar system, gated by permission scopes:

### UI & Interaction (`ui:*`)
- `openCalendar()`: Focus or open the main view.
- `openSidebar()`: Reveal the calendar sidebar.
- `changeView(viewName)`: Switch to `timeGridWeek`, `listMonth`, etc.
- `openCreateModal(initialData?)`: Launch the event creation UI.

### Event Management (`events:*`)
- `getAllEvents()`: Retrieve all enhanced events from the cache.
- `getEventById(id)`: Fetch a specific event.
- `getEventDetails(id)`: Access metadata like source location.
- `createEvent(calendarId, event, options?)`: Persist a new event.
- `updateEvent(eventId, event, options?)`: Modify an existing event.
- `deleteEvent(eventId, options?)`: Remove or override an instance.
- `moveEvent(eventId, targetCalendarId)`: Migrate an event between sources.
- `processEvent(eventId, processor)`: Atomic read-modify-write for event data.

### Recurring & Tasks
- `toggleRecurringInstance(...)`: Mark a specific recurrence as done.
- `modifyRecurringInstance(...)`: Create an exception for one instance.
- `scheduleTask(taskId, date)`: Map a task to a specific calendar date.
- `validateTaskSchedule(taskId, date)`: Verify if a task can be scheduled.

### Provider & Settings (`providers:*`, `settings:*`)
- `getCalendarSources()`: List all configured sources.
- `revalidateRemoteCalendars(force?)`: Refresh GCal/CalDAV/ICS feeds.
- `reloadProviderNow(calendarId)`: Force deep sync for one provider.
- `getSettings()` / `updateSettings(...)`: Read and write plugin configuration.

### System Access (`system:full-access`)
- `getInternalState()`: Unsafe access to `plugin`, `cache`, and `registry` instances.

---

Direct data access via `loadData()` or `saveData()` remains blocked to enforce the `EventCache` as the single source of truth.

## Data Flow

1. External plugin acquires `PublicAPI` from the plugin registry.
2. `requestAccess()` prompts the user and persists a token on approval.
3. `withToken()` returns a bound `AuthorizedAPI` instance.
4. `AuthorizedAPI` delegates to `InternalAPI`, which uses `PluginState` to reach `EventCache` and `ProviderRegistry`.

## Constraints and Invariants

- Event state remains owned by `EventCache`. The API does not allow direct writes to storage.
- Tokens are capability grants. Treat them as secrets and expect possible revocation.
- API calls assume the plugin has initialized `PluginState`. Callers must handle `null` or errors gracefully.

## Implementation Anchors

- `src/api/FullCalendarAPI.ts`
- `src/core/PluginState.ts`
- `src/main.ts`
