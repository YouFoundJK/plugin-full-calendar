# Provider Implementations and Patches

!!! abstract "Implementation focus"
    This page summarizes important provider implementations and highlights non-standard behavior or patches that contributors must preserve.

## Provider families

| Family | Providers | Notes |
|---|---|---|
| Local | Full Note, Daily Note | Vault-backed, file-centric parsing and persistence. |
| Remote | Google, CalDAV, ICS | Network-backed with auth/protocol handling and staged loading behavior. |
| Integration | Tasks, Bases | Plugin/API integration with custom semantics beyond simple event files. |

## Key implementation notes

### Full Note Provider

Creates one-note-per-event records, supports full CRUD, and uses robust filename collision handling to avoid destructive overwrites.

### Daily Note Provider

Parses list items under configured heading and performs line-targeted updates. Uses daily-note plugin integration and file/date reconciliation for event identity.

### ICS Provider (non-standard hybrid)

Single provider supports both remote URLs (`http`, `https`, `webcal`) and local vault `.ics` files. It is intentionally read-only and normalizes remote/local acquisition into one contract surface.

### CalDAV Provider (protocol patch behavior)

Uses direct REPORT/GET flow with robust XML namespace handling and fallback retrieval paths when calendar-data is not returned inline. This is intentionally defensive due to server variability.

### Google Provider

Uses OAuth-backed authenticated requests, handles recurrence cancellation edge cases (`cancelled` instances merged into skip dates), and keeps provider-facing payload conversion isolated in parser/auth modules.

### Tasks Provider (non-standard surgical writer)

Not a simple calendar source: it integrates with Tasks plugin cache, supports task-completion toggles, time-token parsing in task text, and surgical markdown line rewrites while preserving task metadata patterns.

## Cross-provider orchestration constraints

- Registry is the only runtime router for provider read/write operations.
- Providers expose capabilities (`canCreate`, `canEdit`, `canDelete`) and optional custom hooks (`toggleComplete`, `canBeScheduledAt`).
- Persistent event identity must be surfaced through `getEventHandle()` so global identifier mapping remains stable.

## Integration anchors

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/providers/fullnote/FullNoteProvider.ts`
- `src/providers/dailynote/DailyNoteProvider.ts`
- `src/providers/ics/ICSProvider.ts`
- `src/providers/caldav/CalDAVProvider.ts`
- `src/providers/google/GoogleProvider.ts`
- `src/providers/tasks/TasksPluginProvider.ts`
