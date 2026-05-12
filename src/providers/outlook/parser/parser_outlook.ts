import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types/schema';
import { constructTitle } from '../../../features/category/categoryParser';

export interface OutlookEventLike {
  id?: string;
  subject?: string;
  isAllDay?: boolean;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  seriesMasterId?: string;
  start?: {
    dateTime?: string;
    timeZone?: string;
  } | null;
  end?: {
    dateTime?: string;
    timeZone?: string;
  } | null;
}

export function fromOutlookEvent(event: OutlookEventLike): OFCEvent | null {
  if (!event.id || !event.subject || !event.start || !event.end) {
    return null;
  }

  const start = event.start.dateTime ? DateTime.fromISO(event.start.dateTime) : null;
  const end = event.end.dateTime ? DateTime.fromISO(event.end.dateTime) : null;

  if (!start || !end || !start.isValid || !end.isValid) {
    return null;
  }

  const recurringEventId = event.seriesMasterId ?? undefined;

  if (event.isAllDay) {
    const inclusiveEnd = end.minus({ days: 1 }).toISODate();
    return {
      type: 'single',
      uid: event.id,
      recurringEventId,
      title: event.subject,
      allDay: true,
      date: start.toISODate() || '',
      endDate: inclusiveEnd || null
    };
  }

  return {
    type: 'single',
    uid: event.id,
    recurringEventId,
    title: event.subject,
    allDay: false,
    date: start.toISODate() || '',
    startTime: start.toFormat('HH:mm'),
    endDate: end.toISODate() !== start.toISODate() ? end.toISODate() : null,
    endTime: end.toFormat('HH:mm'),
    timezone: event.start.timeZone || undefined
  };
}

export function toOutlookEvent(event: OFCEvent): object {
  const payload: Record<string, unknown> = {
    subject: constructTitle(event.category, event.subCategory, event.title)
  };

  if (event.allDay) {
    if (event.type !== 'single') {
      throw new Error('Recurring all-day Outlook events are not yet supported for write actions.');
    }

    const endDate = DateTime.fromISO(event.endDate || event.date)
      .plus({ days: 1 })
      .toISODate();
    payload.isAllDay = true;
    payload.start = {
      dateTime: `${event.date}T00:00:00`,
      timeZone: 'UTC'
    };
    payload.end = {
      dateTime: `${endDate}T00:00:00`,
      timeZone: 'UTC'
    };
    return payload;
  }

  const timezone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (event.type === 'single') {
    startDate = event.date;
    endDate = event.endDate || event.date;
  } else if (event.type === 'rrule') {
    startDate = event.startDate;
    endDate = event.startDate;
  } else if (event.type === 'recurring') {
    startDate = event.startRecur;
    endDate = event.startRecur;
  }

  if (!startDate || !event.startTime || !event.endTime) {
    throw new Error('Timed Outlook event is missing required date/time fields.');
  }

  payload.isAllDay = false;
  payload.start = {
    dateTime: `${startDate}T${event.startTime}:00`,
    timeZone: timezone
  };
  payload.end = {
    dateTime: `${endDate || startDate}T${event.endTime}:00`,
    timeZone: timezone
  };

  return payload;
}
