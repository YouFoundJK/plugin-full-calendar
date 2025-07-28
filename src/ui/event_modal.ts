/**
 * @file event_modal.ts
 * @brief Provides functions to launch React-based modals for creating and editing events.
 *
 * @description
 * This file serves as the bridge between Obsidian's imperative UI system and
 * the declarative React world. The `launchCreateModal` and `launchEditModal`
 * functions are responsible for creating a `ReactModal` instance and mounting
 * the `EditEvent` React component within it, passing all necessary props and
 * callbacks for event submission and deletion.
 *
 * @see ReactModal.ts
 * @see components/EditEvent.tsx
 *
 * @exports launchCreateModal
 * @exports launchEditModal
 *
 * @license See LICENSE.md
 */

import { Notice, Modal, App, Setting, ButtonComponent } from 'obsidian';
import * as React from 'react';
import { EditableCalendar } from '../calendars/EditableCalendar';
import FullCalendarPlugin from '../main';
import { OFCEvent } from '../types';
import { openFileForEvent } from './actions';
import { EditEvent } from './components/EditEvent';
import ReactModal from './ReactModal';

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private bodyText: string,
    private onConfirm: () => void
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.titleText });
    contentEl.createEl('p', { text: this.bodyText });

    new Setting(contentEl)
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('Yes, open parent')
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          })
      )
      .addButton((btn: ButtonComponent) => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class DeleteRecurringModal extends Modal {
  constructor(
    app: App,
    private onPromote: () => void,
    private onDeleteAll: () => void
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Delete Recurring Event' });
    contentEl.createEl('p', {
      text: 'This is a recurring event. What would you like to do with all of its future "override" instances (i.e., events that you have dragged or modified)?'
    });

    new Setting(contentEl)
      .setName('Promote child events')
      .setDesc(
        'Turn all future override events into standalone, single events. They will no longer be linked to this recurring series.'
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('Promote Children')
          .setCta()
          .onClick(() => {
            this.close();
            this.onPromote();
          })
      );

    new Setting(contentEl)
      .setName('Delete child events')
      .setDesc(
        'Delete all future override events associated with this recurring series. This cannot be undone.'
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('Delete Everything')
          .setWarning()
          .onClick(() => {
            this.close();
            this.onDeleteAll();
          })
      );

    new Setting(contentEl).addButton((btn: ButtonComponent) =>
      btn.setButtonText('Cancel').onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function launchCreateModal(plugin: FullCalendarPlugin, partialEvent: Partial<OFCEvent>) {
  const calendars = [...plugin.cache.calendars.entries()]
    .filter(([_, cal]) => cal instanceof EditableCalendar)
    .map(([id, cal]) => {
      return {
        id,
        type: cal.type,
        name: cal.name
      };
    });

  // MODIFICATION: Get available categories
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, async closeModal =>
    React.createElement(EditEvent, {
      initialEvent: partialEvent,
      calendars,
      defaultCalendarIndex: 0,
      availableCategories,
      enableCategory: plugin.settings.enableCategoryColoring,
      submit: async (data, calendarIndex) => {
        const calendarId = calendars[calendarIndex].id;
        try {
          // Note: The data source layer is now responsible for constructing the full title.
          // The `data` object here has a clean title and category.
          await plugin.cache.addEvent(calendarId, data);
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when creating event: ' + e.message);
            console.error(e);
          }
        }
        closeModal();
      }
    })
  ).open();
}

export function launchEditModal(plugin: FullCalendarPlugin, eventId: string) {
  const eventToEdit = plugin.cache.getEventById(eventId);
  if (!eventToEdit) {
    throw new Error("Cannot edit event that doesn't exist.");
  }
  const calId = plugin.cache.getInfoForEditableEvent(eventId).calendar.id;

  const calendars = [...plugin.cache.calendars.entries()]
    .filter(([_, cal]) => cal instanceof EditableCalendar)
    .map(([id, cal]) => {
      return {
        id,
        type: cal.type,
        name: cal.name
      };
    });

  const calIdx = calendars.findIndex(({ id }) => id === calId);
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, async closeModal => {
    const onAttemptEditInherited = () => {
      new ConfirmModal(
        plugin.app,
        'Edit Parent Event?',
        'This property is inherited from the parent recurring event. Would you like to open the parent to make changes?',
        async () => {
          if (eventToEdit.type === 'single' && eventToEdit.recurringEventId) {
            const parentLocalId = eventToEdit.recurringEventId;
            const parentGlobalId = `${calId}::${parentLocalId}`;
            const parentSessionId = await plugin.cache.getSessionId(parentGlobalId);
            if (parentSessionId) {
              closeModal();
              launchEditModal(plugin, parentSessionId);
            } else {
              new Notice('Could not find the parent recurring event.');
            }
          }
        }
      ).open();
    };

    return React.createElement(EditEvent, {
      initialEvent: eventToEdit,
      calendars,
      defaultCalendarIndex: calIdx, // <-- RESTORED THIS PROP
      availableCategories,
      enableCategory: plugin.settings.enableCategoryColoring,
      submit: async (data, calendarIndex) => {
        try {
          if (calendarIndex !== calIdx) {
            await plugin.cache.moveEventToCalendar(eventId, calendars[calendarIndex].id);
          }
          await plugin.cache.updateEventWithId(eventId, data);
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when updating event: ' + e.message);
            console.error(e);
          }
        }
        closeModal();
      },
      open: async () => {
        openFileForEvent(plugin.cache, plugin.app, eventId);
        closeModal();
      },
      deleteEvent: async () => {
        try {
          // This call now triggers the modal logic if needed.
          await plugin.cache.deleteEvent(eventId);
          // If the event was a recurring master with children, a modal will
          // open and this closeModal() might happen before the user chooses.
          // This is acceptable behavior.
          closeModal();
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when deleting event: ' + e.message);
            console.error(e);
          }
        }
      },
      onAttemptEditInherited // Pass the new handler as a prop
    });
  }).open();
}
