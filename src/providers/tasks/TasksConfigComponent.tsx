/**
 * @file TasksConfigComponent.tsx
 * @brief Configuration component for Tasks plugin provider
 */

import * as React from 'react';
import { FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { TasksPluginProviderConfig } from './typesTasks';
import { TextInput } from '../../ui/components/forms/TextInput';

export const TasksConfigComponent: FCReactComponent<{
  config: Partial<TasksPluginProviderConfig>;
  onConfigChange: (newConfig: Partial<TasksPluginProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: TasksPluginProviderConfig | TasksPluginProviderConfig[]) => void;
  onClose: () => void;
}> = ({ config, onConfigChange, context, onSave, onClose }) => {
  const [localConfig, setLocalConfig] = React.useState<Partial<TasksPluginProviderConfig>>(
    config
  );

  const updateConfig = React.useCallback(
    (updates: Partial<TasksPluginProviderConfig>) => {
      const newConfig = { ...localConfig, ...updates };
      setLocalConfig(newConfig);
      onConfigChange(newConfig);
    },
    [localConfig, onConfigChange]
  );

  const handleSave = () => {
    if (!localConfig.name?.trim()) {
      // Use default name if none provided
      localConfig.name = 'Obsidian Tasks';
    }
    
    const finalConfig: TasksPluginProviderConfig = {
      id: localConfig.id || `tasks_${Date.now()}`,
      name: localConfig.name.trim()
    };
    
    onSave(finalConfig);
  };

  return (
    <div className="setting-item-info">
      <div className="setting-item-name">Configure Obsidian Tasks Integration</div>
      <div className="setting-item-description">
        This will scan your vault for tasks in the Obsidian Tasks plugin format and display
        dated tasks on the calendar and undated tasks in the backlog.
      </div>
      
      <div style={{ marginTop: '1rem' }}>
        <div>
          <label>Calendar Name:</label>
          <TextInput
            placeholder="Obsidian Tasks"
            value={localConfig.name || ''}
            onChange={(name: string) => updateConfig({ name })}
            readOnly={false}
          />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={handleSave} className="mod-cta">
          Save
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};