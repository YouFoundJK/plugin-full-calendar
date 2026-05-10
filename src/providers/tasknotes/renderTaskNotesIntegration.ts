import { PluginState } from '../../core/PluginState';
import { Notice, Setting } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { createDescWithDocs } from '../../ui/settings/docsLinks';
import { TaskNotesIntegrationSettingsModal } from './TaskNotesIntegrationSettingsModal';
import { t } from '../../features/i18n/i18n';

export function renderTaskNotesIntegrationSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  onChange: () => void
): void {
  const hasTaskNotesCalendar = PluginState.getSettings().calendarSources.some(
    source => source.type === 'tasknotes'
  );

  new Setting(containerEl)
    .setName(t('settings.tasknotesIntegration.title'))
    .setDesc(
      createDescWithDocs(
        hasTaskNotesCalendar
          ? t('settings.tasknotesIntegration.descriptionConfigured')
          : t('settings.tasknotesIntegration.descriptionMissingSource'),
        [{ text: t('settings.tasknotesIntegration.docsLink'), path: 'user/calendars/tasknotes' }]
      )
    )
    .setHeading()
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('settings.tasknotesIntegration.configButton'))
        .onClick(() => {
          if (!hasTaskNotesCalendar) {
            new Notice(t('notices.tasknotes.addSourceFirst'));
            return;
          }

          new TaskNotesIntegrationSettingsModal(plugin, onChange).open();
        });
    });
}
