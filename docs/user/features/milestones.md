# Milestones and Progress

Milestones provide long-horizon progress tracking across event operations. The feature is read-only from the user view and is designed to reward consistent calendar usage without inflating counts from failed operations.

## Where To Open It

1. Open Full Calendar settings.
2. Go to Appearance.
3. Use the milestones gear action to open the dedicated milestones page.
4. Use Back to settings at the top when finished.

## What The Page Shows

- Milestone cards sorted with unlocked cards first.
- A status badge for each card.
- Target and description text for each milestone.
- A progress bar based on normalized percentage.
- A numeric progress label.

## What Increments Progress

Progress updates only after successful provider-backed operations. Tracked operations include:

- Event created
- Event updated
- Event deleted
- Event moved

This means canceled operations, provider failures, optimistic placeholders that roll back, and disabled tracking paths do not inflate counters.

## Coverage Across Sources

Milestones evaluate total activity and source-specific activity. This includes:

- Local calendars
- Daily Note calendars
- ICS, CalDAV, and Google calendars
- Tasks and TaskNotes calendars
- Bases for provider-threshold milestones

Some milestones also evaluate behavioral metadata such as recurring-series creation, NLP-based creation volume, distinct timezone usage, active remote source count, and streak-like activity patterns.

## Notifications

When a milestone unlocks, a non-blocking notice toast is shown. Multiple unlocks in one operation are queued and displayed in sequence.

## Design Constraints

- Milestones are read-only from the UI.
- Unlock state and counters persist in plugin settings data.
- Progress is computed from current persisted state at render time.

## Related Docs

- [Display and Behavior](../settings/fc_config.md)
- [Settings and Customization](../settings/index.md)
- [Milestones Architecture](../../architecture/system/features/milestones-architecture.md)
