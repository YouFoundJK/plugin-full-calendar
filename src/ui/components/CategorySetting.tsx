/**
 * @file CategorySetting.tsx
 * @brief React component for managing category color settings.
 *
 * @description
 * This component renders a list of user-defined categories, allowing them to
 * set a color for each one, add new categories, and delete existing ones.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { useState } from 'react';

export interface CategorySetting {
  name: string;
  color: string;
}

interface CategorySettingsProps {
  settings: CategorySetting[];
  onSave: (newSettings: CategorySetting[]) => Promise<void>;
}

export const CategorySettingsManager = ({ settings, onSave }: CategorySettingsProps) => {
  const [localSettings, setLocalSettings] = useState<CategorySetting[]>(settings);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    await onSave(localSettings);
    setDirty(false);
  };

  const addCategory = () => {
    if (newCategoryName.trim() === '' || localSettings.find(s => s.name === newCategoryName)) {
      // Don't add empty or duplicate categories
      return;
    }
    const newCategory: CategorySetting = {
      name: newCategoryName,
      color: getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim()
    };
    setLocalSettings([...localSettings, newCategory]);
    setNewCategoryName('');
    setDirty(true);
  };

  const updateCategoryColor = (index: number, color: string) => {
    const newSettings = [...localSettings];
    newSettings[index].color = color;
    setLocalSettings(newSettings);
    setDirty(true);
  };

  const updateCategoryName = (index: number, name: string) => {
    const newSettings = [...localSettings];
    newSettings[index].name = name;
    setLocalSettings(newSettings);
    setDirty(true);
  };

  const deleteCategory = (index: number) => {
    const newSettings = [...localSettings];
    newSettings.splice(index, 1);
    setLocalSettings(newSettings);
    setDirty(true);
  };

  return (
    <div style={{ width: '100%' }}>
      {localSettings.map((setting, index) => (
        <div className="setting-item" key={index}>
          <div className="setting-item-control" style={{ flex: '1' }}>
            <input
              type="text"
              value={setting.name}
              onChange={e => updateCategoryName(index, e.target.value)}
              placeholder="Category Name"
            />
          </div>
          <div className="setting-item-control">
            <input
              type="color"
              value={setting.color}
              onChange={e => updateCategoryColor(index, e.target.value)}
              style={{ minWidth: '3rem' }}
            />
          </div>
          <div className="setting-item-control">
            <button onClick={() => deleteCategory(index)}>Delete</button>
          </div>
        </div>
      ))}

      {/* Add New Category Row */}
      <div className="setting-item">
        <div className="setting-item-control" style={{ flex: '1' }}>
          <input
            type="text"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            placeholder="New Category Name"
          />
        </div>
        <div className="setting-item-control">
          <button onClick={addCategory} className="mod-cta">
            Add
          </button>
        </div>
      </div>

      {/* Save Button */}
      {dirty && (
        <div className="setting-item">
          <div className="setting-item-control">
            <button onClick={handleSave} className="mod-cta">
              Save Category Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
