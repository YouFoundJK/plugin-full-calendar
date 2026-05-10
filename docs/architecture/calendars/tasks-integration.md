# Tasks Integration Architecture

!!! abstract "Core Contract"
    The Tasks integration is a **cache-subscriber provider** that performs surgical markdown I/O. It treats the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin as its data authority and the `EventCache` as its synchronization target.

## Data Flow & Synchronization

Unlike other providers that crawl files directly, the Tasks provider is an event-driven system:

1.  **Subscription**: On initialization, the provider subscribes to `obsidian-tasks-plugin:cache-update`.
2.  **In-Memory Mirroring**: It maintains an internal `allTasks` array which is a transformed view of the Tasks plugin's raw cache.
3.  **Differential Sync**: Every time the Tasks cache updates, the provider performs a granular diff against its previous state and emits batch updates (`additions`, `updates`, `deletions`) to the global `ProviderRegistry`.

## Surgical Markdown I/O

When a user drags a task on the calendar or toggles its completion state, the provider performs **Surgical Replacement**:

- **Targeting**: It uses the file path and line number provided by the Tasks cache.
- **Injection Logic**: It uses regex to inject or update date emojis (`⏳`, `🛫`, `📅`) and time tokens while preserving:
    - Task descriptions.
    - Existing metadata (created dates, recurrence, etc.).
    - **Block Links** (`^uuid`): The regex ensures that injected data is placed *before* any block links at the end of the line.

## Time Format Contract

The Tasks integration has an explicit write-format setting:

- `settings.tasksIntegration.taskDisplayFormat`
    - `dayPlanner` (default): write time at the start of the task line.
    - `standard`: write parenthesized time near date metadata.

### Write behavior

For timed tasks, the provider writes one of the following:

- Day Planner range: `- [ ] 5:00 - 19:00 Task title ⏳ 2026-05-02`
- Day Planner single: `- [ ] 14:30 Task title ⏳ 2026-05-02`
- Standard range: `- [ ] Task title (5:00 AM-7:00 AM) ⏳ 2026-05-02`
- Standard single: `- [ ] Task title (14:30) ⏳ 2026-05-02`

All-day updates remove time tokens in either format.

### Read behavior

Parsing is format-agnostic and supports both Day Planner prefix and legacy parenthesized syntax. This means:

- Existing legacy tasks remain fully compatible.
- Newly written day-planner tasks are parsed identically into `startTime` / `endTime`.
- No mandatory bulk migration is required for correctness.

## Optimistic UI Updates

To ensure the calendar feels responsive despite file I/O latency:
1.  The provider modifies the markdown file asynchronously.
2.  It simultaneously pushes an **Optimistic Update** to the `EventCache` with the new expected state.
3.  The eventual file change triggers a fresh cache update from the Tasks plugin, which the provider reconciles to confirm the operation.

## Date Logic & "No Fallback" Policy

The provider enforces a strict mapping policy to maintain data integrity:
- **Consistency**: It only reads from the *specific* date target configured by the user (Scheduled, Due, or Start).
- **Reasoning**: This prevents "ghosting" where a task appears on the calendar under one date but is tracked in the backlog under another, ensuring a predictable user experience.

## Backlog View Filtering Contract

Backlog filtering is split by responsibility:

- **Provider-level filter** (`TasksPluginProvider.getUndatedTasks()`): decides which tasks are backlog candidates using `backlogDateTarget` and completion state.
- **View-level filter** (`TasksBacklogView`): applies client-side fuzzy filtering over candidate tasks by title and file path.

The view-level fuzzy filter is intentionally non-destructive: it does not mutate provider state and only narrows visible rows in the panel.

---

[Provider Architecture](architecture.md) · [Event Cache](../system/eventcache.md) · [API Surface](../system/api-architecture.md)
