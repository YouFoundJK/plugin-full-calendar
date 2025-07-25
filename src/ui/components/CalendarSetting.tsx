/**
 * @file CalendarSetting.tsx
 * @brief React component for displaying and managing a list of configured calendars.
 *
 * @description
 * This file defines the `CalendarSettings` component, which is embedded in the
 * plugin's settings tab. It is responsible for rendering the list of all
 * currently configured calendar sources, allowing the user to modify their
 * colors or delete them. It maintains its own state and syncs with the
 * plugin settings upon saving.
 *
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import * as React from 'react';
import { CalendarInfo } from '../../types';
import { getNextColor } from '../colors';

type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

interface BasicProps<T extends Partial<CalendarInfo>> {
  source: T;
}

function DirectorySetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithDirectory.directory}
        style={{ width: '100%', marginLeft: 4, marginRight: 4 }}
      />
    </div>
  );
}

/**
 * Construct a partial calendar source of the specified type.
 * MODIFICATION: Now accepts a list of existing colors to pick a new one.
 */
export function makeDefaultPartialCalendarSource(
  type: CalendarInfo['type'] | 'icloud',
  existingColors: string[] // <-- ADD this parameter
): Partial<CalendarInfo> {
  const newColor = getNextColor(existingColors); // <-- USE the utility

  if (type === 'icloud') {
    return {
      type: 'caldav',
      color: newColor, // <-- Use the new color
      url: 'https://caldav.icloud.com'
    };
  }

  return {
    type: type,
    color: newColor // <-- Use the new color
  };
}

function HeadingSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
  return (
    <div className="setting-item-control" style={{ display: 'block', textAlign: 'center' }}>
      <span>Under heading</span>{' '}
      <input
        disabled
        type="text"
        value={sourceWithHeading.heading}
        style={{ marginLeft: 4, marginRight: 4 }}
      />{' '}
      <span style={{ paddingRight: '.5rem' }}>in daily notes</span>
    </div>
  );
}

function UrlSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithUrl.url}
        style={{ width: '100%', marginLeft: 4, marginRight: 4 }}
      />
    </div>
  );
}

function NameSetting<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithName = source as SourceWith<T, { name: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithName.name}
        style={{ width: '100%', marginLeft: 4, marginRight: 4 }}
      />
    </div>
  );
}

function Username<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
  let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
  return (
    <div className="setting-item-control">
      <input
        disabled
        type="text"
        value={sourceWithUsername.username}
        style={{ width: '100%', marginLeft: 4, marginRight: 4 }}
      />
    </div>
  );
}

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
}

// ✅ Expose this type in `settings.tsx`
export interface CalendarSettingsRef {
  addSource: (source: CalendarInfo) => void;
  getUsedDirectories: () => string[];
}

type CalendarSettingState = {
  sources: CalendarInfo[];
  dirty: boolean;
};

export class CalendarSettings
  extends React.Component<CalendarSettingsProps, CalendarSettingState>
  implements CalendarSettingsRef
{
  constructor(props: CalendarSettingsProps) {
    super(props);
    this.state = { sources: props.sources, dirty: false };
  }

  addSource = (source: CalendarInfo) => {
    this.setState(state => ({
      sources: [...state.sources, source],
      dirty: true
    }));
  };

  getUsedDirectories = () => {
    return this.state.sources
      .map(s => s.type === 'local' && s.directory)
      .filter((s): s is string => !!s);
  };

  render() {
    return (
      <div style={{ width: '100%' }}>
        {this.state.sources.map((s, idx) => (
          <CalendarSettingRow
            key={idx}
            setting={s}
            onColorChange={color =>
              this.setState(state => ({
                sources: [
                  ...state.sources.slice(0, idx),
                  { ...state.sources[idx], color },
                  ...state.sources.slice(idx + 1)
                ],
                dirty: true
              }))
            }
            deleteCalendar={() =>
              this.setState(state => ({
                sources: [...state.sources.slice(0, idx), ...state.sources.slice(idx + 1)],
                dirty: true
              }))
            }
          />
        ))}
        <div className="setting-item-control">
          {this.state.dirty && (
            <button
              onClick={() => {
                if (this.state.sources.filter(s => s.type === 'dailynote').length > 1) {
                  new Notice('Only one daily note calendar is allowed.');
                  return;
                }
                this.props.submit(this.state.sources.map(elt => elt as CalendarInfo));
                this.setState({ dirty: false });
              }}
              style={{
                backgroundColor: this.state.dirty ? 'var(--interactive-accent)' : undefined,
                color: this.state.dirty ? 'var(--text-on-accent)' : undefined
              }}
            >
              {this.state.dirty ? 'Save' : 'Settings Saved'}
            </button>
          )}
        </div>
      </div>
    );
  }
}

interface CalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  deleteCalendar: () => void;
}

export const CalendarSettingRow = ({
  setting,
  onColorChange,
  deleteCalendar
}: CalendarSettingsRowProps) => {
  const isCalDAV = setting.type === 'caldav';
  return (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} style={{ maxWidth: '15%' }}>
        ✕
      </button>
      {setting.type === 'local' ? (
        <DirectorySetting source={setting} />
      ) : setting.type === 'dailynote' ? (
        <HeadingSetting source={setting} />
      ) : (
        <UrlSetting source={setting} />
      )}
      {isCalDAV && <NameSetting source={setting} />}
      {isCalDAV && <Username source={setting} />}
      <input
        style={{ maxWidth: '25%', minWidth: '3rem' }}
        type="color"
        value={setting.color}
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};
