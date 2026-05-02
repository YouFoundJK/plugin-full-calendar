# Reminders and Notifications

Full Calendar supports event reminders with default and per-event behavior.

## Settings

In plugin settings, configure reminders under `Reminders`:

- `Enable default reminder`: automatically attach reminder behavior for events without custom reminder values.
- `Default reminder time`: minutes before event start (default: 10).

## How reminders are applied

1. If an event has a custom reminder value, that custom value is used.
2. If no custom reminder exists and default reminders are enabled, the default reminder time is used.

## Runtime behavior

- Reminders are driven by the plugin time-tick pipeline.
- Notifications are deduplicated during session runtime.
- Clicking a notification opens a reminder modal for quick follow-up actions.

## Notes

- Reminders are intended for upcoming events and avoid stale startup spam.
- If reminders are not firing, verify OS notification permissions and plugin reminder settings.

See: [Troubleshooting](troubleshooting.md)
