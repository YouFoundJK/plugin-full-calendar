import * as React from 'react';
import ReactModal from '../../../ui/ReactModal';
import FullCalendarPlugin from '../../../main';
import { ActivityWatchConfigComponent } from './ActivityWatchConfigComponent';

export class ActivityWatchSettingsModal extends ReactModal {
  plugin: FullCalendarPlugin;
  onChange: () => void;

  constructor(plugin: FullCalendarPlugin, onChange: () => void) {
    // ReactModal handles standard async render callback
    super(plugin.app, closeModal => {
      return Promise.resolve(
        React.createElement(ActivityWatchConfigComponent, {
          plugin,
          onClose: () => {
            closeModal();
            onChange();
          }
        })
      );
    });
    this.plugin = plugin;
    this.onChange = onChange;
    // Settings modal title could be set here if the base implementation allows,
    // but the React component will have a header anyway.
  }
}
