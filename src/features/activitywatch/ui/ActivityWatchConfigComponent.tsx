import * as React from 'react';
import { useState } from 'react';
import { Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { ContextProfile, TriggerRule } from '../../../types/settings';
import { createDatePicker } from '../../../ui/components/forms/DatePicker';

interface Props {
  plugin: FullCalendarPlugin;
  onClose: () => void;
}

export const ActivityWatchConfigComponent: React.FC<Props> = ({ plugin, onClose }) => {
  const settings = plugin.settings.activityWatch;
  const normalizedProfiles = (settings.profiles || []).map(profile => ({
    ...profile,
    supportingEvidenceRules: profile.supportingEvidenceRules || []
  }));

  // Sync settings
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [targetCalendarId, setTargetCalendarId] = useState(settings.targetCalendarId);
  const [syncStrategy, setSyncStrategy] = useState<'auto' | 'custom'>(settings.syncStrategy);
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    if (settings.customDateStart && settings.customDateEnd) {
      return [new Date(settings.customDateStart), new Date(settings.customDateEnd)];
    }
    return [];
  });

  // FSM Profile settings
  const [profiles, setProfiles] = useState<ContextProfile[]>(normalizedProfiles);

  React.useEffect(() => {
    if (syncStrategy === 'custom' && dateInputRef.current) {
      const picker = createDatePicker(dateInputRef.current, {
        mode: 'range',
        defaultDate: dateRange,
        onChange: dates => setDateRange(dates)
      });
      return () => picker.destroy();
    }
  }, [syncStrategy]);

  const handleSave = async () => {
    plugin.settings.activityWatch.apiUrl = apiUrl;
    plugin.settings.activityWatch.targetCalendarId = targetCalendarId;
    plugin.settings.activityWatch.syncStrategy = syncStrategy;
    plugin.settings.activityWatch.customDateStart = dateRange[0] ? dateRange[0].toISOString() : '';
    plugin.settings.activityWatch.customDateEnd = dateRange[1] ? dateRange[1].toISOString() : '';
    plugin.settings.activityWatch.profiles = profiles;

    await plugin.saveSettings();
    new Notice(t('modals.activityWatchSetup.saved'));
    onClose();
  };

  const addProfile = () => {
    setProfiles([
      ...profiles,
      {
        id: Math.random().toString(36).substring(2, 11),
        name: 'New Profile',
        activationThresholdMins: 5,
        softBreakLimitMins: 3,
        activationRules: [],
        supportingEvidenceRules: [],
        hardBreakRules: [],
        titleTemplate: '{app} - {title}',
        color: 'Work'
      }
    ]);
  };

  const updateProfile = (id: string, updates: Partial<ContextProfile>) => {
    setProfiles(profiles.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteProfile = (id: string) => {
    setProfiles(profiles.filter(p => p.id !== id));
  };

  const createEmptyRule = (): TriggerRule => ({
    id: Math.random().toString(36).substring(2, 11),
    bucketType: 'window',
    matchField: 'app',
    matchPattern: '',
    useRegex: false
  });

  const availableProviders = plugin.providerRegistry
    .getAllSources()
    .map(s => {
      const instance = plugin.providerRegistry.getInstance(s.id);
      return {
        id: s.id,
        name: s.name || s.type,
        canCreate: instance?.getCapabilities()?.canCreate
      };
    })
    .filter(p => p.canCreate);

  // Helper for rendering rule sub-lists
  const renderRuleList = (
    profile: ContextProfile,
    listType: 'activationRules' | 'supportingEvidenceRules' | 'hardBreakRules'
  ) => {
    // Optional chaining because migrated profiles might crash if these arrays are missing
    const rules = profile[listType] || [];
    const setRules = (newRules: TriggerRule[]) =>
      updateProfile(profile.id, { [listType]: newRules });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
        {rules.map(rule => (
          <div key={rule.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input
              list={`buckets-${rule.id}`}
              type="text"
              value={rule.bucketType}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, bucketType: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.bucketPlaceholder')}
              style={{ width: '120px' }}
            />
            <datalist id={`buckets-${rule.id}`}>
              <option value="web" />
              <option value="window" />
              <option value="afk" />
            </datalist>

            <input
              list={`fields-${rule.id}`}
              type="text"
              value={rule.matchField || ''}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, matchField: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.fieldPlaceholder')}
              style={{ width: '100px' }}
            />
            <datalist id={`fields-${rule.id}`}>
              {rule.bucketType === 'web' && (
                <>
                  <option value="url" />
                  <option value="title" />
                  <option value="audible" />
                  <option value="incognito" />
                  <option value="tabCount" />
                </>
              )}
              {rule.bucketType === 'window' && (
                <>
                  <option value="app" />
                  <option value="title" />
                </>
              )}
              {rule.bucketType === 'afk' && <option value="status" />}
            </datalist>
            <input
              type="text"
              value={rule.matchPattern}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, matchPattern: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.matchPatternPlaceholder')}
              style={{ flexGrow: 1 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <input
                type="checkbox"
                checked={rule.useRegex}
                onChange={e =>
                  setRules(
                    rules.map(r => (r.id === rule.id ? { ...r, useRegex: e.target.checked } : r))
                  )
                }
              />{' '}
              {t('modals.activityWatchSetup.rules.regex')}
            </label>
            <button
              onClick={() => setRules(rules.filter(r => r.id !== rule.id))}
              className="mod-warning"
              style={{ padding: '0 8px' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setRules([...rules, createEmptyRule()])}
          style={{ alignSelf: 'flex-start' }}
        >
          {t('modals.activityWatchSetup.rules.btnAdd')}
        </button>
      </div>
    );
  };

  return (
    <div
      className="fc-settings-modal"
      style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}
    >
      <h2>{t('modals.activityWatchSetup.title')}</h2>

      <div
        style={{
          border: '1px solid var(--background-modifier-border)',
          padding: '15px',
          borderRadius: '5px',
          backgroundColor: 'var(--background-secondary)'
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t('modals.activityWatchSetup.strategy.title')}</h3>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="radio"
              name="syncStrategy"
              checked={syncStrategy === 'auto'}
              onChange={() => setSyncStrategy('auto')}
            />
            {t('modals.activityWatchSetup.strategy.auto')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="radio"
              name="syncStrategy"
              checked={syncStrategy === 'custom'}
              onChange={() => setSyncStrategy('custom')}
            />
            {t('modals.activityWatchSetup.strategy.custom')}
          </label>
        </div>
        {syncStrategy === 'custom' && (
          <div>
            <input
              ref={dateInputRef}
              type="text"
              placeholder={t('modals.activityWatchSetup.strategy.datePlaceholder')}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('modals.activityWatchSetup.apiUrl')}</div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('modals.activityWatchSetup.targetCalendar')}</div>
        </div>
        <div className="setting-item-control">
          <select value={targetCalendarId} onChange={e => setTargetCalendarId(e.target.value)}>
            <option value="">{t('modals.activityWatchSetup.unselected')}</option>
            {availableProviders.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3>{t('modals.activityWatchSetup.profiles.title')}</h3>
      <div
        style={{
          maxHeight: '500px',
          overflowY: 'auto',
          border: '1px solid var(--background-modifier-border)',
          padding: '10px',
          borderRadius: '5px'
        }}
      >
        {profiles.map(profile => (
          <div
            key={profile.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '15px',
              marginBottom: '15px',
              backgroundColor: 'var(--background-secondary)',
              borderRadius: '4px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t('modals.activityWatchSetup.profiles.config')}</strong>
              <button onClick={() => deleteProfile(profile.id)} className="mod-warning">
                {t('modals.activityWatchSetup.profiles.btnDelete')}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                {t('modals.activityWatchSetup.profiles.name')}
                <input
                  type="text"
                  value={profile.name}
                  onChange={e => updateProfile(profile.id, { name: e.target.value })}
                  style={{ width: '100%', marginTop: '5px' }}
                />
              </label>
              <label>
                {t('modals.activityWatchSetup.profiles.category')}
                <input
                  type="text"
                  value={profile.color}
                  onChange={e => updateProfile(profile.id, { color: e.target.value })}
                  style={{ width: '100%', marginTop: '5px' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                {t('modals.activityWatchSetup.profiles.activationThreshold')}
                <input
                  type="number"
                  min="0"
                  value={profile.activationThresholdMins}
                  onChange={e =>
                    updateProfile(profile.id, {
                      activationThresholdMins: parseInt(e.target.value) || 0
                    })
                  }
                  style={{ width: '100%', marginTop: '5px' }}
                />
              </label>
              <label>
                {t('modals.activityWatchSetup.profiles.softBreakLimit')}
                <input
                  type="number"
                  min="0"
                  value={profile.softBreakLimitMins}
                  onChange={e =>
                    updateProfile(profile.id, { softBreakLimitMins: parseInt(e.target.value) || 0 })
                  }
                  style={{ width: '100%', marginTop: '5px' }}
                />
              </label>
            </div>

            <label>
              {t('modals.activityWatchSetup.profiles.titleTemplate')}
              <input
                type="text"
                value={profile.titleTemplate}
                onChange={e => updateProfile(profile.id, { titleTemplate: e.target.value })}
                style={{ width: '100%', marginTop: '5px' }}
                placeholder={t('modals.activityWatchSetup.profiles.titleTemplatePlaceholder')}
              />
            </label>

            <div>
              <strong>{t('modals.activityWatchSetup.profiles.primaryEvidenceRules')}</strong>
              {renderRuleList(profile, 'activationRules')}
            </div>

            <div style={{ marginTop: '10px' }}>
              <strong>{t('modals.activityWatchSetup.profiles.supportingEvidenceRules')}</strong>
              {renderRuleList(profile, 'supportingEvidenceRules')}
            </div>

            <div style={{ marginTop: '10px' }}>
              <strong>{t('modals.activityWatchSetup.profiles.hardBreakRules')}</strong>
              {renderRuleList(profile, 'hardBreakRules')}
            </div>
          </div>
        ))}
        <button onClick={addProfile}>
          {t('modals.activityWatchSetup.profiles.btnAddProfile')}
        </button>
      </div>

      <div
        className="setting-item-control"
        style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}
      >
        <button onClick={onClose}>{t('modals.activityWatchSetup.buttons.cancel')}</button>
        <button className="mod-cta" onClick={() => void handleSave()}>
          {t('modals.activityWatchSetup.buttons.save')}
        </button>
      </div>
    </div>
  );
};
