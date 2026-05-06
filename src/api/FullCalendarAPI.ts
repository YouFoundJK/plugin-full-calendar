import { PluginState } from '../core/PluginState';
import { Notice, Modal, App } from 'obsidian';
import type { Calendar } from '@fullcalendar/core';
import type FullCalendarPlugin from '../main';
import type { CalendarView } from '../ui/view';
import { OFCEvent } from '../types';
import { launchCreateModal } from '../ui/modals/event_modal';

/**
 * The internal API that actually holds state and performs actions.
 * This is never exposed directly on the plugin object.
 */
export class InternalAPI {
  #activeViews: Set<CalendarView> = new Set();

  public registerView(view: CalendarView) {
    this.#activeViews.add(view);
  }

  public unregisterView(view: CalendarView) {
    this.#activeViews.delete(view);
  }

  #getActiveCalendar(): Calendar | null {
    for (const view of this.#activeViews) {
      if (view.fullCalendarView) {
        return view.fullCalendarView;
      }
    }
    return null;
  }

  public async openCalendar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_VIEW_TYPE } = await import('../ui/view');
    const leaves = plugin.app.workspace
      .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
      .filter(l => (l.view as CalendarView).inSidebar === false);
    if (leaves.length === 0) {
      const leaf = plugin.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: FULL_CALENDAR_VIEW_TYPE,
        active: true
      });
    } else {
      await Promise.all(leaves.map(l => (l.view as CalendarView).onOpen()));
    }
  }

  public async openSidebar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_SIDEBAR_VIEW_TYPE } = await import('../ui/view');
    if (plugin.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
      return;
    }
    const targetLeaf = plugin.app.workspace.getRightLeaf(false);
    if (targetLeaf) {
      await targetLeaf.setViewState({
        type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
      });
      await plugin.app.workspace.revealLeaf(targetLeaf);
    } else {
      console.warn('Right leaf not found for calendar view!');
    }
  }

  public async changeView(viewName: string): Promise<void> {
    let calendar = this.#getActiveCalendar();
    if (!calendar) {
      await this.openCalendar();
      await new Promise(resolve => setTimeout(resolve, 100));
      calendar = this.#getActiveCalendar();
    }

    if (calendar) {
      calendar.changeView(viewName);
    } else {
      new Notice('Failed to find active calendar view.');
    }
  }

  public openCreateModal(initialData?: Partial<OFCEvent>): void {
    launchCreateModal(PluginState.getPlugin(), initialData || {});
  }

  public getAllEvents() {
    return PluginState.getCache().getAllEvents();
  }

  public getEventById(id: string): OFCEvent | null {
    return PluginState.getCache().getEventById(id);
  }
}

/**
 * The VIP section. Only granted to plugins with a valid token.
 */
export interface AuthorizedAPI {
  openCalendar(): Promise<void>;
  openSidebar(): Promise<void>;
  changeView(viewName: string): Promise<void>;
  openCreateModal(initialData?: Partial<OFCEvent>): void;
  getAllEvents(): unknown[];
  getEventById(id: string): OFCEvent | null;
}

/**
 * The Bouncer. This is what is exposed on `app.plugins.plugins['full-calendar'].api`.
 */
export class PublicAPI {
  #plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.#plugin = plugin;
  }

  /**
   * Requests access to the Full Calendar API.
   * Prompts the user with a modal. If approved, returns a token.
   */
  public requestAccess(pluginId: string, reason: string): Promise<string | null> {
    return new Promise(resolve => {
      const modal = new AuthorizationModal(this.#plugin.app, pluginId, reason, approved => {
        if (!approved) {
          resolve(null);
          return;
        }

        // Generate a secure token
        const token = crypto.randomUUID();
        const settings = PluginState.getSettings();

        if (!settings.authorizedTokens) {
          settings.authorizedTokens = {};
        }

        settings.authorizedTokens[token] = {
          pluginId,
          reason,
          grantedAt: Date.now()
        };

        PluginState.saveSettings()
          .then(() => resolve(token))
          .catch(err => {
            console.error('Failed to save settings:', err);
            resolve(null);
          });
      });
      modal.open();
    });
  }

  /**
   * Use an authorized token to get the actual API.
   */
  public withToken(token: string): AuthorizedAPI | null {
    const settings = PluginState.getSettings();
    if (settings.authorizedTokens && settings.authorizedTokens[token]) {
      // Valid token. Return a bound version of the InternalAPI.
      const internal = PluginState.getInternalAPI();
      return {
        openCalendar: internal.openCalendar.bind(internal),
        openSidebar: internal.openSidebar.bind(internal),
        changeView: internal.changeView.bind(internal),
        openCreateModal: internal.openCreateModal.bind(internal),
        getAllEvents: internal.getAllEvents.bind(internal),
        getEventById: internal.getEventById.bind(internal)
      };
    }
    console.error('Full Calendar API: Invalid or unauthorized token.');
    return null;
  }
}

class AuthorizationModal extends Modal {
  private pluginId: string;
  private reason: string;
  private onResolve: (approved: boolean) => void;

  constructor(app: App, pluginId: string, reason: string, onResolve: (approved: boolean) => void) {
    super(app);
    this.pluginId = pluginId;
    this.reason = reason;
    this.onResolve = onResolve;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Authorization request');

    contentEl.createEl('p', {
      text: `The plugin "${this.pluginId}" is requesting access to Full Calendar.`
    });

    contentEl.createEl('p', {
      text: `Reason: ${this.reason}`,
      cls: 'ofc-auth-reason'
    });

    contentEl.createEl('p', {
      text: `If you approve, this plugin will be able to read your calendar events and perform actions on your behalf.`
    });

    const buttonContainer = contentEl.createEl('div', { cls: 'ofc-auth-buttons' });

    const denyBtn = buttonContainer.createEl('button', { text: 'Deny' });
    denyBtn.onclick = () => {
      this.onResolve(false);
      this.close();
    };

    const approveBtn = buttonContainer.createEl('button', { text: 'Approve', cls: 'mod-cta' });
    approveBtn.onclick = () => {
      this.onResolve(true);
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
