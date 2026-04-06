import * as React from 'react';
import { useState } from 'react';
import { Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { ActivityWatchRule } from '../../../types/settings';
import { createDatePicker } from '../../../ui/components/forms/DatePicker';

// Props for the modal
interface Props {
  plugin: FullCalendarPlugin;
  onClose: () => void;
}

export const ActivityWatchConfigComponent: React.FC<Props> = ({ plugin, onClose }) => {
  const settings = plugin.settings.activityWatch;

  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [targetCalendarId, setTargetCalendarId] = useState(settings.targetCalendarId);
  const [mergeToleranceMinutes, setMergeToleranceMinutes] = useState(
    settings.mergeToleranceMinutes
  );
  const [rules, setRules] = useState<ActivityWatchRule[]>(settings.rules);

  const [syncStrategy, setSyncStrategy] = useState<'auto' | 'custom'>(settings.syncStrategy);
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  // Convert settings ISO string dates back to Date objects for the picker
  const [dateRange, setDateRange] = useState<Date[]>([]);

  React.useEffect(() => {
    if (settings.customDateStart && settings.customDateEnd) {
      setDateRange([new Date(settings.customDateStart), new Date(settings.customDateEnd)]);
    }
  }, [settings.customDateStart, settings.customDateEnd]);

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
    // Modify settings strictly in memory, then use the plugin save mechanism.
    plugin.settings.activityWatch.apiUrl = apiUrl;
    plugin.settings.activityWatch.targetCalendarId = targetCalendarId;
    plugin.settings.activityWatch.mergeToleranceMinutes = mergeToleranceMinutes;
    plugin.settings.activityWatch.syncStrategy = syncStrategy;
    plugin.settings.activityWatch.customDateStart = dateRange[0] ? dateRange[0].toISOString() : '';
    plugin.settings.activityWatch.customDateEnd = dateRange[1] ? dateRange[1].toISOString() : '';
    plugin.settings.activityWatch.rules = rules;

    await plugin.saveSettings();
    new Notice(t('modals.activityWatchSetup.saved'));
    onClose();
  };

  const addRule = () => {
    setRules([
      ...rules,
      {
        id: Math.random().toString(36).substring(2, 11),
        bucketType: 'window',
        matchPattern: '',
        useRegex: false,
        category: '',
        subCategory: '',
        titleTemplate: '{app}'
      }
    ]);
  };

  const updateRule = (id: string, updates: Partial<ActivityWatchRule>) => {
    setRules(rules.map(r => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

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
        <p style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
          {t('modals.activityWatchSetup.strategy.description')}
        </p>

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
          <div className="setting-item-name">{t('modals.activityWatchSetup.apiUrl.label')}</div>
          <div className="setting-item-description">
            {t('modals.activityWatchSetup.apiUrl.description')}
          </div>
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
          <div className="setting-item-name">
            {t('modals.activityWatchSetup.targetCalendar.label')}
          </div>
          <div className="setting-item-description">
            {t('modals.activityWatchSetup.targetCalendar.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <select value={targetCalendarId} onChange={e => setTargetCalendarId(e.target.value)}>
            <option value="">{t('modals.activityWatchSetup.targetCalendar.unselected')}</option>
            {availableProviders.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('modals.activityWatchSetup.mergeTolerance.label')}
          </div>
          <div className="setting-item-description">
            {t('modals.activityWatchSetup.mergeTolerance.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="number"
            min="0"
            value={mergeToleranceMinutes}
            onChange={e => setMergeToleranceMinutes(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      <h3>{t('modals.activityWatchSetup.rules.title')}</h3>
      <p style={{ margin: 0, fontSize: '0.8em', color: 'var(--text-muted)' }}>
        {t('modals.activityWatchSetup.rules.description')}
      </p>

      <div
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          border: '1px solid var(--background-modifier-border)',
          padding: '10px',
          borderRadius: '5px'
        }}
      >
        {rules.map((rule, idx) => (
          <div
            key={rule.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              padding: '10px',
              marginBottom: '10px',
              backgroundColor: 'var(--background-secondary)',
              borderRadius: '4px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>
                {t('modals.activityWatchSetup.rules.ruleNumber', { number: (idx + 1).toString() })}
              </strong>
              <button onClick={() => deleteRule(rule.id)} className="mod-warning">
                {t('modals.activityWatchSetup.rules.delete')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <input
                  type="text"
                  placeholder={t('modals.activityWatchSetup.rules.bucketPlaceholder')}
                  value={rule.bucketType}
                  onChange={e => updateRule(rule.id, { bucketType: e.target.value })}
                  title={t('modals.activityWatchSetup.rules.bucketTitle')}
                  style={{ width: '180px' }}
                />
                <input
                  type="text"
                  placeholder={t('modals.activityWatchSetup.rules.matchFieldPlaceholder')}
                  value={rule.matchField || ''}
                  onChange={e => updateRule(rule.id, { matchField: e.target.value })}
                  title={t('modals.activityWatchSetup.rules.matchFieldTitle')}
                  style={{ width: '180px' }}
                />
              </div>

              <input
                type="text"
                placeholder={t('modals.activityWatchSetup.rules.matchFormat')}
                value={rule.matchPattern}
                onChange={e => updateRule(rule.id, { matchPattern: e.target.value })}
                style={{ flexGrow: 1 }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="checkbox"
                  checked={rule.useRegex}
                  onChange={e => updateRule(rule.id, { useRegex: e.target.checked })}
                />
                <span>{t('modals.activityWatchSetup.rules.useRegex')}</span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input
                type="text"
                placeholder={t('modals.activityWatchSetup.rules.category')}
                value={rule.category}
                onChange={e => updateRule(rule.id, { category: e.target.value })}
              />
              <input
                type="text"
                placeholder={t('modals.activityWatchSetup.rules.subCategory')}
                value={rule.subCategory}
                onChange={e => updateRule(rule.id, { subCategory: e.target.value })}
              />
            </div>

            <input
              type="text"
              placeholder={t('modals.activityWatchSetup.rules.titleTemplate')}
              value={rule.titleTemplate}
              onChange={e => updateRule(rule.id, { titleTemplate: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
        ))}
        <button onClick={addRule}>{t('modals.activityWatchSetup.rules.add')}</button>
      </div>

      <div
        className="setting-item-control"
        style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}
      >
        <button onClick={onClose}>{t('modals.activityWatchSetup.buttons.cancel')}</button>
        <button
          className="mod-cta"
          onClick={() => {
            void handleSave();
          }}
        >
          {t('modals.activityWatchSetup.buttons.save')}
        </button>
      </div>
    </div>
  );
};
