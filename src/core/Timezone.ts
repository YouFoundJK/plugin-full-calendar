/**
 * @file Timezone.ts
 * @brief Provides core utility functions for timezone conversions.
 *
 * @description
 * This file contains the foundational `convertEvent` function, which is the
 * single source of truth for translating an OFCEvent object from one IANA
- * timezone to another. It uses the `luxon` library to handle the complexities
 * of date and time math, including DST adjustments, ensuring that all time
 * conversions are accurate and consistent.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../types';
import { Notice } from 'obsidian';
import FullCalendarPlugin from '../main';

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
  if (newEvent.startTime) {
    const startTime = parseTime(newEvent.startTime);
    // If startTime is invalid, we cannot proceed with any conversion.
    if (!startTime) {
      return newEvent;
    }

    const dateStr =
      'date' in newEvent ? newEvent.date : 'startDate' in newEvent ? newEvent.startDate : null;
    // Cannot proceed without a base date.
    if (!dateStr) {
      return newEvent;
    }

    /**
     * Internal helper to create a timezone-aware, absolute DateTime object
     * from a date string, a time object, and a source zone.
     */
    const createAbsoluteDateTime = (dtStr: string, time: DateTime, zone: string): DateTime => {
      // 1. Read date as UTC to avoid local shifts from the system running the code.
      // 2. Set the time components from the parsed time object.
      // 3. Set the zone, interpreting the local time components as being in that zone.
      return DateTime.fromISO(dtStr, { zone: 'utc' })
        .set({
          hour: time.hour,
          minute: time.minute,
          second: 0,
          millisecond: 0
        })
        .setZone(zone, { keepLocalTime: true });
    };

    // 1. Create a DateTime object representing the absolute start time in the source zone.
    const absoluteStart = createAbsoluteDateTime(dateStr, startTime, sourceZone);

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
    if (newEvent.endTime) {
      const endTime = parseTime(newEvent.endTime);
      if (endTime) {
        const endDateStr = 'endDate' in newEvent && newEvent.endDate ? newEvent.endDate : dateStr;

        const absoluteEnd = createAbsoluteDateTime(endDateStr, endTime, sourceZone);
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

    // Handle skipDates for recurring events
    if ('skipDates' in newEvent && newEvent.skipDates.length > 0) {
      newEvent.skipDates = newEvent.skipDates.map(skipDateStr => {
        // Create an absolute DateTime for the skipped instance in the SOURCE zone.
        const skippedInstanceInSource = createAbsoluteDateTime(skipDateStr, startTime, sourceZone);
        // Convert that absolute moment to the TARGET zone.
        const skippedInstanceInTarget = skippedInstanceInSource.setZone(targetZone);
        // Return the new date string for that moment in the target zone.
        return skippedInstanceInTarget.toISODate()!;
      });
    }
  }

  return newEvent;
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
    console.log(`Full Calendar: Initialized timezone to ${systemTimezone}`);
  } else if (settings.lastSystemTimezone !== systemTimezone) {
    // Case 2: The system timezone has changed since the last time Obsidian was run.
    // This is a critical change. We must update the user's view.
    settings.displayTimezone = systemTimezone; // Force reset the display timezone.
    settings.lastSystemTimezone = systemTimezone;
    await plugin.saveData(settings);

    new Notice(
      `System timezone changed to ${systemTimezone}. Full Calendar view updated to match.`,
      10000 // 10-second notice
    );
  }
  // Case 3: System timezone is unchanged. We do nothing, respecting the user's
  // potentially custom `displayTimezone` setting from the settings tab.
}
