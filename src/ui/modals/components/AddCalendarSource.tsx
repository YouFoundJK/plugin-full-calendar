/**
 * @file AddCalendarSource.tsx
 * @brief React component for the "Add New Calendar" modal form.
 *
 * @description
 * This file defines the `AddCalendarSource` React component. It renders a
 * dynamic form tailored to the type of calendar being added (e.g., showing
 * a directory dropdown for local calendars, or URL/credential fields for
 * CalDAV). It manages form state and handles submission.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { useState } from 'react';
import { CalendarInfo } from '../../../types';
import { UrlInput } from '../../components/forms/UrlInput';
import { ChangeListener } from '../../components/forms/common';
import { ColorPicker } from '../../components/forms/ColorPicker';
import { HeadingInput } from '../../components/forms/HeadingInput';
import { PasswordInput } from '../../components/forms/PasswordInput';
import { UsernameInput } from '../../components/forms/UsernameInput';
import { DirectorySelect } from '../../components/forms/DirectorySelect';

interface AddCalendarProps {
  source: Partial<CalendarInfo>;
  directories: string[];
  headings: string[];
  submit: (source: CalendarInfo) => Promise<void>;
}

export const AddCalendarSource = ({ source, directories, headings, submit }: AddCalendarProps) => {
  const isCalDAV = source.type === 'caldav';

  const [setting, setSettingState] = useState(source);
  const [submitting, setSubmitingState] = useState(false);
  const [submitText, setSubmitText] = useState(isCalDAV ? 'Import Calendars' : 'Add Calendar');

  const makeChangeListener: ChangeListener = fromString => e =>
    setSettingState({ ...setting, ...fromString(e.target.value) });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!submitting) {
      setSubmitingState(true);
      setSubmitText(isCalDAV ? 'Importing Calendars' : 'Adding Calendar');
      await submit(setting as CalendarInfo);
    }
  };

  return (
    <div className="vertical-tab-content">
      <form onSubmit={handleSubmit}>
        {!isCalDAV && <ColorPicker source={setting} changeListener={makeChangeListener} />}
        {source.type === 'local' && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Directory</div>
              <div className="setting-item-description">Directory to store events</div>
            </div>
            <div className="setting-item-control">
              <DirectorySelect
                value={(setting as { directory?: string }).directory || ''}
                onChange={value => setSettingState({ ...setting, directory: value })}
                directories={directories}
              />
            </div>
          </div>
        )}
        {source.type === 'dailynote' && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Heading</div>
              <div className="setting-item-description">
                Heading to store events under in the daily note.
              </div>
            </div>
            <div className="setting-item-control">
              <HeadingInput
                value={(setting as { heading?: string }).heading || ''}
                onChange={value => setSettingState({ ...setting, heading: value })}
                headings={headings}
              />
            </div>
          </div>
        )}
        {source.type === 'ical' || source.type === 'caldav' ? (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">URL</div>
              <div className="setting-item-description">URL of the CalDAV or .ics server</div>
            </div>
            <div className="setting-item-control">
              <UrlInput
                value={(setting as { url?: string }).url || ''}
                onChange={value => setSettingState({ ...setting, url: value })}
              />
            </div>
          </div>
        ) : null}
        {isCalDAV && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Username</div>
              <div className="setting-item-description">Username for the account</div>
            </div>
            <div className="setting-item-control">
              <UsernameInput
                value={(setting as { username?: string }).username || ''}
                onChange={value => setSettingState({ ...setting, username: value })}
              />
            </div>
          </div>
        )}
        {isCalDAV && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Password</div>
              <div className="setting-item-description">Password for the account</div>
            </div>
            <div className="setting-item-control">
              <PasswordInput
                value={(setting as { password?: string }).password || ''}
                onChange={value => setSettingState({ ...setting, password: value })}
              />
            </div>
          </div>
        )}
        <div className="setting-item">
          <div className="setting-item-info" />
          <div className="setting-item-control">
            <button className="mod-cta" type="submit" disabled={submitting}>
              {submitText}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
