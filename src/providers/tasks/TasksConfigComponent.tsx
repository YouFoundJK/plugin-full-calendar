/**
 * @file TasksConfigComponent.tsx
 * @brief Configuration component for Tasks plugin provider
 * 
 * @description
 * Provides the configuration UI for the Tasks plugin provider integration.
 * 
 * @license See LICENSE.md
 */

import React from 'react';
import { TasksPluginProviderConfig } from './typesTask';
import { ProviderConfigContext } from '../typesProvider';

interface TasksConfigProps {
  config: Partial<TasksPluginProviderConfig>;
  onConfigChange: (newConfig: Partial<TasksPluginProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: TasksPluginProviderConfig) => void;
  onClose: () => void;
}

export const TasksConfigComponent: React.FC<TasksConfigProps> = ({
  config,
  onConfigChange,
  context,
  onSave,
  onClose
}) => {
  const handleSave = () => {
    const finalConfig: TasksPluginProviderConfig = {
      id: config.id || '',
      type: 'tasks',
      displayName: config.displayName || 'Obsidian Tasks'
    };
    
    onSave(finalConfig);
  };

  const handleDisplayNameChange = (value: string) => {
    onConfigChange({ ...config, displayName: value });
  };

  return (
    <div className="tasks-config">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Display Name</div>
          <div className="setting-item-description">
            The name that will appear in your calendar list
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="text"
            value={config.displayName || 'Obsidian Tasks'}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            placeholder="Obsidian Tasks"
          />
        </div>
      </div>

      <div className="setting-item info">
        <div className="setting-item-info">
          <div className="setting-item-name">About Tasks Integration</div>
          <div className="setting-item-description">
            This calendar source will display tasks from the Obsidian Tasks plugin that have due dates (📅 YYYY-MM-DD format).
            Tasks without due dates will appear in the backlog panel when this calendar is active.
          </div>
        </div>
      </div>

      <div className="modal-button-container">
        <button 
          className="mod-cta" 
          onClick={handleSave}
        >
          Save
        </button>
        <button onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};