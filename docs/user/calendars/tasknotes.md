# TaskNotes Integration

!!! info "Obsidian Ecosystem Integration"
    TaskNotes is a specialized provider that allows you to sync and manage scheduled tasks from the [TaskNotes plugin](https://github.com/YouFoundJK/obsidian-tasknotes) directly on your calendar.


!!! tip "Power Up with Categories"
    TaskNotes also support **[Advanced Categories](../events/categories.md)**. You can categorize your tasks (e.g., `Personal - Grocery list`) to apply specific colors and styles on your agenda.


## How it Works

The TaskNotes provider connects to the TaskNotes internal cache. It interprets any task with a `scheduled` property as a calendar event.


*   **Bidirectional Sync**: Dragging a TaskNotes event on the calendar updates its scheduled date/time in the original note.
*   **FCR Command Support**: Use the **[FCR Command](../features/nlp.md)** to quickly reschedule or create tasks that TaskNotes will track.
*   **Custom UI**: Clicking a TaskNotes event opens the native TaskNotes edit modal for advanced task refinement.
*   **Status Awareness**: The provider respects completion statuses. Completed tasks are visually distinguished on the calendar.

## Setup

1.  Ensure the **TaskNotes** plugin is installed and enabled in your vault.
2.  Go to **[Full Calendar Settings](../settings/index.md) → [Calendar Sources](../settings/sources.md)**.
3.  Click **Add Source** and select **TaskNotes**.
4.  The provider will automatically attempt to link with the TaskNotes cache.

## Capabilities

| Feature | Supported | Notes |
|---|---|---|
| Create Events | ❌ No | Tasks must be created via TaskNotes or in **[Markdown](local.md)**. |
| Edit Date/Time | ✅ Yes | Drag-and-drop support for rescheduling. |
| Edit Metadata | ✅ Yes | Uses TaskNotes' native edit modal. |
| Delete Events | ❌ No | Delete the task in the source file to remove it. |
| Recurring Events| ❌ No | TaskNotes recurring logic is managed internally. |

---

[Tasks Plugin Integration](tasks-plugin-integration.md) · [Full Note Calendar](local.md) · [Back to Index](index.md)
