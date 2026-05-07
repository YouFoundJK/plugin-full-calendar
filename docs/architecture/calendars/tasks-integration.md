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
- **Injection Logic**: It uses regex to inject or update date emojis (`⏳`, `🛫`, `📅`) and time blocks `(HH:mm)` while preserving:
    - Task descriptions.
    - Existing metadata (created dates, recurrence, etc.).
    - **Block Links** (`^uuid`): The regex ensures that injected data is placed *before* any block links at the end of the line.

## Optimistic UI Updates

To ensure the calendar feels responsive despite file I/O latency:
1.  The provider modifies the markdown file asynchronously.
2.  It simultaneously pushes an **Optimistic Update** to the `EventCache` with the new expected state.
3.  The eventual file change triggers a fresh cache update from the Tasks plugin, which the provider reconciles to confirm the operation.

## Date Logic & "No Fallback" Policy

The provider enforces a strict mapping policy to maintain data integrity:
- **Consistency**: It only reads from the *specific* date target configured by the user (Scheduled, Due, or Start).
- **Reasoning**: This prevents "ghosting" where a task appears on the calendar under one date but is tracked in the backlog under another, ensuring a predictable user experience.

---

[Provider Architecture](architecture.md) · [Event Cache](../system/eventcache.md) · [API Surface](../system/api-architecture.md)
