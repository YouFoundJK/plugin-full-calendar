# Commands and Shortcuts

This page lists user-facing commands and high-value shortcuts.

## Command Palette Commands

Open command palette with Ctrl/Cmd + P and search for these commands:

- `Full Calendar: New Event`
- `Full Calendar: Open Calendar`
- `Full Calendar: Open in sidebar`
- `Full Calendar: Reset Event Cache`
- `Full Calendar: Revalidate remote calendars`
- `Full Calendar: Open Chrono Analyser (Desktop Only)`

Conditional command:

- `Open tasks backlog` (appears when a Tasks provider is configured)

## Shortcuts and Fast Actions

- Left/Right arrow keys: navigate to previous or next time range when the calendar is focused.
- Arrow keys in text fields stay native (cursor movement) and do not trigger calendar navigation.
- Ctrl/Cmd + click on an event: open the event's source note.
- Ctrl/Cmd + mouse wheel: zoom time grid in supported calendar views.
- Right-click on an event: open event context menu.
- Right-click on date/view area: open date navigation context menu.

## Where this behavior comes from

These interactions are defined in the calendar view implementation and command registration:
- [Interactions and Gestures](interactions.md)
- [Event Management](../events/manage.md)
- [Troubleshooting](troubleshooting.md)
