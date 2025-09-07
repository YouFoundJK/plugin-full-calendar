// src/ui/components/forms/ColorPicker.tsx

import * as React from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Reusable color picker component that follows the working pattern from Advanced Categories.
 * Uses the same onChange handler pattern that doesn't interfere with the native color picker UI.
 */
export function ColorPicker({ value, onChange, className, style }: ColorPickerProps) {
  return (
    <input
      type="color"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
      style={style}
    />
  );
}

/**
 * Legacy ColorPicker component for backwards compatibility with the form system.
 * This should be migrated to use the new ColorPicker component.
 */
export function LegacyColorPicker<T extends { color?: string }>({
  source,
  changeListener
}: {
  source: T;
  changeListener: (updater: (value: string) => T) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Color</div>
        <div className="setting-item-description">The color of events on the calendar</div>
      </div>
      <div className="setting-item-control">
        <ColorPicker
          value={source.color || '#3b82f6'}
          onChange={color => {
            const syntheticEvent = {
              target: { value: color },
              currentTarget: { value: color }
            } as React.ChangeEvent<HTMLInputElement>;
            changeListener(x => ({ ...source, color }))(syntheticEvent);
          }}
          className="fc-setting-color-input"
        />
      </div>
    </div>
  );
}
