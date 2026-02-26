/**
 * @file ics.ts
 * @brief Provides functions for parsing iCalendar (ICS) data into OFCEvents.
 *
 * @description
 * This file serves as the primary data translation layer for the iCalendar
 * format. It uses the `ical.js` library to parse raw ICS text and converts
 * iCalendar components (Vevent) into the plugin's internal `OFCEvent` format.
 * It correctly handles single events, recurring events (RRULE), and
 * recurrence exceptions (EXDATE, RECURRENCE-ID).
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';

import ical from 'ical.js';
import { OFCEvent, validateEvent } from '../../types';

import { parseTimezoneAwareString } from '../../features/timezone/Timezone';

/**
 * Extracts the time part (HH:mm) from a Luxon DateTime object.
 * We must specify the format string to ensure it's always 24-hour time.
 */
function getLuxonTime(dt: DateTime): string | null {
  return dt.toFormat('HH:mm');
}

// Keep the getLuxonDate function as is:
function getLuxonDate(dt: DateTime): string | null {
  return dt.toISODate();
}

// ====================================================================

function extractEventUrl(iCalEvent: ical.Event): string {
  const urlProp = iCalEvent.component.getFirstProperty('url');
  return urlProp ? String(urlProp.getFirstValue()) : '';
}

function specifiesEnd(iCalEvent: ical.Event) {
  return (
    Boolean(iCalEvent.component.getFirstProperty('dtend')) ||
    Boolean(iCalEvent.component.getFirstProperty('duration'))
  );
}

// MODIFICATION: Remove settings parameter from icsToOFC
function icsToOFC(input: ical.Event): OFCEvent | null {
  const summary = input.summary || '';

  // Simplified: just use the title directly
  const eventData = { title: summary };

  const description = String(
    input.component.getFirstProperty('description')?.getFirstValue() || ''
  );
  const location = String(input.component.getFirstProperty('location')?.getFirstValue() || '');
  // Use extractEventUrl helper or input.component.getFirstProperty('url')
  const url = extractEventUrl(input);

  const startDate = parseTimezoneAwareString(input.startDate);

  console.log('[DEBUG ICS Parser] Parsing event:', summary);
  console.log(
    '[DEBUG ICS Parser] raw startDate:',
    input.startDate.toString(),
    'timezone:',
    input.startDate.timezone
  );
  console.log(
    '[DEBUG ICS Parser] luxon startDate:',
    startDate.toISO(),
    'isValid:',
    startDate.isValid
  );

  // Validate start date - if invalid, skip this event
  if (!startDate.isValid) {
    console.warn(
      `Full Calendar ICS Parser: Skipping event "${summary}" due to invalid start date. Reason: ${startDate.invalidReason}`
    );
    return null;
  }

  const endDate = input.endDate ? parseTimezoneAwareString(input.endDate) : startDate;

  // Validate end date - if invalid, use start date
  const validEndDate = endDate.isValid ? endDate : startDate;
  if (!endDate.isValid && input.endDate) {
    console.warn(
      `Full Calendar ICS Parser: Event "${summary}" has invalid end date, using start date instead.`
    );
  }

  const uid = input.uid;
  const isAllDay = input.startDate.isDate;

  // The Luxon DateTime object now holds the correct zone from the ICS file.
  // Coalesce null to undefined to match the schema.
  const timezone = isAllDay ? undefined : startDate.zoneName || undefined;

  if (input.isRecurring()) {
    // Cast getFirstValue() return to unknown, then string to string
    const rruleProp = input.component.getFirstProperty('rrule');
    const rruleVal = rruleProp ? String(rruleProp.getFirstValue()) : null;
    const rruleStr = rruleVal ? String(rruleVal) : '';
    const rrule = rrulestr(rruleStr);
    const exdates = input.component
      .getAllProperties('exdate')
      .map(exdateProp => {
        const exdate = ((t: unknown) => t as ical.Time)(exdateProp.getFirstValue());
        const exdateLuxon = parseTimezoneAwareString(exdate);
        if (!exdateLuxon.isValid) {
          console.warn(`Full Calendar ICS Parser: Skipping invalid EXDATE for event "${summary}"`);
          return null;
        }
        return exdateLuxon.toISODate();
      })
      .filter((d): d is string => d !== null);

    const startDateISO = getLuxonDate(startDate);
    const endDateISO = getLuxonDate(validEndDate);

    // Ensure we have valid ISO dates
    if (!startDateISO) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
      );
      return null;
    }

    return {
      type: 'rrule',
      uid,
      title: eventData.title,
      id: `ics::${uid}::${startDateISO}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates,
      startDate: startDateISO,
      endDate: endDateISO && startDateISO !== endDateISO ? endDateISO : null,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          }),
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  } else {
    const date = getLuxonDate(startDate);

    // Ensure we have a valid date
    if (!date) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
      );
      return null;
    }

    let finalEndDate: string | null | undefined = null;
    if (specifiesEnd(input)) {
      if (isAllDay) {
        // For all-day events, ICS end date is exclusive. Make it inclusive by subtracting one day.
        const inclusiveEndDate = validEndDate.minus({ days: 1 });
        finalEndDate = getLuxonDate(inclusiveEndDate);
      } else {
        finalEndDate = getLuxonDate(validEndDate);
      }
    }

    return {
      type: 'single',
      uid,
      title: eventData.title,
      date: date,
      endDate: date !== finalEndDate ? finalEndDate || null : null,
      timezone,
      ...(isAllDay
        ? { allDay: true }
        : {
            allDay: false,
            startTime: getLuxonTime(startDate)!,
            endTime: getLuxonTime(endDate)!
          }),
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  }
}

/**
 * Pre-processes ICS text to normalize date formats.
 * Converts YYYYMMDD and YYYYMMDDTHHMMSSZ formats to ensure proper parsing.
 */
function preprocessICSText(text: string): string {
  let correctedText = text;

  // Handle DTSTART:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTSTART:(\d{8})(\r?\n|$)/gm, 'DTSTART;VALUE=DATE:$1$2');

  // Handle DTEND:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTEND:(\d{8})(\r?\n|$)/gm, 'DTEND;VALUE=DATE:$1$2');

  // Handle EXDATE:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/EXDATE[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    // Preserve any parameters before the colon
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Handle RECURRENCE-ID:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/RECURRENCE-ID[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Note: YYYYMMDDTHHMMSSZ format should be handled correctly by ical.js,
  // but we ensure it's properly formatted if needed

  return correctedText;
}

// MODIFICATION: Remove settings parameter from getEventsFromICS
export function getEventsFromICS(text: string): OFCEvent[] {
  // Parsing robustness: check for VCALENDAR header
  if (!text.includes('BEGIN:VCALENDAR')) {
    console.error(
      'Full Calendar ICS Parser: Missing BEGIN:VCALENDAR header in ICS file. Parsing may fail or be incomplete.'
    );
    // We could return [] here, but ical.js might handle partials, so we just warn.
    // However, the user specifically asked for "console error if Header are missing"
  }

  // Pre-process the text to normalize date formats
  // This ensures VALUE=DATE:YYYYMMDD and YYYYMMDDTHHMMSSZ formats are properly handled
  const correctedText = preprocessICSText(text);

  const jCalData = ical.parse(correctedText); // Use the corrected text
  const component = new ical.Component(jCalData);
  const vevents = component.getAllSubcomponents('vevent');

  const events: ical.Event[] = vevents
    .map(vevent => new ical.Event(vevent))
    .filter(evt => {
      try {
        // Ensure start and end dates are valid before processing.
        evt.startDate.toJSDate();
        evt.endDate.toJSDate();
        return true;
      } catch {
        try {
          evt.startDate?.toJSDate();
        } catch {
          // start date failed parsing
        }
        // skipping events with invalid time
        return false;
      }
    });

  const baseEvents = Object.fromEntries(
    events
      .filter(e => e.recurrenceId === null)
      .map(e => [e.uid, icsToOFC(e)])
      .filter(([uid, event]) => event !== null) as [string, OFCEvent][]
  );

  const recurrenceExceptions = events
    .filter(e => e.recurrenceId !== null)
    .map((e): [string, OFCEvent | null] => [e.uid, icsToOFC(e)])
    .filter(([uid, event]) => event !== null) as [string, OFCEvent][];

  for (const [uid, event] of recurrenceExceptions) {
    const baseEvent = baseEvents[uid];
    if (!baseEvent) {
      continue;
    }

    if (baseEvent.type !== 'rrule' || event.type !== 'single') {
      console.warn('Recurrence exception was recurring or base event was not recurring', {
        baseEvent,
        recurrenceException: event
      });
      continue;
    }
    if (event.date) {
      baseEvent.skipDates.push(event.date);
    }
  }

  const allEvents = Object.values(baseEvents).concat(recurrenceExceptions.map(e => e[1]));

  return allEvents.map(validateEvent).flatMap(e => (e ? [e] : []));
}
