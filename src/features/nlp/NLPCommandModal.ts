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

/**
 * Returns the localized label for a given intent.
 * Using literal strings here ensures the i18n pruning tool can track usage.
 */
function getIntentLabel(intent: string): string {
  switch (intent) {
    case 'CREATE_EVENT':
      return t('nlp.intents.CREATE_EVENT');
    case 'NEW_EVENT':
      return t('nlp.intents.NEW_EVENT');
    case 'NAVIGATE_DAY':
      return t('nlp.intents.NAVIGATE_DAY');
    case 'NAVIGATE_WEEK':
      return t('nlp.intents.NAVIGATE_WEEK');
    case 'NAVIGATE_MONTH':
      return t('nlp.intents.NAVIGATE_MONTH');
    case 'OPEN_CALENDAR':
      return t('nlp.intents.OPEN_CALENDAR');
    case 'OPEN_SIDEBAR':
      return t('nlp.intents.OPEN_SIDEBAR');
    case 'OPEN_SETTINGS':
      return t('nlp.intents.OPEN_SETTINGS');
    case 'OPEN_CHRONO':
      return t('nlp.intents.OPEN_CHRONO');
    case 'SHOW_CHANGELOG':
      return t('nlp.intents.SHOW_CHANGELOG');
    case 'RESET_CACHE':
      return t('nlp.intents.RESET_CACHE');
    case 'REVALIDATE_REMOTE':
      return t('nlp.intents.REVALIDATE_REMOTE');
    case 'SYNC_ACTIVITYWATCH':
      return t('nlp.intents.SYNC_ACTIVITYWATCH');
    case 'GOTO_DATE':
      return t('nlp.intents.GOTO_DATE');
    default:
      return intent;
  }
}

/**
 * Returns the localized description for a given intent.
 * Using literal strings here ensures the i18n pruning tool can track usage.
 */
function getIntentDescription(intent: string): string | null {
  switch (intent) {
    case 'OPEN_SETTINGS':
      return t('nlp.descriptions.OPEN_SETTINGS');
    case 'OPEN_CHRONO':
      return t('nlp.descriptions.OPEN_CHRONO');
    case 'SHOW_CHANGELOG':
      return t('nlp.descriptions.SHOW_CHANGELOG');
    case 'RESET_CACHE':
      return t('nlp.descriptions.RESET_CACHE');
    case 'REVALIDATE_REMOTE':
      return t('nlp.descriptions.REVALIDATE_REMOTE');
    case 'SYNC_ACTIVITYWATCH':
      return t('nlp.descriptions.SYNC_ACTIVITYWATCH');
    default:
      return null;
  }
}

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
    const intentLabel = getIntentLabel(action.intent);
    card.createDiv({ cls: 'ofc-nlp-preview-intent', text: intentLabel });

    // Description for non-event intents
    const description = getIntentDescription(action.intent);
    if (description) {
      card.createDiv({ cls: 'ofc-nlp-preview-description', text: description });
    }

    if (action.intent === 'CREATE_EVENT') {
      this.#renderEventPreview(card, action);
    } else if (action.intent === 'GOTO_DATE') {
      // Show the computed target date
      const dateRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      dateRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.target') });
      dateRow.createSpan({ cls: 'ofc-nlp-preview-value', text: formatDate(action.date) });
    }

    // Matched rules indicator (compact)
    if (action.matchedRules.length > 0) {
      const rulesRow = card.createDiv({ cls: 'ofc-nlp-preview-rules' });
      rulesRow.createSpan({
        text: t('nlp.preview.patternsMatched', { count: action.matchedRules.length })
      });
    }
  }

  #renderEventPreview(card: HTMLElement, action: NLPActionObject): void {
    // Title
    if (action.title) {
      const titleRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      titleRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.title') });
      titleRow.createSpan({
        cls: 'ofc-nlp-preview-value ofc-nlp-preview-title',
        text: action.title
      });
    }

    // Date
    const dateRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
    dateRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.date') });
    dateRow.createSpan({ cls: 'ofc-nlp-preview-value', text: formatDate(action.date) });

    // Time (only if explicit)
    if (hasExplicitTime(action)) {
      const timeRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      timeRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.time') });
      const endHour = action.endHours !== null ? action.endHours : (action.hours + 1) % 24;
      const endMinute = action.endMinutes !== null ? action.endMinutes : action.minutes;
      timeRow.createSpan({
        cls: 'ofc-nlp-preview-value',
        text: `${formatTime(action.hours, action.minutes)} → ${formatTime(endHour, endMinute)}`
      });
    } else {
      const timeRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      timeRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.time') });
      timeRow.createSpan({
        cls: 'ofc-nlp-preview-value ofc-nlp-preview-allday',
        text: t('nlp.preview.allDay')
      });
    }

    // Target calendar
    if (action.targetCalendar) {
      const calRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      calRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.calendar') });
      calRow.createSpan({ cls: 'ofc-nlp-preview-value', text: action.targetCalendar });
    }

    // Recurrence
    if (action.recurrence) {
      const recurRow = card.createDiv({ cls: 'ofc-nlp-preview-row' });
      recurRow.createSpan({ cls: 'ofc-nlp-preview-label', text: t('nlp.preview.recurrence') });
      let recurText = action.recurrence.freq.toLowerCase();
      if (action.recurrence.interval > 1) {
        recurText = `${t('nlp.preview.every')} ${action.recurrence.interval} ${recurText}`;
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
