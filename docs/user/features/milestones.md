# Milestones and Progress

!!! success "Reward Your Consistency"
    Milestones provide long-horizon progress tracking across all your calendar activities. Designed to reward consistent usage without artificially inflating counts from failed operations, they gamify your productivity.

## Accessing Milestones

=== "FCR Command (Fastest)"

    The absolute fastest way to view your progress is to use the **[FCR Command](nlp.md)**. Just open the command palette (`Ctrl/Cmd + P`), select the FCR Command, and type `open milestones` or `show achievements`.

=== "Settings Menu"

    1. Open **Full Calendar Settings**.
    2. Navigate to the **Appearance** tab.
    3. Click the gear icon next to Milestones to open the dedicated page.
    4. Click **Back to settings** at the top when you are finished.

## Dashboard Overview

The Milestones dashboard provides a beautifully crafted view of your calendar journey. It displays interactive **Milestone cards** that automatically sort your unlocked achievements to the top. Each card features a clear **status badge**, descriptive target text, and a visual **progress bar** paired with a precise numeric label to track exactly how close you are to your next goal.

## Progression Mechanics

Your progress securely updates in the background after every successful, provider-backed operation. 

!!! info "Tracked Operations"
    Creating, updating, moving, or deleting events will increment your milestone counters. To ensure fairness, canceled operations, provider failures, and optimistic rollbacks do not inflate your stats.

**Comprehensive Source Coverage:**
Whether you're scheduling in [Local](../calendars/local.md) or [Daily Note](../calendars/dailynote.md) calendars, syncing with remote sources like Google and CalDAV, or managing productivity via [TaskNotes](../calendars/tasknotes.md), your activity counts. The system even evaluates behavioral metadata, rewarding advanced usages like recurring-series creation, heavy [NLP](nlp.md) utilization, distinct timezone tracking, and consistent daily streaks.

## Achievement Notifications

When your hard work pays off and a milestone unlocks, you will be celebrated with a non-blocking toast notification. If you unlock multiple milestones simultaneously, they elegantly queue and display in sequence, ensuring you never miss a reward.

!!! note "Under the Hood"
    Milestones are strictly read-only from the UI. Your unlock states and counters safely persist within the plugin's settings data, and your progress is dynamically computed from this secure state every time the dashboard renders. For technical details, see the [Milestones Architecture](../../architecture/system/features/milestones-architecture.md).

---

[Display and Behavior](../settings/fc_config.md) · [Settings and Customization](../settings/index.md)
