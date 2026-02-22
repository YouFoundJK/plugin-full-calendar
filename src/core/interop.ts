/**
 * @file interop.ts
 * @brief Provides data conversion functions between OFCEvent and FullCalendar's EventInput.
 *
 * @description
 * This module acts as a data-translation layer between the plugin's internal `OFCEvent` format and FullCalendar's `EventInput` format.
 * It ensures correct INTEROPerability for displaying events and handling user interactions such as dragging and resizing.
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

import { rrulestr } from 'rrule';
import { DateTime, Duration } from 'luxon';

import { OFCEvent } from '../types';
import { getCalendarColors } from '../ui/view';
import { FullCalendarSettings } from '../types/settings';

import { EventApi, EventInput } from '@fullcalendar/core';

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

const add = (date: DateTime, time: Duration): DateTime => {
  const hours = time.hours;
  const minutes = time.minutes;
  return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date, displayZone: string): string => {
  const isoTime = DateTime.fromJSDate(date).setZone(displayZone).toISOTime({
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

const getDate = (date: Date, displayZone: string): string =>
  DateTime.fromJSDate(date).setZone(displayZone).toISODate() ?? '';

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
  allDay: boolean,
  displayZone: string
): Partial<OFCEvent> {
  const date = getDate(start, displayZone);
  const endDate = getDate(end, displayZone);
  return {
    type: 'single',
    date,
    endDate: date !== endDate ? endDate : undefined,
    allDay,
    ...(allDay
      ? {}
      : {
          startTime: getTime(start, displayZone),
          endTime: getTime(end, displayZone)
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
  settings: FullCalendarSettings
): EventInput | null {
  // MODIFICATION: Return type is now EventInput | null
  const displayTitle = frontmatter.subCategory
    ? `${frontmatter.subCategory} - ${frontmatter.title}`
    : frontmatter.title;

  const baseEvent: EventInput = {
    id,
    title: displayTitle,
    allDay: frontmatter.allDay,
    extendedProps: {
      uid: frontmatter.uid,
      recurringEventId: frontmatter.recurringEventId,
      category: frontmatter.category,
      subCategory: frontmatter.subCategory,
      cleanTitle: frontmatter.title,
      isShadow: false // Flag to identify the real event
    },
    // Support for background events and other display types
    ...(frontmatter.display && { display: frontmatter.display })
  };

  // Assign category-level coloring
  if (settings.enableAdvancedCategorization && frontmatter.category) {
    const categorySetting = (settings.categorySettings || []).find(
      (c: { name: string; color: string }) => c.name === frontmatter.category
    );
    if (categorySetting) {
      const { color, textColor } = getCalendarColors(categorySetting.color);
      baseEvent.color = color;
      baseEvent.textColor = textColor;
    }

    // NEW: Assign resource ID for timeline view
    const subCategoryName = frontmatter.subCategory || '__NONE__';
    baseEvent.resourceId = `${frontmatter.category}::${subCategoryName}`;
  }

  // --- Main Event Logic (largely the same, but populates baseEvent) ---
  if (frontmatter.type === 'recurring') {
    // ====================================================================
    // Time-zone–aware conversion (fixed version)
    // ====================================================================

    // 1  Pick the zone
    const displayZone =
      frontmatter.timezone || settings.displayTimezone || DateTime.local().zoneName;

    // Use a recent default start date to avoid massive recurrence expansions when startRecur is absent.
    const startRecurDate =
      frontmatter.startRecur ||
      DateTime.local().startOf('year').toISODate() ||
      DateTime.local().toISODate() ||
      '2025-01-01';
    let dtstart: DateTime;

    // 2  Build the local start-of-series DateTime
    if (frontmatter.allDay) {
      dtstart = DateTime.fromISO(startRecurDate, { zone: displayZone }).startOf('day'); // 00:00 in displayZone
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

    // 3  RRULE string (plus UNTIL if endRecur exists)
    // START REPLACEMENT
    let rruleString: string;
    const weekdays = { U: 'SU', M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA' };
    const rruleWeekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    if (frontmatter.daysOfWeek?.length) {
      const byday = frontmatter.daysOfWeek.map((c: keyof typeof weekdays) => weekdays[c]);
      rruleString = `FREQ=WEEKLY;BYDAY=${byday.join(',')}`;
    } else if (frontmatter.repeatOn) {
      const byday = rruleWeekdays[frontmatter.repeatOn.weekday];
      const bysetpos = frontmatter.repeatOn.week;
      // Note: rrule.js seems to use BYSETPOS for this, which is correct.
      rruleString = `FREQ=MONTHLY;BYDAY=${byday};BYSETPOS=${bysetpos}`;
    } else if (frontmatter.month && frontmatter.dayOfMonth) {
      rruleString = `FREQ=YEARLY;BYMONTH=${frontmatter.month};BYMONTHDAY=${frontmatter.dayOfMonth}`;
    } else if (frontmatter.dayOfMonth) {
      rruleString = `FREQ=MONTHLY;BYMONTHDAY=${frontmatter.dayOfMonth}`;
    } else {
      console.error('FullCalendar: invalid recurring event frontmatter.', frontmatter);
      return null;
    }

    if (frontmatter.repeatInterval && frontmatter.repeatInterval > 1) {
      rruleString += `;INTERVAL=${frontmatter.repeatInterval}`;
    }
    // END REPLACEMENT

    if (frontmatter.endRecur) {
      const endLocal = DateTime.fromISO(frontmatter.endRecur, { zone: displayZone }).endOf('day');

      // Only add UNTIL if it occurs on/after the first generated instance
      const firstOccurDate = rrulestr(`RRULE:${rruleString}`, {
        dtstart: dtstart.toJSDate()
      }).after(dtstart.toJSDate(), true);

      if (firstOccurDate) {
        const firstOccur = DateTime.fromJSDate(firstOccurDate, { zone: displayZone });
        if (endLocal >= firstOccur.startOf('day')) {
          const until = endLocal.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
          rruleString += `;UNTIL=${until}`;
        }
      }
    }

    // 4  DTSTART – always include TZID to avoid floating-date bugs
    const dtstartString = `DTSTART;TZID=${displayZone}:${dtstart.toFormat("yyyyMMdd'T'HHmmss")}`;

    // 5  EXDATEs – also anchored to the same zone
    const exdateStrings = (frontmatter.skipDates || [])
      .map((skipDate: string) => {
        if (frontmatter.allDay) {
          const exDt = DateTime.fromISO(skipDate, { zone: displayZone }).startOf('day');
          return `EXDATE;TZID=${displayZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
        } else {
          const startTimeDt = parseTime(frontmatter.startTime);
          if (!startTimeDt) return null;

          const exDt = DateTime.fromISO(skipDate, { zone: displayZone }).set({
            hour: startTimeDt.hours,
            minute: startTimeDt.minutes,
            second: 0,
            millisecond: 0
          });
          return `EXDATE;TZID=${displayZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
        }
      })
      .filter(Boolean) as string[];

    // 6  Assemble the full iCalendar text
    baseEvent.rrule = [dtstartString, `RRULE:${rruleString}`, ...exdateStrings].join('\n');

    // 7  Duration for timed events
    if (!frontmatter.allDay && frontmatter.startTime && frontmatter.endTime) {
      const startTime = parseTime(frontmatter.startTime);
      const endTime = parseTime(frontmatter.endTime);
      if (startTime && endTime) {
        // Use Luxon to handle date math correctly, accounting for potential day crossing
        const startDt = DateTime.fromISO(
          combineDateTimeStrings(frontmatter.startRecur || '2025-01-01', frontmatter.startTime)!
        );
        let endDt = DateTime.fromISO(
          combineDateTimeStrings(
            frontmatter.endDate || frontmatter.startRecur || '2025-01-01',
            frontmatter.endTime
          )!
        );

        // If end time is logically before start time, it means it's on the next day
        if (endDt < startDt) {
          endDt = endDt.plus({ days: 1 });
        }

        const duration = endDt.diff(startDt);
        if (duration.as('milliseconds') > 0) {
          baseEvent.duration = duration.toFormat('hh:mm');
        }
      }
    }

    // 8  Misc. extended props
    baseEvent.extendedProps = {
      ...baseEvent.extendedProps,
      isTask: !!frontmatter.isTask
    };

    // Tell FullCalendar it’s all-day when relevant
    baseEvent.allDay = !!frontmatter.allDay;
  } else if (frontmatter.type === 'rrule') {
    const fm = frontmatter as unknown as {
      startDate: string;
      startTime: string;
      skipDates?: string[];
    };

    // Determine source and display timezones
    const sourceZone = frontmatter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const displayZone =
      settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse the event time in its source timezone first
    const dtstartStr = frontmatter.allDay
      ? null
      : combineDateTimeStrings(fm.startDate, fm.startTime);
    if (!frontmatter.allDay && !dtstartStr) {
      return null;
    }

    const dtInSource = frontmatter.allDay
      ? DateTime.fromISO(fm.startDate, { zone: sourceZone })
      : DateTime.fromISO(dtstartStr!, { zone: sourceZone });

    // Validate that the source date is valid
    if (!dtInSource.isValid) {
      console.error(
        `Invalid start date for rrule event "${frontmatter.title}": ${dtInSource.invalidReason}`,
        { startDate: fm.startDate, startTime: fm.startTime, sourceZone }
      );
      return null;
    }

    // Exdates are built as EXDATE strings with TZID, directly embedded into the rrule
    const exdateStrings = (fm.skipDates || [])
      .filter((d: string) => d && d.trim() !== '') // Filter out empty/invalid dates
      .map((d: string) => {
        if (frontmatter.allDay) {
          const exDate = DateTime.fromISO(d, { zone: sourceZone }).startOf('day');
          if (!exDate.isValid) {
            console.warn(`Invalid skip date "${d}" for all-day event: ${exDate.invalidReason}`);
            return null;
          }
          return `EXDATE;TZID=${sourceZone}:${exDate.toFormat("yyyyMMdd'T'HHmmss")}`;
        }

        if (!fm.startTime) {
          console.warn(`Missing startTime for timed event skip date "${d}"`);
          return null;
        }

        const exInSource = DateTime.fromISO(`${d}T${fm.startTime}`, { zone: sourceZone });
        if (!exInSource.isValid) {
          console.warn(
            `Invalid skip date "${d}" with start time "${fm.startTime}" in timezone "${sourceZone}": ${exInSource.invalidReason}`
          );
          return null;
        }

        return `EXDATE;TZID=${sourceZone}:${exInSource.toFormat("yyyyMMdd'T'HHmmss")}`;
      })
      .filter(Boolean) as string[];

    // Construct the rrule string with SOURCE timezone
    // FullCalendar's luxon plugin will expand occurrences in SourceTZ and shift to DisplayTZ natively
    const dtstartString = `DTSTART;TZID=${sourceZone}:${dtInSource.toFormat("yyyyMMdd'T'HHmmss")}`;
    const rruleString = frontmatter.rrule;

    baseEvent.rrule = [dtstartString, rruleString, ...exdateStrings].join('\n');
    console.log(`[DEBUG RRule] SourceZone: ${sourceZone}, DisplayZone: ${displayZone}`);
    console.log(
      `[DEBUG RRule] dtInSource: ${dtInSource.toISO()}, rrule array: \n${baseEvent.rrule}`
    );
    baseEvent.extendedProps = {
      ...baseEvent.extendedProps,
      isTask: !!frontmatter.isTask,
      sourceTimezone: sourceZone
    };
    try {
      // NOTE: Even though rrule is provided, FullCalendar requires explicit timezone
      // and base start fields on the EventInput itself for some edge cases.
      (baseEvent as any).timeZone = sourceZone;
    } catch (e) {
      console.warn('FC explicit timeZone EventInput assignment failed', e);
    }

    if (!frontmatter.allDay) {
      // Calculate duration using the source timezone times (duration is timezone-independent)
      const startTime = parseTime(frontmatter.startTime);
      if (startTime && frontmatter.endTime) {
        const endTime = parseTime(frontmatter.endTime);
        if (endTime) {
          // Parse in source timezone to get correct duration
          const startDt = DateTime.fromISO(
            combineDateTimeStrings(frontmatter.startDate, frontmatter.startTime)!,
            { zone: sourceZone }
          );
          let endDt = DateTime.fromISO(
            combineDateTimeStrings(
              frontmatter.endDate || frontmatter.startDate,
              frontmatter.endTime
            )!,
            { zone: sourceZone }
          );

          if (endDt < startDt) {
            endDt = endDt.plus({ days: 1 });
          }

          const duration = endDt.diff(startDt);
          if (duration.as('milliseconds') > 0) {
            baseEvent.duration = duration.toISOTime({
              includePrefix: false,
              suppressMilliseconds: true,
              suppressSeconds: true
            });
          }
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

      baseEvent.start = start;
      baseEvent.end = end;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
        taskCompleted: frontmatter.completed
      };
    } else {
      let adjustedEndDate: string | undefined;

      if (frontmatter.endDate) {
        // OFCEvent has an inclusive endDate. FullCalendar needs an exclusive one.
        // Add one day to any multi-day all-day event's end date.
        adjustedEndDate =
          DateTime.fromISO(frontmatter.endDate).plus({ days: 1 }).toISODate() ?? undefined;
      }

      baseEvent.start = frontmatter.date;
      baseEvent.end = adjustedEndDate;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: frontmatter.completed !== undefined && frontmatter.completed !== null,
        taskCompleted: frontmatter.completed
      };
    }
  }

  // REMOVED SHADOW EVENT LOGIC
  return baseEvent;
}

/**
 * Converts an `EventApi` object from FullCalendar back into an `OFCEvent`.
 * This is typically used after a user interaction, like dragging or resizing an event,
 * to get the new event data in a format that can be saved back to the cache and disk.
 *
 * @param event The `EventApi` object from FullCalendar.
 * @param settings The plugin settings.
 * @returns An `OFCEvent` object.
 */
export function fromEventApi(
  event: EventApi,
  settings: FullCalendarSettings,
  newResource?: string
): OFCEvent {
  let category: string | undefined = (event.extendedProps as { category?: string }).category;
  let subCategory: string | undefined = (event.extendedProps as { subCategory?: string })
    .subCategory;

  // Check for resource ID safely - resource property may be added by FullCalendar resource plugin
  const resourceId =
    newResource ||
    (() => {
      const eventWithResource = event as EventApi & { resource?: { id: string } };
      return eventWithResource.resource?.id;
    })();

  if (resourceId) {
    const parts = resourceId.split('::');
    if (parts.length === 2) {
      // This is a sub-category resource, e.g., "Work::Project"
      category = parts[0];
      subCategory = parts[1] === '__NONE__' ? undefined : parts[1];
    } else {
      // This is a top-level category resource, e.g., "Work"
      category = resourceId;
      subCategory = undefined; // Dropped on a parent, so it has no sub-category.
    }
  }

  const displayZone = settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isRecurring: boolean = event.extendedProps.daysOfWeek !== undefined;
  const startDate = getDate(event.start as Date, displayZone);
  // Correctly calculate endDate for multi-day events.
  // FullCalendar's end date is exclusive, so we might need to subtract a day.
  const endDate = event.end ? getDate(new Date(event.end.getTime() - 1), displayZone) : startDate;

  const extendedProps = (event.extendedProps || {}) as Record<string, unknown>;
  const taskCompleted = extendedProps.taskCompleted as string | boolean | null | undefined;
  return {
    uid: extendedProps.uid as string | undefined,
    title: (extendedProps.cleanTitle as string | undefined) || event.title,
    category,
    subCategory, // Add subCategory here
    recurringEventId: extendedProps.recurringEventId as string | undefined,
    ...(event.allDay
      ? { allDay: true }
      : {
          allDay: false,
          startTime: getTime(event.start!, displayZone),
          endTime: getTime(event.end!, displayZone)
        }),

    ...(isRecurring
      ? {
          type: 'recurring' as const,
          endDate: null,
          daysOfWeek: (extendedProps.daysOfWeek as number[]).map((i: number) => DAYS[i]) as (
            | 'U'
            | 'M'
            | 'T'
            | 'W'
            | 'R'
            | 'F'
            | 'S'
          )[],
          startRecur: extendedProps.startRecur
            ? getDate(extendedProps.startRecur as Date, displayZone)
            : undefined,
          endRecur: extendedProps.endRecur
            ? getDate(extendedProps.endRecur as Date, displayZone)
            : undefined,
          skipDates: [], // Default to empty as exception info is unavailable
          isTask: extendedProps.isTask as boolean | undefined
        }
      : {
          type: 'single',
          date: startDate,
          ...(startDate !== endDate ? { endDate } : { endDate: null }),
          completed: extendedProps.isTask
            ? ((taskCompleted as unknown as string | false | null | undefined) ?? false)
            : (taskCompleted as unknown as string | false | null | undefined)
        })
  };
}
