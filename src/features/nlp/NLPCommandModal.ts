/**
 * @file NLPCommandModal.ts
 * @brief The FCR Command modal — a universal orchestrator for Full Calendar Remastered.
 *
 * @description
 * This modal is the single point of orchestration for the entire plugin. Users
 * can create events, navigate views, open settings, sync data, and manage
 * caches — all via natural language. As the user types, the NLP engine processes
 * the input in real-time and displays a structured preview of the parsed result
 * so the user sees exactly what will happen before confirming.
 *
 * @license See LICENSE.md
 */

import { App, Modal } from 'obsidian';
import { processNaturalLanguage } from './engine';
import { dispatchNLPAction, hasExplicitTime, getWritableCalendarNames } from './dispatcher';
import { resolveSmartCalendar } from './smartCalendar';
import { loadNLPPayload } from './loader';
import type { NLPActionObject, NLPPayload } from './types';
import { t } from '../i18n/i18n';

const DEBOUNCE_MS = 120;

const INTENT_LABELS: Record<string, string> = {
  CREATE_EVENT: '📅 Create Event',
  NEW_EVENT: '📅 New Event (blank)',
  NAVIGATE_DAY: '🧭 Navigate → Day View',
  NAVIGATE_WEEK: '🧭 Navigate → Week View',
  NAVIGATE_MONTH: '🧭 Navigate → Month View',
  OPEN_CALENDAR: '📖 Open Calendar',
  OPEN_SIDEBAR: '📖 Open Sidebar',
  OPEN_SETTINGS: '⚙️ Open Settings',
  OPEN_CHRONO: '📊 Open Chrono Analyser',
  SHOW_CHANGELOG: '📋 Show Changelog',
  RESET_CACHE: '🗑️ Reset Event Cache',
  REVALIDATE_REMOTE: '🔄 Revalidate Remote Calendars',
  SYNC_ACTIVITYWATCH: '⏱️ Sync ActivityWatch',
  GOTO_DATE: '📆 Go to Date'
};

const INTENT_DESCRIPTIONS: Record<string, string> = {
  OPEN_SETTINGS: 'Opens the Full Calendar settings tab.',
  OPEN_CHRONO: 'Launches the Chrono Analyser dashboard.',
  SHOW_CHANGELOG: 'Displays the latest release notes.',
  RESET_CACHE: 'Clears and rebuilds the event cache.',
  REVALIDATE_REMOTE: 'Forces a fresh sync of all remote calendars.',
  SYNC_ACTIVITYWATCH: 'Pulls latest data from ActivityWatch.'
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(iso: string): string {
  try {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return iso;
  }
}

function formatTime(hours: number, minutes: number): string {
  const h = hours % 12 || 12;
  const m = pad(minutes);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${meridiem}`;
}

export class NLPCommandModal extends Modal {
  #pluginId: string;
  #payload: NLPPayload | null = null;
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #previewContainer!: HTMLElement;
  #inputEl!: HTMLInputElement;
  #submitBtn!: HTMLButtonElement;
  #lastAction: NLPActionObject | null = null;

  constructor(app: App, pluginId: string) {
    super(app);
    this.#pluginId = pluginId;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;

    titleEl.setText(t('nlp.modalTitle'));
    contentEl.addClass('ofc-nlp-modal');

    // Load the NLP payload once on open
    void (async () => {
      this.#payload = await loadNLPPayload(this.app, this.#pluginId);
    })();

    // Input container
    const inputContainer = contentEl.createDiv({ cls: 'ofc-nlp-input-container' });
    this.#inputEl = inputContainer.createEl('input', {
      attr: { type: 'text', placeholder: t('nlp.placeholder') },
      cls: 'ofc-nlp-input'
    });
    this.#inputEl.focus();

    // Live preview area
    this.#previewContainer = contentEl.createDiv({ cls: 'ofc-nlp-preview' });
    this.#renderEmptyPreview();

    // Button bar
    const buttonBar = contentEl.createDiv({ cls: 'ofc-nlp-buttons' });

    const cancelBtn = buttonBar.createEl('button', {
      text: t('nlp.cancel'),
      cls: 'ofc-nlp-btn-cancel'
    });
    cancelBtn.addEventListener('click', () => this.close());

    this.#submitBtn = buttonBar.createEl('button', {
      text: t('nlp.submit'),
      cls: 'mod-cta ofc-nlp-btn-submit'
    });
    this.#submitBtn.disabled = true;
    this.#submitBtn.addEventListener('click', () => this.#handleSubmit());

    // Wire up live preview on input
    this.#inputEl.addEventListener('input', () => this.#schedulePreview());
    this.#inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !this.#submitBtn.disabled) {
        e.preventDefault();
        this.#handleSubmit();
      }
    });
  }

  onClose(): void {
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
    }
    this.contentEl.empty();
  }

  #schedulePreview(): void {
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
    }
    this.#debounceTimer = setTimeout(() => this.#updatePreview(), DEBOUNCE_MS);
  }

  #updatePreview(): void {
    const rawInput = this.#inputEl.value.trim();

    if (!rawInput || !this.#payload) {
      this.#lastAction = null;
      this.#submitBtn.disabled = true;
      this.#renderEmptyPreview();
      return;
    }

    let action = processNaturalLanguage(rawInput, this.#payload);

    // Apply smart calendar resolution for the live preview
    if (action.intent === 'CREATE_EVENT') {
      action = resolveSmartCalendar(action, getWritableCalendarNames());
    }

    this.#lastAction = action;
    this.#submitBtn.disabled = false;
    this.#renderPreview(action);
  }

  #renderEmptyPreview(): void {
    this.#previewContainer.empty();
    this.#previewContainer.createDiv({
      cls: 'ofc-nlp-preview-empty',
      text: t('nlp.previewHint')
    });
  }

  #renderPreview(action: NLPActionObject): void {
    this.#previewContainer.empty();

    const card = this.#previewContainer.createDiv({ cls: 'ofc-nlp-preview-card' });

    // Intent badge
    const intentLabel = INTENT_LABELS[action.intent] ?? action.intent;
    card.createDiv({ cls: 'ofc-nlp-preview-intent', text: intentLabel });

    // Description for non-event intents
    const description = INTENT_DESCRIPTIONS[action.intent];
    if (description) {
      card.createDiv({ cls: 'ofc-nlp-preview-description', text: description });
    }

    if (action.intent === 'CREATE_EVENT') {
      this.#renderEventPreview(card, action);
    } else if (action.intent === 'GOTO_DATE') {
      // Show the computed target date
      const dateRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      dateRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Target' });
      dateRow.createSpan({ cls: 'ofc-nlp-preview-value', text: formatDate(action.date) });
    }

    // Matched rules indicator (compact)
    if (action.matchedRules.length > 0) {
      const rulesRow = card.createDiv({ cls: 'ofc-nlp-preview-rules' });
      rulesRow.createSpan({
        text: `✓ ${action.matchedRules.length} pattern${action.matchedRules.length > 1 ? 's' : ''} matched`
      });
    }
  }

  #renderEventPreview(card: HTMLElement, action: NLPActionObject): void {
    // Title
    if (action.title) {
      const titleRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      titleRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Title' });
      titleRow.createSpan({
        cls: 'ofc-nlp-preview-value ofc-nlp-preview-title',
        text: action.title
      });
    }

    // Date
    const dateRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
    dateRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Date' });
    dateRow.createSpan({ cls: 'ofc-nlp-preview-value', text: formatDate(action.date) });

    // Time (only if explicit)
    if (hasExplicitTime(action)) {
      const timeRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      timeRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Time' });
      const endHour = (action.hours + 1) % 24;
      timeRow.createSpan({
        cls: 'ofc-nlp-preview-value',
        text: `${formatTime(action.hours, action.minutes)} → ${formatTime(endHour, action.minutes)}`
      });
    } else {
      const timeRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      timeRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Time' });
      timeRow.createSpan({ cls: 'ofc-nlp-preview-value ofc-nlp-preview-allday', text: 'All day' });
    }

    // Target calendar
    if (action.targetCalendar) {
      const calRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      calRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Calendar' });
      calRow.createSpan({ cls: 'ofc-nlp-preview-value', text: action.targetCalendar });
    }

    // Recurrence
    if (action.recurrence) {
      const recurRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      recurRow.createSpan({ cls: 'ofc-nlp-preview-label', text: 'Recurrence' });
      let recurText = action.recurrence.freq.toLowerCase();
      if (action.recurrence.interval > 1) {
        recurText = `every ${action.recurrence.interval} ${recurText}`;
      }
      if (action.recurrence.byDay) {
        recurText += ` (${action.recurrence.byDay.join(', ')})`;
      }
      recurRow.createSpan({ cls: 'ofc-nlp-preview-value', text: recurText });
    }
  }

  #handleSubmit(): void {
    if (!this.#lastAction) {
      return;
    }
    const action = this.#lastAction;
    this.close();
    void dispatchNLPAction(action);
  }
}
