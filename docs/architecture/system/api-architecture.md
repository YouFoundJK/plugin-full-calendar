# API Architecture

!!! abstract "Purpose"
    The Full Calendar API exposes safe, permissioned entry points for other plugins while keeping `EventCache` as the single source of truth.

## Components and Ownership

| Component | Responsibility | Must Not Own |
|---|---|---|
| `PublicAPI` | Bouncer surface on `app.plugins.plugins['full-calendar'].api`. Handles authorization and token exchange. | Event state or provider I/O. |
| `InternalAPI` | Executes actions (open views, change view, read cached events) using `PluginState`. | Direct exposure to third-party callers. |
| `PluginState` | Runtime singleton for settings, cache, provider registry, and utility hooks. | Alternative state sources. |
| `EventCache` | Canonical event state and mutation authority. | UI or provider-specific policy. |
| `ProviderRegistry` | Provider I/O routing and ID mapping. | UI decisions. |

## Authorization and Token Storage

- `PublicAPI.requestAccess(pluginId, reason, requestedScopes?)` shows a permissions modal and stores an approved token in settings.
- Tokens are stored in `FullCalendarSettings.apiTokens` as `{ pluginId, reason, requestedScopes, grantedScopes, grantedAt }` keyed by a UUID.
- `PublicAPI.withToken(token)` returns `AuthorizedAPI` or `null` if the token is missing or invalid.

## Scope Model

The API is scope-gated. Each method requires a scope (e.g. `events:read`, `events:write`, `settings:write`).
`system:full-access` unlocks an unsafe gateway that exposes internal state for trusted integrations.

## API Surface (AuthorizedAPI)

The authorized surface is intentionally small and read/UX focused:

- `openCalendar()`
- `openSidebar()`
- `changeView(viewName)`
- `openCreateModal(initialData?)`
- `getAllEvents()`
- `getEventById(id)`

Direct data access via `loadData()` or `saveData()` is blocked at the plugin level to prevent bypassing `EventCache` and settings validation.

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
