/**
 * @file Timezone.ts
 * @brief Provides core utility functions for timezone conversions.
 *
 * @description
 * This file contains the foundational `convertEvent` function, which is the
 * single source of truth for translating an OFCEvent object from one IANA
 * timezone to another. It uses the `luxon` library to handle the complexities
 * of date and time math, including DST adjustments, ensuring that all time
 * conversions are accurate and consistent.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */
import { DateTime } from 'luxon';
import { Notice } from 'obsidian';
import { RRule, Weekday } from 'rrule';
import { OFCEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { t } from '../i18n/i18n';

/**
 * Helper function to parse a time string (HH:mm or h:mm a) into a Luxon DateTime object.
 * Note: This returns a full DateTime, but we only use the time part.
 */
function parseTime(time: string): DateTime | null {
  let parsed = DateTime.fromFormat(time, 'HH:mm');
  if (!parsed.isValid) {
    parsed = DateTime.fromFormat(time, 'h:mm a');
  }
  return parsed.isValid ? parsed : null;
}

/**
 * Translates the date/time fields of an OFCEvent from a source timezone to a target timezone.
 * All-day events are returned unmodified.
 * @param event The event to convert.
 * @param sourceZone The IANA timezone the event's times are currently in.
 * @param targetZone The IANA timezone to convert the event's times to.
 * @returns A new OFCEvent object with its time fields adjusted to the target timezone.
 */
export function convertEvent<T extends OFCEvent>(
  event: T,
  sourceZone: string,
  targetZone: string
): T {
  // All-day events are timezone-agnostic and returned as is.
  if (event.allDay) {
    return event;
  }

  // This type guard is essential. Inside this block, `event` is known to have
  // `type: 'single'`, `allDay: false`, and all the necessary date/time properties.
  if (event.type === 'single' && !event.allDay) {
    const startTime = parseTime(event.startTime);
    if (!startTime) {
      return event; // Return original event if start time is invalid.
    }

    // Phase 1: Determine Authoritative Start and End DateTimes in the sourceZone.
    const startDateTime = DateTime.fromISO(`${event.date}T${startTime.toFormat('HH:mm')}`, {
      zone: sourceZone
    });

    let endDateTime: DateTime;
    if (event.endTime) {
      const endTime = parseTime(event.endTime);
      if (!endTime) {
        endDateTime = startDateTime.plus({ hours: 1 });
      } else {
        const endDateString = event.endDate || event.date;
        let tempEndDateTime = DateTime.fromISO(`${endDateString}T${endTime.toFormat('HH:mm')}`, {
          zone: sourceZone
        });

        if (!event.endDate && tempEndDateTime < startDateTime) {
          tempEndDateTime = tempEndDateTime.plus({ days: 1 });
        }
        endDateTime = tempEndDateTime;
      }
    } else {
      endDateTime = startDateTime.plus({ hours: 1 });
    }

    // Phase 2: Convert Authoritative DateTimes to the targetZone.
    const convertedStart = startDateTime.setZone(targetZone);
    const convertedEnd = endDateTime.setZone(targetZone);

    // Phase 3: Deconstruct into a new OFCEvent object within the return statement.
    const finalEndDate = convertedStart.hasSame(convertedEnd, 'day')
      ? null
      : convertedEnd.startOf('day').equals(convertedEnd)
        ? convertedEnd.minus({ milliseconds: 1 }).toISODate()!
        : convertedEnd.toISODate()!;

    const result = {
      ...event,
      date: convertedStart.toISODate()!,
      startTime: convertedStart.toFormat('HH:mm'),
      endTime: convertedEnd.toFormat('HH:mm'),
      endDate: finalEndDate
    };

    return result;
  }

  if (event.type === 'recurring') {
    // We already checked !event.allDay above, so this cast is safe.
    return convertRecurringEvent(event as RecurringTimedEvent, sourceZone, targetZone) as T;
  }

  if (event.type === 'rrule') {
    // We explicitly do not convert rrule events here. FullCalendar's rrule plugin
    // handles timezone expansion itself, provided we pass the original TZID.
    return event;
  }

  // For other types, return the event unmodified for now.
  return event;
}

const WEEKDAYS = ['U', 'M', 'T', 'W', 'R', 'F', 'S'] as const;

type RecurringTimedEvent = Extract<OFCEvent, { type: 'recurring'; allDay: false }>;
type RRuleEvent = Extract<OFCEvent, { type: 'rrule' }>;

function convertRRuleEvent(event: RRuleEvent, sourceZone: string, targetZone: string): RRuleEvent {
  // startDate can be either:
  //   - date-only: "2025-05-26" (with separate startTime field)
  //   - full ISO:  "2025-06-01T10:00:00" (time embedded)
  // We must handle both formats correctly.
  const timed = event as Extract<RRuleEvent, { allDay: false }>;
  const startDateHasTime = event.startDate.includes('T');

  let sourceDt: DateTime;
  if (startDateHasTime) {
    // Full ISO — time is embedded in startDate, parse directly.
    sourceDt = DateTime.fromISO(event.startDate, { zone: sourceZone });
  } else if (!event.allDay && timed.startTime) {
    // Date-only with separate startTime — combine them.
    sourceDt = DateTime.fromISO(`${event.startDate}T${timed.startTime}`, { zone: sourceZone });
  } else {
    // All-day or no startTime — use midnight.
    sourceDt = DateTime.fromISO(`${event.startDate}T00:00`, { zone: sourceZone });
  }

  if (!sourceDt.isValid) {
    return event;
  }

  const targetDt = sourceDt.setZone(targetZone);

  // Generate newStartDate in the same format as the input.
  let newStartDate: string;
  if (startDateHasTime) {
    // Input was full ISO → output full ISO (preserving the format downstream expects).
    const iso = targetDt.toISO();
    if (!iso) return event;
    newStartDate = iso;
  } else {
    // Input was date-only → output date-only (YYYY-MM-DD).
    const isoDate = targetDt.toISODate();
    if (!isoDate) return event;
    newStartDate = isoDate;
  }

  // Convert startTime and endTime for timed events with separate time fields.
  let newStartTime: string | undefined;
  let newEndTime: string | null | undefined;
  if (!event.allDay && timed.startTime && !startDateHasTime) {
    // Only update startTime/endTime when they exist as separate fields.
    newStartTime = targetDt.toFormat('HH:mm');

    if (timed.endTime) {
      const endParsed = parseTime(timed.endTime);
      if (endParsed) {
        let sourceEndDt = DateTime.fromISO(`${event.startDate}T${endParsed.toFormat('HH:mm')}`, {
          zone: sourceZone
        });
        // Handle events crossing midnight (endTime < startTime)
        if (sourceEndDt < sourceDt) {
          sourceEndDt = sourceEndDt.plus({ days: 1 });
        }
        newEndTime = sourceEndDt.setZone(targetZone).toFormat('HH:mm');
      }
    }
  }

  // Calculate day offset using the ACTUAL event time, not midnight.
  const sDate = sourceDt.toISODate();
  const tDate = targetDt.toISODate();
  let dayOffset = 0;
  if (sDate && tDate && sDate !== tDate) {
    if (tDate > sDate) dayOffset = 1;
    else if (tDate < sDate) dayOffset = -1;
  }

  let newRRuleString = event.rrule;

  // If there is a day offset, we must adjust BYDAY rules in the RRule string.
  if (dayOffset !== 0) {
    try {
      const options = RRule.parseString(event.rrule);
      if (options.byweekday) {
        const originalDays = Array.isArray(options.byweekday)
          ? options.byweekday
          : [options.byweekday];

        const newDays = originalDays.map(day => {
          let val: number;
          if (typeof day === 'number') {
            val = day;
          } else if (day instanceof Weekday) {
            val = day.weekday;
          } else {
            return day;
          }

          let newVal = (val + dayOffset) % 7;
          if (newVal < 0) newVal += 7;
          return new Weekday(newVal);
        });

        options.byweekday = newDays;
        newRRuleString = new RRule(options).toString();
      }
    } catch (e) {
      console.warn('Failed to parse or convert RRule string during timezone shift', e);
    }
  }

  // Handle Skip Dates — use the actual event time for each skip date conversion.
  let newSkipDates = event.skipDates;
  if (event.skipDates) {
    newSkipDates = event.skipDates
      .map(dateStr => {
        const skipDt = DateTime.fromISO(`${dateStr}T${sourceDt.toFormat('HH:mm')}`, {
          zone: sourceZone
        });
        if (!skipDt.isValid) return dateStr;
        return skipDt.setZone(targetZone).toISODate();
      })
      .filter(d => d !== null) as string[];
  }

  // Build result: spread base fields, then conditionally add time fields.
  const result: RRuleEvent = {
    ...event,
    startDate: newStartDate,
    rrule: newRRuleString,
    skipDates: newSkipDates,
    timezone: targetZone
  };

  // For timed events, update startTime and endTime on the result.
  if (!event.allDay && newStartTime !== undefined) {
    (result as Extract<RRuleEvent, { allDay: false }>).startTime = newStartTime;
    if (newEndTime !== undefined) {
      (result as Extract<RRuleEvent, { allDay: false }>).endTime = newEndTime;
    }
  }

  return result;
}

function convertRecurringEvent(
  event: RecurringTimedEvent,
  sourceZone: string,
  targetZone: string
): RecurringTimedEvent {
  const startTime = parseTime(event.startTime);
  if (!startTime) {
    // This should ideally not happen if event.startTime is guaranteed by type,
    // but parseTime can still return null for invalid formats.
    return event;
  }

  const referenceDate = event.startRecur || DateTime.now().toISODate();
  // Construct a reference DateTime in the source zone to calculate offsets.
  const sourceDt = DateTime.fromISO(`${referenceDate}T${startTime.toFormat('HH:mm')}`, {
    zone: sourceZone
  });

  if (!sourceDt.isValid) {
    return event;
  }

  const targetDt = sourceDt.setZone(targetZone);

  // Calculate day offset: -1 (yesterday), 0 (same day), 1 (tomorrow)
  // We compare the weekday index.
  // Note: sourceDt.weekday returns 1-7 (Mon-Sun).
  // We need to handle wrapping (Sun -> Mon or Mon -> Sun).
  // Easiest is to compare the ISO dates or ordinal days, but that's messy with year boundaries.
  // Let's use diff in days, ensuring we account for time.
  const sourceDayStart = sourceDt.startOf('day');
  const targetDayStart = targetDt.startOf('day');

  // Luxon: 1=Mon...7=Sun.
  // Our week: 0=Sun, 1=Mon...6=Sat.
  const luxonToOurWeek = (luxonIsoWeekday: number) => (luxonIsoWeekday === 7 ? 0 : luxonIsoWeekday);

  const sourceIndex = luxonToOurWeek(sourceDt.weekday);
  const targetIndex = luxonToOurWeek(targetDt.weekday);

  let dayOffset = targetIndex - sourceIndex;
  // Handle wrap around:
  if (dayOffset === 6) dayOffset = -1;
  else if (dayOffset === -6) dayOffset = 1;

  // Verify with full date comparison to be safe against edge cases
  const sDate = sourceDt.toISODate();
  const tDate = targetDt.toISODate();
  if (sDate && tDate && sDate !== tDate) {
    if (tDate > sDate) dayOffset = 1;
    else if (tDate < sDate) dayOffset = -1;
    else dayOffset = 0;
  } else if (!sDate || !tDate) {
    // Should not happen if valid, but safe fallback
    dayOffset = 0;
  }

  // 1. Shift Start Time / End Time
  const newStartTime = targetDt.toFormat('HH:mm');
  let newEndTime = event.endTime;
  if (event.endTime) {
    const endTime = parseTime(event.endTime);
    if (endTime) {
      // Careful: endTime might be on the next day relative to startTime.
      // Construct endTime relative to sourceDt.
      let sourceEndDt = DateTime.fromISO(`${referenceDate}T${endTime.toFormat('HH:mm')}`, {
        zone: sourceZone
      });
      if (sourceEndDt < sourceDt) {
        sourceEndDt = sourceEndDt.plus({ days: 1 });
      }
      const targetEndDt = sourceEndDt.setZone(targetZone);
      newEndTime = targetEndDt.toFormat('HH:mm');
    }
  }

  // 2. Shift Days of Week
  let newDaysOfWeek = event.daysOfWeek;
  if (event.daysOfWeek && dayOffset !== 0) {
    newDaysOfWeek = event.daysOfWeek.map(dayChar => {
      const idx = WEEKDAYS.indexOf(dayChar);
      if (idx === -1) return dayChar;
      let newIdx = (idx + dayOffset) % 7;
      if (newIdx < 0) newIdx += 7;
      return WEEKDAYS[newIdx];
    });
  }

  // 3. Convert Skip Dates
  let newSkipDates = event.skipDates;
  if (event.skipDates) {
    newSkipDates = event.skipDates
      .map(dateStr => {
        const skipDt = DateTime.fromISO(`${dateStr}T${startTime.toFormat('HH:mm')}`, {
          zone: sourceZone
        });
        if (!skipDt.isValid) return dateStr;
        return skipDt.setZone(targetZone).toISODate();
      })
      .filter(d => d !== null) as string[];
  }

  // 4. Return new event
  return {
    ...event,
    startTime: newStartTime,
    endTime: newEndTime,
    daysOfWeek: newDaysOfWeek,
    skipDates: newSkipDates,
    // Explicitly set the timezone to the target zone to "lock" it in for the view.
    timezone: targetZone
  } as RecurringTimedEvent;
}

/**
 * Manages the plugin's timezone settings by comparing the system timezone with stored settings.
 * This function should be called once when the plugin loads.
 *
 * @param plugin The instance of the FullCalendarPlugin.
 */
export async function manageTimezone(plugin: FullCalendarPlugin): Promise<void> {
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const settings = plugin.settings;

  if (!settings.lastSystemTimezone || settings.displayTimezone === null) {
    // Case 1: First run, or settings are in a pre-timezone-feature state.
    // Initialize everything to the current system's timezone.
    settings.lastSystemTimezone = systemTimezone;
    settings.displayTimezone = systemTimezone;
    // Use saveData directly to avoid triggering a full cache reset.
    await plugin.saveData(settings);
  } else if (settings.lastSystemTimezone !== systemTimezone) {
    // Case 2: The system timezone has changed since the last time Obsidian was run.
    // This is a critical change. We must update the user's view.
    settings.displayTimezone = systemTimezone; // Force reset the display timezone.
    settings.lastSystemTimezone = systemTimezone;
    await plugin.saveData(settings);

    new Notice(
      t('notices.timezoneChanged', { timezone: systemTimezone }),
      10000 // 10-second notice
    );
  }
  // Case 3: System timezone is unchanged. We do nothing, respecting the user's
  // potentially custom `displayTimezone` setting from the settings tab.
}
