/**
 * @file i18n.ts
 * @brief Internationalization (i18n) module for Full Calendar plugin.
 *
 * @description
 * This module provides internationalization support using i18next.
 * It detects the user's Obsidian language setting and loads the appropriate
 * translation resources. If a translation is missing, it gracefully falls back to English.
 *
 * @license See LICENSE.md
 */

import i18next from 'i18next';
import { App, requestUrl, normalizePath } from 'obsidian';

// Load English as default and fallback statically
import en from './locales/en.json';

/**
 * Type-safe translation resources container
 */
const resources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en }
};

/**
 * Available language codes
 */
const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'it', 'es'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Get the current Obsidian language setting
 * @param app Obsidian App instance
 * @returns The current language code
 */
function getObsidianLanguage(_app: App): string {
  // Obsidian stores the UI language in global localStorage under 'language'.
  // NOTE: app.loadLocalStorage() is plugin-scoped and prefixes keys with the plugin ID,
  // so it would look for 'full-calendar-remastered-language' which is NOT what we want.
  try {
    const language = window.localStorage.getItem('language');
    return typeof language === 'string' && language.length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Initialize the i18n system
 * @param app Obsidian App instance
 * @param pluginId The plugin's manifest ID (e.g. plugin.manifest.id)
 */
export async function initializeI18n(app: App, pluginId: string): Promise<void> {
  const detectedLanguage = getObsidianLanguage(app);
  let resolvedLanguage = 'en';

  if (SUPPORTED_LANGUAGES.includes(detectedLanguage as LanguageCode) && detectedLanguage !== 'en') {
    try {
      const localesFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/locales`);
      const localeFile = normalizePath(`${localesFolder}/${detectedLanguage}.json`);

      let localeDataStr = '';

      // Check if the localized translation is already present in the plugin directory
      if (await app.vault.adapter.exists(localeFile)) {
        localeDataStr = await app.vault.adapter.read(localeFile);
      } else {
        // If not found, download it once from the stable GitHub main branch
        const url = `https://raw.githubusercontent.com/YouFoundJK/plugin-full-calendar/main/src/features/i18n/locales/${detectedLanguage}.json`;
        const response = await requestUrl(url);
        localeDataStr = response.text;

        // Ensure locales directory exists before caching the downloaded file
        if (!(await app.vault.adapter.exists(localesFolder))) {
          await app.vault.adapter.mkdir(localesFolder);
        }
        await app.vault.adapter.write(localeFile, localeDataStr);
      }

      const parsedData = JSON.parse(localeDataStr) as Record<string, unknown>;
      resources[detectedLanguage] = { translation: parsedData };
      resolvedLanguage = detectedLanguage;
    } catch {
      // Fails gracefully back to 'en' if network is down and cache is empty
    }
  }

  await i18next.init({
    lng: resolvedLanguage,
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false // React already escapes values
    },
    // Return key if translation is missing
    returnNull: false,
    returnEmptyString: false
  });
}

/**
 * Get the i18next instance for translations
 * Use this in your components: i18n.t('key')
 */
export const i18n = i18next;

/**
 * Type-safe translation function
 * Usage: t('commands.newEvent')
 */
export const t = (key: string, options?: Record<string, string | number | null>): string => {
  return i18next.t(key, options);
};
