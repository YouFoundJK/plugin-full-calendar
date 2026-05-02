# Tasks Plugin Integration

Unlock powerful task management by integrating the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin directly into Full Calendar. This calendar source transforms your tasks into schedulable events with a dedicated backlog and full create, read, update, and delete (CRUD) support.

!!! success "Best for..."
    Users of the Obsidian Tasks plugin who want to visualize, schedule, and manage their tasks on a calendar. It's perfect for time-blocking and ensuring that important to-dos get the attention they deserve.

!!! tip "Requires Obsidian Tasks Plugin"
    This calendar source requires the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin to be installed and enabled in your vault.

!!! warn "Tested with Obsidian Tasks Plugin 7.21.0"
    For best compactibility use this version. It is quite likely that the compactibility for newer tasks plugin version will break the existing features since most of the essential tasks integration is hardcoded due to lack of API - meaning its too expensive and time consuming to keep track of the changes in the Obsidian Tasks Plugin internal codebase!

## Setup

1.  In Full Calendar settings, go to the **Calendars** section.
2.  Click **New Calendar** and select the type **Tasks**.
3.  Give the calendar a name (e.g., "My Tasks") and assign it a color.

Once added, Full Calendar will automatically discover all tasks from your vault and display them.

<!-- Image missing: ../../assets/calendars/tasks-integration.gif -->

---

## Features

The Tasks calendar is more than just a read-only view; it's a fully interactive task management system.

### Task Backlog

Once a Tasks Calendar is active, a new **Tasks Backlog** panel will be registered in sidebar (access it using Command Pallette), listing all unscheduled tasks. From here, you can drag and drop tasks directly onto the calendar to schedule them.

-   **Drag-and-Drop Scheduling:** Quickly schedule tasks by dragging them from the backlog to a specific date and time.
-   **Filtering:** Use the filter bar to narrow down tasks by status (`todo`, `done`) or by the file path they belong to.
-   **Backlog Date Field:** Choose whether the backlog is organized around missing scheduled dates, start dates, or due dates. The same setting is available from **Settings -> Integrations -> Obsidian Tasks Integration** and from the dropdown at the top of the Tasks Backlog panel.

<!-- Image missing: ../../assets/calendars/task-backlog.gif -->

#### Backlog Date Field

The Tasks Backlog is driven by a single date-field setting:

| Setting        | Backlog shows                  | Dragging to calendar writes |
| -------------- | ------------------------------ | --------------------------- |
| Scheduled date | Tasks without a scheduled date | `⏳ YYYY-MM-DD`             |
| Start date     | Tasks without a start date     | `🛫 YYYY-MM-DD`             |
| Due date       | Tasks without a due date       | `📅 YYYY-MM-DD`             |

Changing the dropdown in either Settings or the Tasks Backlog panel refreshes open backlog panels immediately. This means the backlog can be used as a focused queue: for example, set it to **Due date** when you want to review every task that still needs a deadline, even if some of those tasks already have scheduled dates.

By default, dragging from the backlog schedules the task without opening the Tasks edit modal. You can enable **Open Tasks edit modal after backlog drop** from the Tasks integration settings if you want to review the task immediately after dropping it onto the calendar.

#### What the Calendar Shows

The backlog date field does **not** change the calendar display policy. It only controls:

-   Which tasks appear in the Tasks Backlog panel.
-   Which Tasks date marker is written when you drag from backlog onto the calendar.

The calendar view still shows any incomplete Tasks item that has at least one calendar date marker. When a task has more than one date marker, Full Calendar chooses the display date in this order:

1.  Scheduled date (`⏳ YYYY-MM-DD`)
2.  Due date (`📅 YYYY-MM-DD`)
3.  Start date (`🛫 YYYY-MM-DD`)

For example, if the backlog dropdown is set to **Due date**, the backlog shows tasks that are missing a due date. A task that already has a scheduled date but no due date can still appear in the backlog, because it needs a due date. That same task can also appear on the calendar, because the calendar can display it from its scheduled date.

Dragging that task from the backlog onto the calendar writes the selected missing field, such as `📅 YYYY-MM-DD` for **Due date**. Moving an existing Tasks event directly inside the calendar continues to update its scheduled date, because calendar drag/edit behavior is separate from backlog scheduling.

### Full CRUD Support

You can manage your tasks without ever leaving the calendar interface.

-   **Create:** Create new tasks by clicking on the calendar or using the "Add Event" button.
-   **Read:** View all your scheduled and unscheduled tasks.
-   **Update:** Reschedule tasks by dragging them to a new time slot. Edit task details by clicking on the task to open the event editor. Mark tasks as complete by checking the box next to them.
-   **Delete:** Remove tasks from your calendar and your vault.

All changes are synced back to the Tasks plugin in real-time.

### Time Blocks

You can schedule a task to a specific time—or a time range—by embedding a time block directly in the task's title. Full Calendar reads this block to position the task on the timed calendar view.

In the calendar view, you can also drag and drop tasks between the "all day" area and the timed calendar view.

**Supported formats:**

| Format            | Example              | Result                         |
| ----------------- | -------------------- | ------------------------------ |
| Single time (24h) | `(14:30)`            | Event starts at 2:30 PM        |
| Time range (24h)  | `(9:00-10:30)`       | Event from 9:00 AM to 10:30 AM |
| Single time (12h) | `(2:30 PM)`          | Event starts at 2:30 PM        |
| Time range (12h)  | `(9:00 AM-10:30 AM)` | Event from 9:00 AM to 10:30 AM |

A complete task line with a time block looks like this:

```
- [ ] Review meeting notes (14:00-15:00) ⏳ 2025-03-28
```

The time block is placed **before** the scheduled emoji (`⏳`) in the task description. When you drag a task to a time slot on the calendar, the time block is written back automatically. Editing the event start/end time from the calendar view will update the embedded time block in the markdown file in real time.

!!! tip "Time Format Setting"
    Full Calendar reads time blocks in both 12-hour and 24-hour format. It writes time blocks in
    the format specified under **Settings → Appearance**.

### Advanced Parsing and Settings

The integration is built with flexibility in mind.

-   **Multi-day Events:** The provider correctly parses tasks that span multiple days.
-   **Custom Statuses:** The plugin's parser can detect custom task statuses.
-   **Title Cleaning:** A setting is available to automatically strip tags from task titles for a cleaner look on the calendar.
-   **Tasks Integration Settings:** The Integrations section appears only after a Tasks calendar source exists. Its options control backlog date-field behavior and whether the Tasks edit modal opens after backlog drag-and-drop.
