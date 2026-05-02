# Provider Implementations and Patches

!!! abstract "Implementation focus"
    This page summarizes important provider implementations and highlights non-standard behavior or patches that contributors must preserve.

## Provider families

| Family      | Providers             | Notes                                                                   |
| ----------- | --------------------- | ----------------------------------------------------------------------- |
| Local       | Full Note, Daily Note | Vault-backed, file-centric parsing and persistence.                     |
| Remote      | Google, CalDAV, ICS   | Network-backed with auth/protocol handling and staged loading behavior. |
| Integration | Tasks, Bases          | Plugin/API integration with custom semantics beyond simple event files. |

## Key implementation notes

### Full Note Provider

Creates one-note-per-event records, supports full CRUD, and uses robust filename collision handling to avoid destructive overwrites.

### Daily Note Provider

Parses list items under configured heading and performs line-targeted updates. Implements a persistent locally-allocated `uid` mechanism (`[uid:: N]`) instead of legacy deduplication matching, enabling deterministic title edits and O(1) hinted line lookups during sync updates.

### ICS Provider (non-standard hybrid)

Single provider supports both remote URLs (`http`, `https`, `webcal`) and local vault `.ics` files. It is intentionally read-only and normalizes remote/local acquisition into one contract surface.

### CalDAV Provider (protocol patch behavior)

Uses direct REPORT/GET flow with robust XML namespace handling and fallback retrieval paths when calendar-data is not returned inline. This is intentionally defensive due to server variability.

### Google Provider

Uses OAuth-backed authenticated requests, handles recurrence cancellation edge cases (`cancelled` instances merged into skip dates), and keeps provider-facing payload conversion isolated in parser/auth modules.

### Tasks Provider (non-standard surgical writer)

Not a simple calendar source: it integrates with Tasks plugin cache, supports task-completion toggles, time-token parsing in task text, and surgical markdown line rewrites while preserving task metadata patterns.

#### Tasks backlog integration contract

The Tasks backlog is controlled by `settings.tasksIntegration.backlogDateTarget`, not by a hardcoded definition of "undated." This setting is the single source of truth for both filtering and write-back:

| Target          | Backlog filter                                   | Markdown write-back              |
| --------------- | ------------------------------------------------ | -------------------------------- |
| `scheduledDate` | Include incomplete tasks without `scheduledDate` | Write or replace `⏳ YYYY-MM-DD` |
| `startDate`     | Include incomplete tasks without `startDate`     | Write or replace `🛫 YYYY-MM-DD` |
| `dueDate`       | Include incomplete tasks without `dueDate`       | Write or replace `📅 YYYY-MM-DD` |

Both UI entry points must use the same setting:

- Settings -> Integrations -> Obsidian Tasks Integration.
- The dropdown in the Tasks Backlog view header.

Changing the setting must save plugin settings and call `providerRegistry.refreshBacklogViews()` so all open backlog views re-query the provider. Backlog filtering belongs in `TasksPluginProvider.getUndatedTasks()` because the provider owns the Tasks cache shape and the date-field mapping. UI components should not duplicate that filtering logic.

Calendar event drag/update behavior remains intentionally separate from backlog drag/drop behavior. Existing scheduled Tasks events continue to update `scheduledDate` when moved on the calendar; only backlog scheduling uses `tasksIntegration.backlogDateTarget`.

The `openEditModalAfterBacklogDrop` setting gates the Tasks plugin edit modal after backlog drops. Its default is `false`, so the normal drag/drop path stays fast and non-blocking unless the user explicitly opts into the modal.

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
