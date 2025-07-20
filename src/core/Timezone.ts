// src/core/Timezone.ts

import { DateTime } from 'luxon';
import { OFCEvent } from '../types';

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
export function convertEvent(event: OFCEvent, sourceZone: string, targetZone: string): OFCEvent {
  // All-day events are timezone-agnostic.
  if (event.allDay) {
    return { ...event };
  }

  const newEvent = { ...event };

  // Only proceed if the event has a time component.
  if ('startTime' in event && event.startTime) {
    const dateStr = 'date' in event ? event.date : 'startDate' in event ? event.startDate : null;
    if (!dateStr) return newEvent; // Cannot proceed without a base date.

    const startTime = parseTime(event.startTime);
    if (!startTime) return newEvent; // Invalid start time format.

    // 1. Create a DateTime object representing the absolute start time in the source zone.
    const absoluteStart = DateTime.fromISO(dateStr, { zone: 'utc' }) // Read date as UTC to avoid local shifts
      .set({
        hour: startTime.hour,
        minute: startTime.minute,
        second: 0,
        millisecond: 0
      })
      .setZone(sourceZone, { keepLocalTime: true }); // Then, interpret that time in the source zone.

    // 2. Convert this absolute time to the target zone.
    const newStartInTarget = absoluteStart.setZone(targetZone);

    // 3. Update the new event object with date and time strings from the converted time.
    const newStartDate = newStartInTarget.toISODate();
    if (newStartDate) {
      if ('date' in newEvent) {
        newEvent.date = newStartDate;
      }
      if ('startDate' in newEvent) {
        newEvent.startDate = newStartDate;
      }
    }
    newEvent.startTime = newStartInTarget.toFormat('HH:mm');

    // Handle end time if it exists
    if ('endTime' in event && event.endTime) {
      const endTime = parseTime(event.endTime);
      const endDateStr = 'endDate' in event && event.endDate ? event.endDate : dateStr;

      if (endTime) {
        const absoluteEnd = DateTime.fromISO(endDateStr, { zone: 'utc' })
          .set({
            hour: endTime.hour,
            minute: endTime.minute,
            second: 0,
            millisecond: 0
          })
          .setZone(sourceZone, { keepLocalTime: true });

        const newEndInTarget = absoluteEnd.setZone(targetZone);

        if ('endDate' in newEvent) {
          // Only set endDate if it's on a different day than the start date in the target timezone.
          newEvent.endDate =
            newEndInTarget.toISODate() !== newStartInTarget.toISODate()
              ? newEndInTarget.toISODate()
              : null;
        }
        newEvent.endTime = newEndInTarget.toFormat('HH:mm');
      }
    }
  }

  return newEvent;
}
