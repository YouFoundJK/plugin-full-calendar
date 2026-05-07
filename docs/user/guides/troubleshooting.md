# Troubleshooting

Use this page as a first response checklist for common issues.

## General

### How do I reset the event cache?

If something is not working as expected, the first thing to try is [resetting the event cache](../reference/data_integrity.md).
- Run the command [`Full Calendar: Reset Event Cache`](commands-and-shortcuts.md).

This forces the plugin to re-read all events from all your sources. This is a safe operation and often fixes synchronization or display issues.

### Why are my events missing?

1. Follow the [Reset Event Cache](#how-do-i-reset-the-event-cache) steps above.
2. Reopen the calendar view.
3. Verify calendar source is enabled and visible in [Settings](../settings/index.md).

## Events & Calendars

### Why are my remote calendars not updating?

1. Run the command `Full Calendar: Revalidate remote calendars`.
2. Recheck provider credentials and account setup.
3. Confirm network access and provider limits.

### Why are my reminders not firing?

1. Confirm reminder settings are enabled.
2. Confirm OS-level notifications are allowed for Obsidian.
3. Test with an event that starts within a short window.

See: [Reminders and Notifications](../features/reminders.md)

### Why are my event times wrong (DST/Timezones)?

1. Check display timezone settings in [Settings](../settings/index.md).
2. Confirm source calendar timezone assumptions.
3. Re-test with new event creation in target timezone.

See: [Timezone Support](../events/timezones.md)

## FCR Command (NLP)

### Command not found
Make sure the plugin is up to date. Search for "FCR Command" in the command palette.

### Wrong date resolved
"next \<weekday\>" always advances forward, never backward. "Next Wednesday" on a Wednesday means one week later.

### Phrase conflicts
Rules are ordered by specificity — "in 3 hours" will not accidentally match "in Work calendar".

### Calendar not matched
Smart matching is case-insensitive. Check that the name exactly matches your calendar's display name in [Settings](../settings/index.md).



## Others

If this doesn't fix the problem, please [submit an issue on GitHub](https://github.com/YouFoundJK/plugin-full-calendar/issues).

---

[Getting Started](../../getting_started.md) · [Commands and Shortcuts](commands-and-shortcuts.md) · [Interactions and Gestures](../features/interactions.md)

