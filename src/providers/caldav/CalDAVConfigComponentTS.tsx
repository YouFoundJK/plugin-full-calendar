import * as React from 'react';
import { useState } from 'react';
import { UrlInput } from '../../ui/components/forms/UrlInput';
import { UsernameInput } from '../../ui/components/forms/UsernameInput';
import { PasswordInput } from '../../ui/components/forms/PasswordInput';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';
import { importCalendars } from './import_caldav-ts';

interface CalDAVConfigComponentTSProps {
  config: Partial<CalDAVProviderTSConfig>;
  onSave: (configs: CalDAVProviderTSConfig[]) => void;
  onClose: () => void;
}

export const CalDAVConfigComponentTS: React.FC<CalDAVConfigComponentTSProps> = ({
  config,
  onSave,
  onClose
}) => {
  const [url, setUrl] = useState(config.url || '');
  const [username, setUsername] = useState(config.username || '');
  const [password, setPassword] = useState(config.password || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitText, setSubmitText] = useState('Import Calendars');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url || !username || !password) return;

    setIsSubmitting(true);
    setSubmitText('Importing...');

    try {
      const sources = await importCalendars({ type: 'basic', username, password }, url, []);
      onSave(sources as CalDAVProviderTSConfig[]);
      onClose();
    } catch (error) {
      console.error('Failed to import CalDAV calendars', error);
      setSubmitText('Import Calendars');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Server URL</div>
          <div className="setting-item-description">
            Paste your CalDAV server URL (e.g. <code>https://caldav.icloud.com</code> or{' '}
            <code>https://calendar.zoho.in/caldav/</code>). The plugin will automatically discover
            all available calendars.
          </div>
        </div>
        <div className="setting-item-control">
          <UrlInput value={url} onChange={setUrl} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Username</div>
          <div className="setting-item-description">Username for the account</div>
        </div>
        <div className="setting-item-control">
          <UsernameInput value={username} onChange={setUsername} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Password</div>
          <div className="setting-item-description">Password for the account</div>
        </div>
        <div className="setting-item-control">
          <PasswordInput value={password} onChange={setPassword} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button
            className="mod-cta"
            type="submit"
            disabled={isSubmitting || !url || !username || !password}
          >
            {submitText}
          </button>
        </div>
      </div>
    </form>
  );
};
