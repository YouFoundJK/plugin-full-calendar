# Reminders Architecture

!!! abstract "Reminder model"
    Reminder delivery is a time-driven policy layer built on top of canonical event state. It is intentionally decoupled from provider I/O and depends on `time-tick` events from the core time engine.

## Runtime pipeline

1. `TimeEngine` emits `time-tick` state.
2. `NotificationManager` receives current/upcoming occurrences.
3. Reminder policy evaluates custom reminder first, then default reminder fallback.
4. Deduplication guard suppresses duplicate notifications per session-trigger instance.
5. Notification click actions route to reminder modal follow-up UX.

## Trigger policy

- Custom reminder value takes priority when present.
- Default reminder value is applied only when custom reminder is absent and default reminders are enabled.
- Recency cutoff prevents stale notifications from firing on startup.
- Lookahead window limits work and avoids scanning distant occurrences.

## Failure and UX behavior

Notification dispatch failures are logged and surfaced with Obsidian notices. The model favors graceful degradation over silent failure.

## Invariants for contributors

- Do not bypass `time-tick` for reminder scheduling.
- Preserve deduplication key semantics (`sessionId::type::triggerTime`).
- Keep reminder logic deterministic across startup and cache repopulation.
- Any reminder policy change requires docs and tests alignment.

## Integration anchors

- `src/features/notifications/NotificationManager.ts`
- `src/features/notifications/ui/reminder_modal.ts`
- `src/core/TimeEngine.ts`
- `src/core/EventCache.ts`
