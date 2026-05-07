import type { App } from 'obsidian';
import { processNaturalLanguage } from './engine';
import { loadNLPPayload } from './loader';
import type { NLPActionObject } from './types';

export async function parseNaturalLanguage(
  app: App,
  pluginId: string,
  rawInput: string,
  now: Date = new Date()
): Promise<NLPActionObject> {
  const payload = await loadNLPPayload(app, pluginId);
  return processNaturalLanguage(rawInput, payload, now);
}

export { processNaturalLanguage } from './engine';
export { loadNLPPayload } from './loader';
export { dispatchNLPAction } from './dispatcher';
export { registerNLPCommand } from './registerNLPCommand';
export type { NLPActionObject, NLPPayload, NLPRule, NLPIntent } from './types';
