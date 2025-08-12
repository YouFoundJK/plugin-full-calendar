import * as React from 'react';
import { useState, useEffect, useRef } from 'react'; // Import useRef
import { Setting } from 'obsidian';
import { GoogleProviderConfig } from './typesGCal';

// The component now has a much cleaner interface.
interface GoogleConfigComponentProps {
  isAuthenticated: boolean;
  getAvailableCalendars: () => Promise<any[]>;
  onSave: (configs: GoogleProviderConfig[]) => void;
  onClose: () => void;
}

export const GoogleConfigComponent: React.FC<GoogleConfigComponentProps> = ({
  isAuthenticated,
  getAvailableCalendars,
  onSave,
  onClose
}) => {
  // --- All hooks are now called unconditionally at the top ---
  const [calendars, setCalendars] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null); // Moved up

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    const fetchCalendars = async () => {
      try {
        const availableCalendars = await getAvailableCalendars();
        setCalendars(availableCalendars);
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : 'An unknown error occurred while fetching calendars.';
        setError(`Failed to fetch calendars: ${errorMessage}`);
        console.error('Error fetching Google Calendar list:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCalendars();
  }, [isAuthenticated, getAvailableCalendars]);

  useEffect(() => {
    // Moved up
    if (listRef.current) {
      listRef.current.empty();
      calendars.forEach(cal => {
        new Setting(listRef.current!)
          .setName(cal.summary)
          .setDesc(cal.description || '')
          .addToggle(toggle => {
            toggle.setValue(selection.has(cal.id));
            toggle.onChange(value => handleToggle(cal.id, value));
          });
      });
    }
  }, [calendars, selection]);

  // --- Helper functions can stay here ---
  const handleToggle = (id: string, value: boolean) => {
    setSelection(prevSelection => {
      const newSelection = new Set(prevSelection);
      if (value) {
        newSelection.add(id);
      } else {
        newSelection.delete(id);
      }
      return newSelection;
    });
  };

  const handleSave = () => {
    const selectedConfigs = calendars
      .filter(cal => selection.has(cal.id))
      .map(cal => ({
        id: cal.id,
        name: cal.summary,
        color: cal.backgroundColor
      }));

    onSave(selectedConfigs);
    onClose();
  };

  // --- Conditional rendering logic is now safe ---
  if (!isAuthenticated) {
    return (
      <div>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Prerequisite: Connect Google Account</div>
            <div className="setting-item-description">
              Please close this modal and connect your Google Account in the "Google calendar
              integration" section of the plugin settings first.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div>Loading calendars...</div>;
  }

  if (error) {
    return <div className="mod-warning">{error}</div>;
  }

  if (calendars.length === 0) {
    return <div>No new calendars found, or all your Google calendars have already been added.</div>;
  }

  return (
    <div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Select Calendars</div>
          <div className="setting-item-description">
            Choose which calendars you would like to add to Obsidian.
          </div>
        </div>
      </div>

      <div ref={listRef}></div>

      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button className="mod-cta" onClick={handleSave} disabled={selection.size === 0}>
            Add {selection.size > 0 ? selection.size : ''} Calendar
            {selection.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
