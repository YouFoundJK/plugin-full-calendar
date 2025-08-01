/**
 * @file parser.ts
 * @brief Handles the transformation of Google Calendar API event data into OFCEvents.
 *
 * @description
 * This module is the data translation layer for Google Calendar. It takes a JSON
 * object from the Google API and maps its fields to the plugin's internal OFCEvent
 * format, handling all-day events, timed events, and recurrence rules.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';
import { FullCalendarSettings } from '../../../types/settings';
import { parseTitle, constructTitle } from '../../../core/categoryParser';
import { rrulestr } from 'rrule';

/**
 * Transforms a single event object from the Google Calendar API into the OFCEvent format.
 *
 * @param gEvent The raw event object from the Google API.
 * @param settings The current plugin settings, used to check for advanced categorization.
 * @returns An OFCEvent object, or null if the input is invalid.
 */
export function fromGoogleEvent(gEvent: any, settings: FullCalendarSettings): OFCEvent | null {
  if (!gEvent.id || !gEvent.summary || (!gEvent.start && !gEvent.end)) {
    // Not a valid event.
    return null;
  }

  // Basic Information
  const uid = gEvent.id;
  const recurringEventId = gEvent.recurringEventId;

  let eventData: any = { uid, recurringEventId };

  // Title and Category Parsing
  if (settings.enableAdvancedCategorization) {
    const { category, subCategory, title } = parseTitle(gEvent.summary);
    eventData.title = title;
    eventData.category = category;
    eventData.subCategory = subCategory;
  } else {
    eventData.title = gEvent.summary;
  }

  // All-Day vs. Timed Events
  if (gEvent.start.date) {
    // All-day event
    eventData.allDay = true;
    eventData.date = gEvent.start.date;

    // Google's all-day end date is exclusive. To make it inclusive like FullCalendar's
    // internal model for local events, we subtract one day.
    if (gEvent.end.date && gEvent.end.date !== gEvent.start.date) {
      eventData.endDate = DateTime.fromISO(gEvent.end.date).minus({ days: 1 }).toISODate();
    } else {
      eventData.endDate = null;
    }
  } else if (gEvent.start.dateTime) {
    // Timed event
    eventData.allDay = false;

    const start = DateTime.fromISO(gEvent.start.dateTime);
    const end = DateTime.fromISO(gEvent.end.dateTime);

    eventData.date = start.toISODate();
    eventData.startTime = start.toFormat('HH:mm');

    if (end.toISODate() !== start.toISODate()) {
      eventData.endDate = end.toISODate();
    } else {
      eventData.endDate = null;
    }
    eventData.endTime = end.toFormat('HH:mm');
    eventData.timezone = gEvent.start.timeZone;
  } else {
    // Invalid event time data
    return null;
  }

  // Recurrence
  if (Array.isArray(gEvent.recurrence) && gEvent.recurrence.length > 0) {
    // This is a master recurring event.
    // Google recurrence arrays can contain multiple RRULE/EXRULE/RDATE/EXDATE lines.
    // We'll extract the RRULE and EXDATEs.
    const rruleString = gEvent.recurrence.find((r: string) => r.startsWith('RRULE:'));
    if (rruleString) {
      const rrule = rrulestr(rruleString);

      const exdates = gEvent.recurrence
        .filter((r: string) => r.startsWith('EXDATE'))
        .flatMap((r: string) => {
          const timezone = r.includes('TZID=') ? r.split('TZID=')[1].split(':')[0] : 'UTC';
          const dateStr = r.split(':')[1];
          // Parse exdate in its specified timezone, then convert to a plain ISO date string.
          return DateTime.fromISO(dateStr, { zone: timezone }).toISODate();
        })
        .filter((d: string | null): d is string => !!d);

      const rruleEvent: Partial<OFCEvent> = {
        type: 'rrule',
        // Google doesn't have a separate startDate for rrules, so we use the event's start date.
        startDate: eventData.date,
        rrule: rrule.toString(),
        skipDates: exdates,
        isTask: false // Google Calendar events are not tasks in the OFC sense.
      };
      return { ...eventData, ...rruleEvent } as OFCEvent;
    }
  }

  // If it's not a recurring master, it's a single event (or an override, handled by recurringEventId).
  const singleEvent: Partial<OFCEvent> = {
    type: 'single'
  };

  return { ...eventData, ...singleEvent } as OFCEvent;
}

/**
 * Transforms an OFCEvent into a Google Calendar API-compatible JSON object.
 *
 * @param event The internal OFCEvent to convert.
 * @returns A JSON object ready to be sent to the Google Calendar API.
 */
export function toGoogleEvent(event: OFCEvent): object {
  const gEvent: any = {};

  // 1. Summary (Title)
  gEvent.summary = constructTitle(event.category, event.subCategory, event.title);

  // 2. ID for updates
  if (event.uid) {
    gEvent.id = event.uid;
  }

  // 3. Recurrence
  if (event.type === 'rrule' && event.rrule) {
    // Note: This only handles the main RRULE string for now.
    // EXDATEs would also go in this array if we were to support them on write.
    gEvent.recurrence = [`RRULE:${event.rrule}`];
  }

  // 4. Time / Date
  if (event.allDay === false) {
    // Timed Event
    const timeZone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let startDate: string | undefined;
    let endDate: string | undefined;

    // Type Guard to access properties like `date` and `startDate`
    if (event.type === 'single') {
      startDate = event.date;
      endDate = event.endDate || undefined;
    } else if (event.type === 'rrule') {
      startDate = event.startDate;
      // rrule events in this system don't have an end date for the start/end properties.
    }
    // Note: 'recurring' type doesn't have a single start/end date, it has startRecur/endRecur
    // which is handled by the rrule property above.

    if (!startDate) {
      throw new Error('Cannot create a timed Google event without a start date.');
    }

    const startDateTime = DateTime.fromISO(`${startDate}T${event.startTime}`);
    gEvent.start = {
      dateTime: startDateTime.toISO(),
      timeZone: timeZone
    };

    if (event.endTime) {
      const endDateTime = DateTime.fromISO(`${endDate || startDate}T${event.endTime}`);
      gEvent.end = {
        dateTime: endDateTime.toISO(),
        timeZone: timeZone
      };
    }
    // If no endTime is provided, the Google API will use a default duration, which is acceptable.
  } else {
    // All-Day Event
    if (event.type !== 'single') {
      // For now, only single all-day events are supported for writing.
      // Recurring all-day events would need more complex RRULE generation.
      throw new Error('Cannot create a recurring all-day Google event yet.');
    }

    gEvent.start = {
      date: event.date
    };

    // For all-day events, Google's end date is exclusive.
    // So for a single day event "2023-01-01", the end date must be "2023-01-02".
    // For a multi-day event ending on "2023-01-03", the end date must be "2023-01-04".
    const inclusiveEndDate = event.endDate || event.date;
    const exclusiveEndDate = DateTime.fromISO(inclusiveEndDate).plus({ days: 1 }).toISODate();
    gEvent.end = {
      date: exclusiveEndDate
    };
  }

  return gEvent;
}
