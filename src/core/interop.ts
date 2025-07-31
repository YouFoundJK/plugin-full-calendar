/**
 * @file interop.ts
 * @brief Provides data conversion functions between OFCEvent and FullCalendar's EventInput.
 *
 * @description
 * This module acts as a data-translation layer between the plugin's internal `OFCEvent` format and FullCalendar's `EventInput` format.
 * It ensures correct interoperability for displaying events and handling user interactions such as dragging and resizing.
 * The conversion logic supports single, recurring, and rrule-based events, including timezone-aware processing and category coloring.
 *
 * @packageDocumentation
 * @module interop
 *
 * @exports toEventInput
 * @exports fromEventApi
 * @exports dateEndpointsToFrontmatter
 *
 * @license See LICENSE.md
 */

import { EventApi, EventInput } from '@fullcalendar/core';
import { OFCEvent } from '../types';

import { DateTime, Duration } from 'luxon';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import { FullCalendarSettings } from '../types/settings';
import { getCalendarColors } from '../ui/view';

/**
 * Functions for converting between the types used by the FullCalendar view plugin and
 * types used internally by Obsidian Full Calendar.
 *
 */
const parseTime = (time: string): Duration | null => {
  let parsed = DateTime.fromFormat(time, 'h:mm a');
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm');
  }
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm:ss');
  }

  if (parsed.invalidReason) {
    console.error(`FC: Error parsing time string '${time}': ${parsed.invalidReason}'`);
    return null;
  }

  const isoTime = parsed.toISOTime({
    includeOffset: false,
    includePrefix: false
  });

  if (!isoTime) {
    console.error(`FC: Could not convert parsed time to ISO for '${time}'`);
    return null;
  }

  return Duration.fromISOTime(isoTime);
};

const normalizeTimeString = (time: string): string | null => {
  const parsed = parseTime(time);
  if (!parsed) {
    return null;
  }
  return parsed.toISOTime({
    suppressMilliseconds: true,
    includePrefix: false,
    suppressSeconds: true
  });
};

const add = (date: DateTime, time: Duration): DateTime => {
  let hours = time.hours;
  let minutes = time.minutes;
  return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date): string => {
  const isoTime = DateTime.fromJSDate(date).toISOTime({
    suppressMilliseconds: true,
    includeOffset: false,
    suppressSeconds: true
  });
  if (!isoTime) {
    console.error('FC: Invalid time conversion from date:', date);
    return '';
  }
  return isoTime;
};

const getDate = (date: Date): string => DateTime.fromJSDate(date).toISODate() ?? '';

const combineDateTimeStrings = (date: string, time: string): string | null => {
  const parsedDate = DateTime.fromISO(date);
  if (parsedDate.invalidReason) {
    console.error(`FC: Error parsing time string '${date}': ${parsedDate.invalidReason}`);
    return null;
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return null;
  }

  return add(parsedDate, parsedTime).toISO({
    includeOffset: false,
    suppressMilliseconds: true
  });
};

const DAYS = 'UMTWRFS';

export function dateEndpointsToFrontmatter(
  start: Date,
  end: Date,
  allDay: boolean
): Partial<OFCEvent> {
  const date = getDate(start);
  const endDate = getDate(end);
  return {
    type: 'single',
    date,
    endDate: date !== endDate ? endDate : undefined,
    allDay,
    ...(allDay
      ? {}
      : {
          startTime: getTime(start),
          endTime: getTime(end)
        })
  };
}

/**
 * Converts an OFCEvent from the cache into an EventInput object that FullCalendar can render.
 * This function handles all event types (single, recurring, rrule) and correctly
 * formats dates, times, and recurrence rules.
 *
 * @param id The unique ID of the event.
 * @param frontmatter The OFCEvent object from the cache. Its dates/times have already been
 *                    converted to the display timezone by the `convertEvent` function.
 * @param settings The plugin settings, used for category coloring.
 * @returns An `EventInput` object, or `null` if the event data is invalid.
 */
export function toEventInput(
  id: string,
  frontmatter: OFCEvent,
  settings: FullCalendarSettings,
  calendarId?: string
): EventInput | null {
  let event: EventInput = {
    id,
    title: frontmatter.title, // Use the clean title for display
    allDay: frontmatter.allDay,
    extendedProps: {
      recurringEventId: frontmatter.recurringEventId,
      category: frontmatter.category
    }
  };

  if (settings.enableCategoryColoring && frontmatter.category) {
    const categorySetting = (settings.categorySettings || []).find(
      (c: any) => c.name === frontmatter.category
    );
    if (categorySetting) {
      const { color, textColor } = getCalendarColors(categorySetting.color);
      event.color = color;
      event.textColor = textColor;
    }
  }

  // -----------------------------------------------------------------------
  // Recurring events (timezone-aware & bullet-proof)
  // -----------------------------------------------------------------------
  if (frontmatter.type === 'recurring') {
    // ====================================================================
    // Timezone-Aware Conversion (Final Version)
    // ====================================================================
    // The frontmatter object's times are already in the displayTimezone.
    // We will build a compliant iCalendar string that explicitly states this
    // timezone context for DTSTART and all EXDATEs.

    // A. Identify zone
    const displayZone =
      frontmatter.timezone || settings.displayTimezone || DateTime.local().zoneName;
    // const displayZone = settings.displayTimezone || DateTime.local().zoneName;

    // B. Create the timezone-aware DTSTART value first.
    let dtstart: DateTime;
    const startRecurDate = frontmatter.startRecur || '1970-01-01';

    // For all-day events, DTSTART is a simple date, but for timed events, it must be
    // a full DateTime interpreted in the displayZone.
    if (frontmatter.allDay) {
      // NOTE: Even for all-day, we create a full DateTime object to make the
      // UNTIL calculation below simpler. The final string will be formatted correctly.
      dtstart = DateTime.fromISO(startRecurDate, { zone: displayZone }).startOf('day');
    } else {
      const startTimeDt = parseTime(frontmatter.startTime);
      if (!startTimeDt) return null;

      dtstart = DateTime.fromISO(startRecurDate, { zone: displayZone }).set({
        hour: startTimeDt.hours,
        minute: startTimeDt.minutes,
        second: 0,
        millisecond: 0
      });
    }

    // C. Create the RRULE string part, including a timezone-aware UNTIL.
    const weekdays = { U: 'SU', M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA' };
    const byday =
      frontmatter.daysOfWeek?.map((c: string) => weekdays[c as keyof typeof weekdays]) || [];

    let rruleString = `FREQ=WEEKLY;BYDAY=${byday.join(',')}`;

    if (frontmatter.endRecur) {
      const endLocal = DateTime.fromISO(frontmatter.endRecur, { zone: displayZone }).endOf('day');

      // To determine if UNTIL is valid, find the date of the first actual occurrence.
      const luxonWeekdayMap = { SU: 7, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
      const weekdayNums = byday.map(
        (code: string) => luxonWeekdayMap[code as keyof typeof luxonWeekdayMap]
      );
      const daysToFirst = Math.min(
        ...weekdayNums.map((w: number) => (w - dtstart.weekday + 7) % 7)
      );
      const firstOccur = dtstart.plus({ days: daysToFirst });

      if (endLocal >= firstOccur.startOf('day')) {
        const until = endLocal.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
        rruleString += `;UNTIL=${until}`;
      }
    }

    // D. Assemble the final rruleSet string

    // For timed events, DTSTART must include the TZID. For all-day events, it must NOT.
    const dtstartString = frontmatter.allDay
      ? `DTSTART;VALUE=DATE:${dtstart.toFormat('yyyyMMdd')}`
      : `DTSTART;TZID=${displayZone}:${dtstart.toFormat("yyyyMMdd'T'HHmmss")}`;

    const exdateStrings = (frontmatter.skipDates || [])
      .map((skipDate: string) => {
        // Correctly handle EXDATE for all-day vs timed events.
        if (frontmatter.allDay) {
          // All-day exclusions are simple dates, no timezone.
          const exdateDt = DateTime.fromISO(skipDate, { zone: displayZone }).startOf('day');
          return `EXDATE;VALUE=DATE:${exdateDt.toFormat('yyyyMMdd')}`;
        } else {
          // Timed exclusions MUST be in the same timezone context as DTSTART.
          const startTimeDt = parseTime(frontmatter.startTime);
          if (!startTimeDt) return null;

          const exdateInDisplay = DateTime.fromISO(skipDate, { zone: displayZone }).set({
            hour: startTimeDt.hours,
            minute: startTimeDt.minutes,
            second: 0,
            millisecond: 0
          });
          return `EXDATE;TZID=${displayZone}:${exdateInDisplay.toFormat("yyyyMMdd'T'HHmmss")}`;
        }
      })
      .flatMap((s: string | null) => (s ? [s] : []));

    const finalRruleSetString = [dtstartString, `RRULE:${rruleString}`, ...exdateStrings].join(
      '\n'
    );
    event.rrule = finalRruleSetString;

    // Add duration for timed events (this part is correct as-is).
    if (!frontmatter.allDay && frontmatter.startTime && frontmatter.endTime) {
      const startTime = parseTime(frontmatter.startTime);
      const endTime = parseTime(frontmatter.endTime);
      if (startTime && endTime) {
        const duration = endTime.minus(startTime);
        if (duration.as('milliseconds') > 0) {
          event.duration = duration.toFormat('hh:mm');
        }
      }
    }

    event.extendedProps = { ...event.extendedProps, isTask: !!frontmatter.isTask };
  } else if (frontmatter.type === 'rrule') {
    const dtstart = (() => {
      if (frontmatter.allDay) {
        return DateTime.fromISO(frontmatter.startDate);
      } else {
        const dtstartStr = combineDateTimeStrings(frontmatter.startDate, frontmatter.startTime);

        if (!dtstartStr) {
          return null;
        }
        return DateTime.fromISO(dtstartStr);
      }
    })();
    if (dtstart === null) {
      return null;
    }
    // NOTE: how exdates are handled does not support events which recur more than once per day.
    const exdate = frontmatter.skipDates
      .map((d: string) => {
        // Can't do date arithmetic because timezone might change for different exdates due to DST.
        // RRule only has one dtstart that doesn't know about DST/timezone changes.
        // Therefore, just concatenate the date for this exdate and the start time for the event together.
        const date = DateTime.fromISO(d).toISODate();
        const time = dtstart.toJSDate().toISOString().split('T')[1];

        return `${date}T${time}`;
      })
      .flatMap((d: string) => (d ? [d] : []));

    event = {
      id,
      title: frontmatter.title,
      allDay: frontmatter.allDay,
      rrule: rrulestr(frontmatter.rrule, {
        dtstart: dtstart.toJSDate()
      }).toString(),
      exdate,
      extendedProps: { ...event.extendedProps, isTask: !!frontmatter.isTask } // Added line
    };

    if (!frontmatter.allDay) {
      const startTime = parseTime(frontmatter.startTime);
      if (startTime && frontmatter.endTime) {
        const endTime = parseTime(frontmatter.endTime);
        const duration = endTime?.minus(startTime);
        if (duration) {
          event.duration = duration.toISOTime({
            includePrefix: false,
            suppressMilliseconds: true,
            suppressSeconds: true
          });
        }
      }
    }
  } else if (frontmatter.type === 'single') {
    if (!frontmatter.allDay) {
      const start = combineDateTimeStrings(frontmatter.date, frontmatter.startTime);
      if (!start) {
        return null;
      }
      let end: string | null | undefined = undefined;
      if (frontmatter.endTime) {
        end = combineDateTimeStrings(frontmatter.endDate || frontmatter.date, frontmatter.endTime);
        if (!end) {
          return null;
        }
      }

      event = {
        ...event,
        start,
        end,
        extendedProps: {
          ...event.extendedProps,
          isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
          taskCompleted: frontmatter.completed
        }
      };
    } else {
      const isLocalCalendar = calendarId?.startsWith('local::');
      let adjustedEndDate: string | undefined;

      if (!frontmatter.endDate) {
        // Single-day event: no end date needed
        adjustedEndDate = undefined;
      } else if (isLocalCalendar) {
        // Multi-day local event: add 1 day to fix FullCalendar's exclusive end date
        adjustedEndDate =
          DateTime.fromISO(frontmatter.endDate).plus({ days: 1 }).toISODate() ?? undefined;
      } else {
        // Multi-day external event: use as-is
        adjustedEndDate = frontmatter.endDate;
      }

      event = {
        ...event,
        start: frontmatter.date,
        end: adjustedEndDate,
        extendedProps: {
          ...event.extendedProps,
          isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
          taskCompleted: frontmatter.completed
        }
      };
    }
  }

  return event;
}

/**
 * Converts an `EventApi` object from FullCalendar back into an `OFCEvent`.
 * This is typically used after a user interaction, like dragging or resizing an event,
 * to get the new event data in a format that can be saved back to the cache and disk.
 *
 * @param event The `EventApi` object from FullCalendar.
 * @returns An `OFCEvent` object.
 */
export function fromEventApi(event: EventApi): OFCEvent {
  // We need the category from the original event, as it's not stored on the EventApi object.
  // This is a limitation. We assume the category does not change on drag/resize.
  // The edit modal is the only place to change a category.
  const originalCategory = event.extendedProps.category;

  const isRecurring: boolean = event.extendedProps.daysOfWeek !== undefined;
  const startDate = getDate(event.start as Date);
  const endDate = getDate(event.end as Date);
  return {
    title: event.title,
    category: event.extendedProps.category, // Preserve the category
    recurringEventId: event.extendedProps.recurringEventId,
    ...(event.allDay
      ? { allDay: true }
      : {
          allDay: false,
          startTime: getTime(event.start as Date),
          endTime: getTime(event.end as Date)
        }),

    ...(isRecurring
      ? {
          type: 'recurring',
          daysOfWeek: event.extendedProps.daysOfWeek.map((i: number) => DAYS[i]),
          startRecur: event.extendedProps.startRecur && getDate(event.extendedProps.startRecur),
          endRecur: event.extendedProps.endRecur && getDate(event.extendedProps.endRecur),
          skipDates: [], // Default to empty as exception info is unavailable
          isTask: event.extendedProps.isTask
        }
      : {
          type: 'single',
          date: startDate,
          ...(startDate !== endDate ? { endDate } : { endDate: null }),
          completed: event.extendedProps.taskCompleted
        })
  };
}
