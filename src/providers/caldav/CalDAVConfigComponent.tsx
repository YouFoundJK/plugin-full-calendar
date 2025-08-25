import * as React from 'react';
import { useState } from 'react';
import { UrlInput } from '../../ui/components/forms/UrlInput';
import { UsernameInput } from '../../ui/components/forms/UsernameInput';
import { PasswordInput } from '../../ui/components/forms/PasswordInput';
import { CalDAVProviderConfig } from './typesCalDAV';
import { importCalendars } from './import';

interface CalDAVConfigComponentProps {
  config: Partial<CalDAVProviderConfig>;
  onSave: (configs: CalDAVProviderConfig[]) => void;
  onClose: () => void; // Make it non-optional here since it's used
}

export const CalDAVConfigComponent: React.FC<CalDAVConfigComponentProps> = ({
  config,
  onSave,
  onClose // Destructure prop
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
      onSave(sources as CalDAVProviderConfig[]);
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
          <div className="setting-item-name">URL</div>
          <div className="setting-item-description">URL of the CalDAV server</div>
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
