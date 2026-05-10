/**
 * @file registerNLPCommand.ts
 * @brief Registers the NLP Quick Add command in the Obsidian command palette.
 *
 * @description
 * Single-responsibility module that registers one command palette entry for
 * the NLP Quick Add modal. This is called from main.ts during plugin load.
 *
 * @license See LICENSE.md
 */

import { NLPCommandModal } from './NLPCommandModal';
import { t } from '../i18n/i18n';
import type FullCalendarPlugin from '../../main';

export function openNLPCommandModal(plugin: FullCalendarPlugin): void {
  new NLPCommandModal(plugin.app, plugin.manifest.id).open();
}

export function registerNLPCommand(plugin: FullCalendarPlugin): void {
  plugin.addCommand({
    id: 'full-calendar-nlp-quick-add',
    name: t('commands.nlpQuickAdd'),
    callback: () => {
      openNLPCommandModal(plugin);
    }
  });
}
