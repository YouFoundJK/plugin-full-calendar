import { Menu, Notice } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { t } from '../../features/i18n/i18n';
import { ViewContext } from './ViewContext';

export class ViewUIHandler {
  private workspaceSwitchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private ctx: ViewContext) {}

  public getWorkspaceSwitcherText(): string {
    const activeWorkspace = this.ctx.viewEnhancer?.getActiveWorkspace();
    if (!activeWorkspace) {
      return `${t('ui.view.workspace.switcherLabel')} ▾`;
    }

    const maxLength = PluginState.isMobile() ? 8 : 12;
    const name =
      activeWorkspace.name.length > maxLength
        ? activeWorkspace.name.substring(0, maxLength) + '...'
        : activeWorkspace.name;

    return `${name} ▾`;
  }

  public showWorkspaceSwitcher(ev?: MouseEvent) {
    const menu = new Menu();

    menu.addItem(item => {
      item
        .setTitle(t('ui.view.buttons.defaultView'))
        .setIcon(PluginState.getSettings().activeWorkspace === null ? 'check' : '')
        .onClick(async () => {
          await this.switchToWorkspace(null);
        });
    });

    if (PluginState.getSettings().workspaces.length > 0) {
      menu.addSeparator();

      PluginState.getSettings().workspaces.forEach(workspace => {
        menu.addItem(item => {
          item
            .setTitle(workspace.name)
            .setIcon(PluginState.getSettings().activeWorkspace === workspace.id ? 'check' : '')
            .onClick(async () => {
              await this.switchToWorkspace(workspace.id);
            });
        });
      });
    }

    if (ev) {
      menu.showAtMouseEvent(ev);
    } else {
      const rect = this.ctx.containerEl.getBoundingClientRect();
      menu.showAtPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
  }

  public async switchToWorkspace(workspaceId: string | null) {
    if (this.workspaceSwitchTimeout) {
      clearTimeout(this.workspaceSwitchTimeout);
    }
    PluginState.getSettings().activeWorkspace = workspaceId;
    await PluginState.saveSettings();

    this.workspaceSwitchTimeout = setTimeout(() => {
      void this.ctx.refreshView();
    }, 100);
  }

  public async activateChronoAnalyser(): Promise<void> {
    if (PluginState.isMobile()) {
      new Notice(t('ui.view.errors.chronoAnalyserDesktopOnly'));
      return;
    }
    try {
      const { activateAnalysisView } = await import('../../chrono_analyser/AnalysisView');
      await activateAnalysisView(this.ctx.app);
    } catch (err) {
      console.error('Full Calendar: Failed to activate Chrono Analyser view', err);
      new Notice(t('ui.view.errors.chronoAnalyserFailed'));
    }
  }
}
