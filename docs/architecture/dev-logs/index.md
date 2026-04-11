# Dev Logs

This section indexes focused engineering investigations, root-cause analyses, and implementation notes that are useful to preserve alongside the architecture docs.

## Available Logs

### [Calendar Load Profiling Audit](devlog_calendar_load_profiling_2026-04-11.md)

- Date: 2026-04-11
- Focus: calendar open latency, staged loading behavior, and large Daily Note update profiling
- Key takeaway: the biggest bottleneck is large-update cache synchronization in `EventCache.syncCalendar()`, not initial stage-1 fetch

### [RRULE Timezone Date-Shift Fix](devlog_rrule_timezone_patch.md)

- Date: preserved from implementation context
- Focus: recurring-event date shifts caused by timezone-aware RRULE expansion
- Key takeaway: the plugin applies a targeted timezone expansion patch to keep recurrence dates stable across timezone combinations
