# Troubleshooting

Use this page as a first response checklist.

## Missing events

1. Run `Full Calendar: Reset Event Cache`.
2. Reopen the calendar view.
3. Verify calendar source is enabled and visible.

## Remote calendars not updated

1. Run `Full Calendar: Revalidate remote calendars`.
2. Recheck provider credentials and account setup.
3. Confirm network access and provider limits.

## Reminders not firing

1. Confirm reminder settings are enabled.
2. Confirm OS-level notifications are allowed for Obsidian.
3. Test with an event that starts within a short window.

See: [Reminders and Notifications](reminders.md)

## Wrong times around DST/timezones

1. Check display timezone settings.
2. Confirm source calendar timezone assumptions.
3. Re-test with new event creation in target timezone.

See: [Timezone Support](../events/timezones.md)

## Useful references

- [Commands and Shortcuts](commands-and-shortcuts.md)
- [Interactions and Gestures](interactions.md)
- [Getting Started](../getting_started.md)
