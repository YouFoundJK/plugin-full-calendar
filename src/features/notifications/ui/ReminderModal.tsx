/**
 * @file ReminderModal.tsx
 * @brief React component for the Reminder/Snooze modal.
 */
import * as React from 'react';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';
import { t } from '../../i18n/i18n';

interface ReminderModalProps {
  event: OFCEvent;
  type: 'default' | 'custom';
  defaultReminderMinutes: number;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
  onOpen: () => void;
}

export const ReminderModal = ({
  event,
  type,
  defaultReminderMinutes,
  onSnooze,
  onDismiss,
  onOpen
}: ReminderModalProps) => {
  const [snoozeDuration, setSnoozeDuration] = useState(10); // Default 10m

  const formatTime = (iso: string) => DateTime.fromFormat(iso, 'HH:mm').toFormat('h:mm a');

  const snoozeOptions = [
    { label: '5 minutes', value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 }
  ];

  const handleSnooze = (e: React.FormEvent) => {
    e.preventDefault();
    onSnooze(snoozeDuration);
  };

  return (
    <div className="full-calendar-reminder-modal">
      <div className="modal-header">
        <h2>{t('notifications.eventStarting.title')}</h2>
      </div>

      <div className="reminder-content">
        <h3>{event.title}</h3>
        {event.allDay ? (
          <p>{t('notifications.allDaySuffix')}</p>
        ) : (
          <p>
            {event.startTime && formatTime(event.startTime)}
            {event.endTime && ` - ${formatTime(event.endTime)}`}
          </p>
        )}

        {type === 'default' && (
          <div className="callout callout-warning" style={{ marginTop: '1rem' }}>
            <div className="callout-title">⚠️ Snoozing Moves Event</div>
            <div className="callout-content">
              <p>This is a default reminder. Snoozing will move the event start time forward.</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSnooze} className="reminder-controls" style={{ marginTop: '1.5rem' }}>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Snooze for</div>
          </div>
          <div className="setting-item-control">
            <select
              value={snoozeDuration}
              onChange={e => setSnoozeDuration(parseInt(e.target.value))}
            >
              {snoozeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" onClick={onOpen} className="mod-cta">
            Open Note
          </button>
          <button type="submit" className="mod-primary">
            Snooze
          </button>
        </div>
      </form>
    </div>
  );
};
