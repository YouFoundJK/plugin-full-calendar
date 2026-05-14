import { App, Modal, ButtonComponent } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { createElement } from 'react';
import { changelogData } from '../settings/changelogs/changelogData';
import { VersionSection } from '../settings/changelogs/Changelog';
import '../settings/changelogs/changelog.css';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { t } from '../../features/i18n/i18n';

type SettingsManager = {
  open: () => void;
  openTabById: (id: string) => void;
};

type AppWithSettings = App & { setting: SettingsManager };

export class WhatsNewModal extends Modal {
  private plugin: FullCalendarPlugin;
  private reactRoot: ReactDOM.Root | null = null;

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    void (() => {
      const { contentEl } = this;
      contentEl.empty();
      contentEl.addClass('full-calendar-whats-new-modal');

      const bodyEl = contentEl.createDiv('full-calendar-whats-new-body');
      const valueContainer = bodyEl.createDiv('full-calendar-whats-new-value');

      const headerRow = valueContainer.createDiv('full-calendar-whats-new-header-row');
      headerRow.createEl('h2', { text: t('settings.changelog.modal.title') });
      const seeAllButtonWrap = headerRow.createDiv('full-calendar-whats-new-header-actions');
      new ButtonComponent(seeAllButtonWrap)
        .setButtonText(t('settings.changelog.modal.seeAllButton'))
        .onClick(() => {
          this.close();
          PluginState.showChangelog();
          const settingsManager = (this.plugin.app as AppWithSettings).setting;
          settingsManager.open();
          settingsManager.openTabById(this.plugin.manifest.id);
        });

      const valueContent = valueContainer.createDiv('full-calendar-whats-new-content');

      // Render the React component for the latest version
      const reactRootInfo = valueContent.createDiv('full-calendar-whats-new-react-root');
      this.reactRoot = ReactDOM.createRoot(reactRootInfo);

      const latestVersion = changelogData[0];

      this.reactRoot.render(
        createElement(
          'div',
          {},
          createElement(VersionSection, {
            version: latestVersion,
            isInitiallyOpen: true,
            embedded: true
          })
        )
      );

      const donationFooter = bodyEl.createDiv('full-calendar-whats-new-donation-footer');
      donationFooter.createEl('p', {
        text: t('settings.changelog.modal.donationMessage'),
        cls: 'full-calendar-whats-new-donation-message'
      });

      const donationActions = donationFooter.createDiv('full-calendar-whats-new-donation-actions');
      new ButtonComponent(donationActions)
        .setButtonText(t('settings.changelog.modal.donationButton'))
        .setCta()
        .onClick(() => {
          window.open(
            'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/SustainabilityEthics/',
            '_blank'
          );
        });
    })();
  }

  onClose() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    const { contentEl } = this;
    contentEl.empty();
  }
}
