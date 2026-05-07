# Reminders & Notifications Architecture

!!! abstract "State Contract"
    The notification system is a reactive consumer of the `EventCache`'s `time-tick` stream. It maintains zero persistent state of its own, relying entirely on the canonical event data and runtime deduplication.

## The Notification Pipeline

1.  **Subscription**: The `NotificationManager` subscribes to the high-frequency `time-tick` event from the `EventCache`.
2.  **Lookahead Filtering**: On every tick, the manager filters the cache for events starting within the next 48 hours to minimize processing overhead.
3.  **Trigger Evaluation**:
    *   **Custom Priority**: If an event has a `notify` property in its metadata, the manager calculates a trigger point based on that value.
    *   **Default Fallback**: If no custom value exists, the manager uses the global `defaultReminderMinutes` setting.
4.  **Deduplication**: To prevent "notification storms" (especially during startup or timezone shifts), every triggered notification is keyed by `sessionId::type::triggerTime`. Once a key is added to the runtime `notifiedEvents` set, it cannot trigger again in the current session.

## Destructive Snooze Implementation

The decision to use a destructive snooze (modifying source data) rather than a runtime-only snooze was made to solve the **Multi-Device Conflict** problem.

### Rationale
If snooze was runtime-only, snoozing on a Desktop would not prevent a mobile device (or a Google Calendar notification) from firing at the original time. By modifying the source YAML or Google Event, the "snooze" state is synchronized across the entire ecosystem.

### Logic
*   **Time Shift**: For events without custom `notify` values, the `startTime` is incremented.
*   **Threshold Shift**: For events with `notify` values, the `notify` integer is decremented.

## Startup Safety (Recency Cutoff)

The manager implements a **5-minute recency cutoff**. If a reminder's trigger point was more than 5 minutes in the past (e.g., you open Obsidian at 14:05 for a 14:00 event with a 10-minute reminder), the notification is suppressed. This prevents a "spam" of missed notifications when starting the app after a long break.

---

[Event Cache](../../system/eventcache.md) · [Timezone Architecture](../../system/features/timezone-architecture.md) · [API Architecture](../../system/api-architecture.md)
