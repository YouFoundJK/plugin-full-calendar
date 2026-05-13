import { App, normalizePath, requestUrl } from 'obsidian';
import baseEnPayload from './payloads/en.json';
import type { NLPPayload, NLPSupportedLanguage } from './types';

const SUPPORTED_LANGUAGES: NLPSupportedLanguage[] = ['en', 'de', 'fr', 'it', 'es'];

const inMemoryPayloadCache = new Map<NLPSupportedLanguage, NLPPayload>([
  ['en', baseEnPayload as NLPPayload]
]);

function getObsidianLanguage(_app: App): string {
  try {
    const language = window.localStorage.getItem('language');
    return typeof language === 'string' && language.length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

function isSupportedLanguage(value: string): value is NLPSupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as NLPSupportedLanguage);
}

function getPayloadCachePath(app: App, pluginId: string, language: NLPSupportedLanguage) {
  const payloadFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/nlp/locales`);
  const payloadFile = normalizePath(`${payloadFolder}/${language}.json`);
  return { payloadFolder, payloadFile };
}

export async function loadNLPPayload(app: App, pluginId: string): Promise<NLPPayload> {
  const detectedLanguage = getObsidianLanguage(app);
  const resolvedLanguage: NLPSupportedLanguage = isSupportedLanguage(detectedLanguage)
    ? detectedLanguage
    : 'en';

  const cachedInMemory = inMemoryPayloadCache.get(resolvedLanguage);
  if (cachedInMemory) {
    return cachedInMemory;
  }

  const { payloadFolder, payloadFile } = getPayloadCachePath(app, pluginId, resolvedLanguage);

  try {
    let payloadData = '';

    if (await app.vault.adapter.exists(payloadFile)) {
      payloadData = await app.vault.adapter.read(payloadFile);
    } else {
      const url = `https://raw.githubusercontent.com/obsidian-full-calendar-remastered/plugin-full-calendar/main/src/features/nlp/payloads/${resolvedLanguage}.json`;
      const response = await requestUrl(url);
      payloadData = response.text;

      if (!(await app.vault.adapter.exists(payloadFolder))) {
        await app.vault.adapter.mkdir(payloadFolder);
      }
      await app.vault.adapter.write(payloadFile, payloadData);
    }

    const parsedPayload = JSON.parse(payloadData) as NLPPayload;
    inMemoryPayloadCache.set(resolvedLanguage, parsedPayload);
    return parsedPayload;
  } catch {
    return baseEnPayload as NLPPayload;
  }
}

export function clearNLPPayloadCacheForTests() {
  inMemoryPayloadCache.clear();
  inMemoryPayloadCache.set('en', baseEnPayload as NLPPayload);
}
