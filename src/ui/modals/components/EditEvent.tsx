/**
 * @file EditEvent.tsx
 * @brief React component for the "Create/Edit Event" modal form.
 *
 * @description
 * This file defines the `EditEvent` React component, which provides the form
 * for creating and editing events. It manages all form state, including title,
 * dates, times, recurrence rules, and associated calendar. It performs form
 * validation and calls a submit callback to persist changes.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { CalendarInfo, OFCEvent } from '../../../types';
import { AutocompleteInput } from '../../components/forms/AutocompleteInput';
import { constructTitle, parseTitle } from '../../../calendars/parsing/categoryParser';

interface DayChoiceProps {
  code: string;
  label: string;
  isSelected: boolean;
  onClick: (code: string) => void;
}
const DayChoice = ({ code, label, isSelected, onClick }: DayChoiceProps) => (
  <button
    type="button"
    className={`day-choice-button ${isSelected ? 'is-selected' : ''}`}
    onClick={() => onClick(code)}
  >
    <b>{label[0]}</b>
  </button>
);

const DAY_MAP = {
  U: 'Sunday',
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  R: 'Thursday',
  F: 'Friday',
  S: 'Saturday'
};

const DaySelect = ({
  value: days,
  onChange
}: {
  value: string[];
  onChange: (days: string[]) => void;
}) => {
  return (
    <div>
      {Object.entries(DAY_MAP).map(([code, label]) => (
        <DayChoice
          key={code}
          code={code}
          label={label}
          isSelected={days.includes(code)}
          onClick={() =>
            days.includes(code) ? onChange(days.filter(c => c !== code)) : onChange([code, ...days])
          }
        />
      ))}
    </div>
  );
};

type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'yearly';

interface EditEventProps {
  submit: (frontmatter: OFCEvent, calendarIndex: number) => Promise<void>;
  readonly calendars: {
    id: string;
    name: string;
    type: CalendarInfo['type'];
  }[];
  defaultCalendarIndex: number;
  initialEvent?: Partial<OFCEvent>;
  availableCategories?: string[];
  enableCategory: boolean; // <-- ADD NEW PROP
  enableBackgroundEvents?: boolean; // <-- ADD NEW PROP
  open?: () => Promise<void>;
  deleteEvent?: () => Promise<void>;
  onAttemptEditInherited?: () => void; // Add this new prop
  checkForDuplicate?: (event: OFCEvent, calendarIndex: number) => Promise<boolean>; // Add duplicate check function
}

function getInitialRecurrenceType(event?: Partial<OFCEvent>): RecurrenceType {
  if (event?.type !== 'recurring') {
    return 'none';
  }
  if (event.daysOfWeek && event.daysOfWeek.length > 0) {
    return 'weekly';
  }
  if (event.month) {
    return 'yearly';
  }
  if (event.dayOfMonth) {
    return 'monthly';
  }
  return 'none';
}

export const EditEvent = ({
  initialEvent,
  submit,
  open,
  deleteEvent,
  calendars,
  defaultCalendarIndex,
  availableCategories = [],
  enableCategory,
  enableBackgroundEvents = false, // <-- GET NEW PROP
  onAttemptEditInherited,
  checkForDuplicate
}: EditEventProps) => {
  const isChildOverride = !!initialEvent?.recurringEventId;

  const disabledTooltip = 'This property is inherited. Click to edit the parent recurring event.'; // Update tooltip

  const [date, setDate] = useState(
    initialEvent
      ? initialEvent.type === 'single'
        ? initialEvent.date
        : initialEvent.type === 'recurring'
          ? initialEvent.startRecur
          : initialEvent.type === 'rrule'
            ? initialEvent.startDate
            : ''
      : ''
  );
  const [endDate, setEndDate] = useState(
    initialEvent && initialEvent.type === 'single' ? initialEvent.endDate : undefined
  );
  const [startTime, setStartTime] = useState(
    initialEvent?.allDay === false ? initialEvent.startTime || '' : ''
  );
  const [endTime, setEndTime] = useState(
    initialEvent?.allDay === false ? initialEvent.endTime || '' : ''
  );
  const [title, setTitle] = useState(
    enableCategory 
      ? constructTitle(undefined, initialEvent?.subCategory, initialEvent?.title || '')
      : initialEvent?.title || ''
  );
  const [category, setCategory] = useState(initialEvent?.category || '');
  // const [isRecurring, setIsRecurring] = useState(initialEvent?.type === 'recurring' || false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    getInitialRecurrenceType(initialEvent)
  );
  const isRecurring = recurrenceType !== 'none';
  const [allDay, setAllDay] = useState(initialEvent?.allDay || false);
  const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);
  const [isTask, setIsTask] = useState(
    (initialEvent?.type === 'single' &&
      initialEvent.completed !== undefined &&
      initialEvent.completed !== null) ||
      (initialEvent?.type === 'recurring' && initialEvent.isTask) ||
      (initialEvent?.type === 'rrule' && initialEvent.isTask) ||
      false
  );
  const [complete, setComplete] = useState(
    initialEvent?.type === 'single' && initialEvent.completed
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    initialEvent?.type === 'recurring' ? initialEvent.daysOfWeek || [] : []
  );
  const [endRecur, setEndRecur] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.endRecur : undefined
  );
  const [display, setDisplay] = useState<
    'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none'
  >(initialEvent?.display || 'auto');

  // Add validation state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  // Debounced validation function
  const validateForDuplicates = useCallback(async () => {
    if (!checkForDuplicate || !title || !date || isChildOverride) {
      setValidationError(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);

    try {
      // Build a partial event for validation
      const eventForValidation: OFCEvent = {
        title,
        date,
        allDay,
        type: recurrenceType === 'none' ? 'single' : 'recurring',
        ...(allDay ? {} : { startTime: startTime || '', endTime: endTime || null }),
        ...(category && { category }),
        ...(recurrenceType === 'weekly' && {
          daysOfWeek: daysOfWeek as ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[]
        }),
        ...(recurrenceType === 'monthly' && date && { dayOfMonth: DateTime.fromISO(date).day }),
        ...(recurrenceType === 'yearly' &&
          date && {
            month: DateTime.fromISO(date).month,
            dayOfMonth: DateTime.fromISO(date).day
          }),
        ...(recurrenceType !== 'none' && {
          startRecur: date,
          endRecur: endRecur,
          isTask: isTask
        })
      } as OFCEvent;

      const isDuplicate = await checkForDuplicate(eventForValidation, calendarIndex);

      if (isDuplicate) {
        setValidationError(
          'An event with this name already exists on this date. Please choose a different name.'
        );
      } else {
        setValidationError(null);
      }
    } catch (error) {
      console.error('Error validating for duplicates:', error);
      setValidationError(null); // Don't block submission if validation fails
    }

    setIsValidating(false);
  }, [
    checkForDuplicate,
    title,
    date,
    calendarIndex,
    allDay,
    recurrenceType,
    startTime,
    endTime,
    category,
    daysOfWeek,
    endRecur,
    isTask,
    isChildOverride
  ]);

  // Debounce the validation
  useEffect(() => {
    const timeoutId = setTimeout(validateForDuplicates, 500);
    return () => clearTimeout(timeoutId);
  }, [validateForDuplicates]);

  const selectedCalendar = calendars[calendarIndex];
  const isDailyNoteCalendar = selectedCalendar.type === 'dailynote';
  const recurringTooltip = isDailyNoteCalendar
    ? "Recurring events are not supported in Daily Notes. Please use a 'Full Note' calendar instead."
    : '';

  useEffect(() => {
    // If user switches to a daily note calendar, force recurrence off.
    if (isDailyNoteCalendar) {
      setRecurrenceType('none');
    }
  }, [isDailyNoteCalendar]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Prevent submission if there are validation errors
    if (validationError) {
      return;
    }

    let completedValue: string | false | null = null;
    if (isTask) {
      completedValue = complete || false;
    }

    const timeInfo = allDay
      ? { allDay: true as const }
      : { allDay: false as const, startTime: startTime || '', endTime: endTime || null };

    let eventData: Partial<OFCEvent>;

    if (recurrenceType === 'none') {
      eventData = {
        type: 'single',
        date: date || '',
        endDate: endDate || null,
        completed: completedValue
      };
    } else {
      const recurringData: Partial<OFCEvent> & { type: 'recurring' } = {
        type: 'recurring',
        startRecur: date || undefined,
        endRecur: endRecur,
        isTask: isTask,
        skipDates: initialEvent?.type === 'recurring' ? initialEvent.skipDates : []
      };

      if (recurrenceType === 'weekly') {
        recurringData.daysOfWeek = daysOfWeek as ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
      } else if (recurrenceType === 'monthly' && date) {
        recurringData.dayOfMonth = DateTime.fromISO(date).day;
      } else if (recurrenceType === 'yearly' && date) {
        const dt = DateTime.fromISO(date);
        recurringData.month = dt.month;
        recurringData.dayOfMonth = dt.day;
      }
      eventData = recurringData;
    }

    const { subCategory: parsedSubCategory, title: parsedTitle } = parseTitle(title);

    const finalEvent = {
      title: parsedTitle,
      category: category || undefined,
      display: display !== 'auto' ? display : undefined,
      subCategory: parsedSubCategory,
      ...timeInfo,
      ...eventData
    } as OFCEvent;

    await submit(finalEvent, calendarIndex);
  };

  return (
    <div className="full-calendar-edit-modal">
      <form onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{initialEvent?.title ? 'Edit Event' : 'New Event'}</h2>
          {open && (
            <button type="button" className="mod-subtle" onClick={open}>
              Open Note
            </button>
          )}
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Title</div>
          </div>
          <div
            className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
            onClick={isChildOverride ? onAttemptEditInherited : undefined}
            title={isChildOverride ? disabledTooltip : ''}
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder="Event Title"
              required
              onChange={e => setTitle(e.target.value)}
              readOnly={isChildOverride} // Change `disabled` to `readOnly`
            />
            {validationError && (
              <div className="mod-warning" style={{ marginTop: '4px', fontSize: '0.875em' }}>
                {validationError}
              </div>
            )}
            {isValidating && (
              <div style={{ marginTop: '4px', fontSize: '0.875em', opacity: 0.7 }}>
                Checking for duplicates...
              </div>
            )}
          </div>
        </div>

        {enableCategory && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Category</div>
            </div>
            <div
              className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
              onClick={isChildOverride ? onAttemptEditInherited : undefined}
              title={isChildOverride ? disabledTooltip : ''}
            >
              <AutocompleteInput
                id="category-autocomplete"
                value={category}
                onChange={setCategory}
                suggestions={availableCategories}
                placeholder="Category (optional)"
                readOnly={isChildOverride} // Change `disabled` to `readOnly`
              />
            </div>
          </div>
        )}

        {enableBackgroundEvents && (
          <div className="setting-item">
            <div
              className="setting-item-info"
              title="Choose how this event appears on the calendar"
            >
              <div className="setting-item-name">Display</div>
            </div>
            <div
              className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
              onClick={isChildOverride ? onAttemptEditInherited : undefined}
              title={isChildOverride ? disabledTooltip : ''}
            >
              <select
                value={display}
                onChange={e => setDisplay(e.target.value as typeof display)}
                disabled={isChildOverride}
              >
                <option value="auto">Normal event</option>
                <option value="background">Background event</option>
                <option value="inverse-background">Inverse background</option>
                <option value="none">Hidden</option>
              </select>
            </div>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">In Calendar</div>
          </div>
          <div className="setting-item-control">
            <select
              value={calendarIndex}
              onChange={e => setCalendarIndex(parseInt(e.target.value))}
            >
              {calendars.map((cal, idx) => (
                <option key={idx} value={idx}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="modal-hr" />

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Date</div>
          </div>
          <div className="setting-item-control">
            <input type="date" value={date} required onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className={`setting-item time-setting-item ${allDay ? 'is-disabled' : ''}`}>
          <div className="setting-item-info">
            <div className="setting-item-name">Time</div>
          </div>
          <div className="setting-item-control time-group">
            <input
              type="time"
              value={startTime}
              required={!allDay}
              disabled={allDay}
              onChange={e => setStartTime(e.target.value)}
            />
            <span>-</span>
            <input
              type="time"
              value={endTime}
              disabled={allDay}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {/* Options section replaced */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Options</div>
          </div>
          <div className="setting-item-control options-group">
            <label title={isChildOverride ? disabledTooltip : ''}>
              {' '}
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                disabled={isChildOverride}
              />{' '}
              All day
            </label>
            <label>
              <input type="checkbox" checked={isTask} onChange={e => setIsTask(e.target.checked)} />{' '}
              Is a Task
            </label>
            {isTask && (
              <label
                title={
                  isRecurring
                    ? 'Completion for recurring tasks can be toggled on individual instances in the calendar view.'
                    : ''
                }
              >
                <input
                  type="checkbox"
                  checked={isRecurring ? false : !!complete}
                  onChange={e =>
                    !isRecurring && setComplete(e.target.checked ? DateTime.now().toISO() : false)
                  }
                  disabled={isRecurring}
                />{' '}
                Completed
              </label>
            )}
          </div>
        </div>

        {/* New "Repeats" section */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Repeats</div>
          </div>
          <div className="setting-item-control">
            <select
              value={recurrenceType}
              onChange={e => setRecurrenceType(e.target.value as RecurrenceType)}
              disabled={isDailyNoteCalendar}
              title={recurringTooltip}
            >
              <option value="none">None</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        {/* Recurring fields fragment replaced */}
        {isRecurring && (
          <>
            {recurrenceType === 'weekly' && (
              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">Repeat on</div>
                </div>
                <div className="setting-item-control">
                  <DaySelect value={daysOfWeek} onChange={setDaysOfWeek} />
                </div>
              </div>
            )}
            {recurrenceType === 'monthly' && date && (
              <div className="setting-item">
                <div className="setting-item-info"></div>
                <div className="setting-item-control">
                  Repeats on day {DateTime.fromISO(date).day} of every month.
                </div>
              </div>
            )}
            {recurrenceType === 'yearly' && date && (
              <div className="setting-item">
                <div className="setting-item-info"></div>
                <div className="setting-item-control">
                  Repeats every year on {DateTime.fromISO(date).toFormat('MMMM d')}.
                </div>
              </div>
            )}

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">End Repeat</div>
              </div>
              <div className="setting-item-control">
                <input
                  type="date"
                  value={endRecur || ''}
                  onChange={e => setEndRecur(e.target.value || undefined)}
                />
              </div>
            </div>
          </>
        )}

        <hr className="modal-hr" />

        <div className="modal-footer">
          <div className="footer-actions-left">
            {deleteEvent && (
              <button type="button" className="mod-warning" onClick={deleteEvent}>
                Delete
              </button>
            )}
          </div>
          <div className="footer-actions-right">
            <button type="submit" className="mod-cta" disabled={!!validationError || isValidating}>
              Save Event
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
