# Provider Implementations and Patches

!!! abstract "Implementation focus"
    This page summarizes important provider implementations and highlights non-standard behavior or patches that contributors must preserve.

## Provider families

| Family      | Providers             | Notes                                                                   |
| ----------- | --------------------- | ----------------------------------------------------------------------- |
| Local       | Full Note, Daily Note | Vault-backed, file-centric parsing and persistence.                     |
| Remote      | Google, CalDAV, ICS   | Network-backed with auth/protocol handling and staged loading behavior. |
| Integration | Tasks, TaskNotes, Bases | Plugin/API integration with custom semantics beyond simple event files. |

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

#### Tasks date-field integration contract

The Tasks integration has two explicit date-field settings:

- `settings.tasksIntegration.backlogDateTarget` controls which incomplete tasks appear in the Tasks Backlog.
- `settings.tasksIntegration.calendarDisplayDateTarget` controls which Tasks date marker is used for calendar display and calendar/backlog write-back.

Backlog filtering must use `backlogDateTarget`, not a hardcoded definition of "undated":

| Target          | Backlog filter                                   |
| --------------- | ------------------------------------------------ |
| `scheduledDate` | Include incomplete tasks without `scheduledDate` |
| `startDate`     | Include incomplete tasks without `startDate`     |
| `dueDate`       | Include incomplete tasks without `dueDate`       |

Calendar display and write-back must use `calendarDisplayDateTarget` with no fallback:

| Target          | Calendar display                | Markdown write-back              |
| --------------- | ------------------------------- | -------------------------------- |
| `scheduledDate` | Only tasks with `scheduledDate` | Write or replace `⏳ YYYY-MM-DD` |
| `startDate`     | Only tasks with `startDate`     | Write or replace `🛫 YYYY-MM-DD` |
| `dueDate`       | Only tasks with `dueDate`       | Write or replace `📅 YYYY-MM-DD` |

Backlog filter UI entry points must use the same `backlogDateTarget` setting:

- Settings -> Integrations -> Obsidian Tasks Integration.
- The dropdown in the Tasks Backlog view header.

Changing the setting must save plugin settings and call `providerRegistry.refreshBacklogViews()` so all open backlog views re-query the provider. Backlog filtering belongs in `TasksPluginProvider.getUndatedTasks()` because the provider owns the Tasks cache shape and the date-field mapping. UI components should not duplicate that filtering logic.

Calendar event drag/update behavior and backlog drag/drop both write `calendarDisplayDateTarget`. `TasksPluginProvider._taskToOFCEvent()` must also read only `calendarDisplayDateTarget`; do not reintroduce scheduled/due/start fallback priority. Because event-cache contents are derived from the display field, changing `calendarDisplayDateTarget` may require an Obsidian restart or plugin reload for all open views to fully reflect the new policy.

The `openEditModalAfterBacklogDrop` setting gates the Tasks plugin edit modal after backlog drops. Its default is `false`, so the normal drag/drop path stays fast and non-blocking unless the user explicitly opts into the modal.

#### Tasks time-format contract

- `settings.tasksIntegration.taskDisplayFormat` controls how timed tasks are serialized back to markdown.
- Default is `dayPlanner` for new installs and forward writes.
- `standard` remains available as a compatibility/user preference mode.

Serialization modes:

| Mode         | Example output |
| ------------ | -------------- |
| `dayPlanner` | `- [ ] 5:00 - 19:00 Task title ⏳ 2026-05-02` |
| `standard`   | `- [ ] Task title (5:00 AM-7:00 AM) ⏳ 2026-05-02` |

Parsing must support both schemas regardless of the selected write mode. Do not introduce a read-mode switch tied to `taskDisplayFormat`.

### TaskNotes Provider (provider-owned NLP endpoint)

TaskNotes is a plugin-runtime integration provider and intentionally avoids HTTP transport. It reads from TaskNotes cache APIs and writes via TaskNotes service/UI endpoints.

Key contracts:

- Create behavior is provider-owned and configurable by source `dispatchMode`.
- Default dispatch endpoint is `search` (Search + Create selector flow).
- Alternate endpoint `create` opens TaskNotes create modal directly.
- Full Calendar NLP dispatch remains generic; provider decides endpoint semantics.

TaskNotes create delegation path:

1. NLP resolves target calendar and calls `EventCache.addEvent(...)`.
2. Registry routes to `TaskNotesProvider.createEvent(...)`.
3. Provider opens TaskNotes UI, prefills NLP query, then throws `DelegatedProviderActionError`.
4. Cache mutation handler treats this as intentional handoff and rolls back optimistic placeholder state without generic failure notice.

This prevents duplicate modal UX and keeps provider-specific behavior outside dispatcher logic.

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
- `src/providers/tasknotes/TaskNotesProvider.ts`
