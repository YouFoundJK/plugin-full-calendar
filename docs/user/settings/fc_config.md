# Display & Behavior Settings

!!! abstract "Philosophy"
    Tune the visual experience and interaction logic of your calendar. These settings impact how time is represented and how you interact with the calendar grid.

![Settings screenshot](../../assets/settings/settings.png)

## Time & Dates

*   **24-Hour Time**: Toggle between AM/PM and 24h military time.
*   **First Day of Week**: Choose which day (Sunday, Monday, etc.) starts your week view.

    ![Change First Day of Week](../../assets/settings/change-week-start.gif)

*   **Display Timezone**: Anchor the entire calendar to a specific timezone. Defaults to your system timezone. See [Timezone Support](../events/timezones.md).

## View Constraints & Limits

These settings allow you to focus on your active hours and clean up the UI:

*   **Slot Min/Max Time**: Set the start and end of the visible day (e.g., `08:00` to `20:00`).
*   **Show Weekends**: Toggle the visibility of Saturday and Sunday.
*   **Hidden Days**: Precisely hide specific days of the week (0=Sun, 1=Mon, etc.).
*   **Show All-Day Slot**: Toggle the all-day event row in week/day views.
*   **Day Max Events**: In Month view, limit the number of events shown per day before showing a "+ more" link.

## Interaction & UI

*   **Click to Create Event (Month View)**: If enabled, clicking an empty date cell in month view immediately opens the [event creation modal](../events/manage.md).
*   **Milestones and Progress**: Open the milestones page from Appearance to review read-only progress cards and unlock status. See [Milestones and Progress](../features/milestones.md).
*   **Initial View (Desktop/Mobile)**: Define which [view mode](../views/index.md) (e.g., `timeGridWeek`, `listMonth`) the plugin opens by default on different devices.
*   **Show Event in Status Bar**: Display the current or upcoming event in the Obsidian [status bar](../features/statusbar.md). See: [Status Bar Integration](../features/statusbar.md).
*   **Highlight Current/Next Event**: Visually emphasize the event happening now or starting soon.
*   **Header Date Format**: Choose from several presets for how dates appear in column headers (e.g., `Wed 4/9`).

## Global Overrides

*   **Business Hours**: Define your working hours and days. If enabled, non-business hours will be visually dimmed in the calendar grid.
*   **Background Events**: Enable or disable the rendering of background-style events (e.g., from ActivityWatch).

---

[Calendar Sources](sources.md) · [Advanced Categorization](categories.md) · [Back to Index](index.md)