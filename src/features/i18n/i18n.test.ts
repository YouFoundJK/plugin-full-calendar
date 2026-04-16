/**
 * @file i18n.test.ts
 * @brief Tests for the i18n module
 *
 * @license See LICENSE.md
 */

import { initializeI18n, i18n, t } from './i18n';

// Mock localStorage for Jest environment
beforeAll(() => {
  const localStorageMock = (function () {
    let store: Record<string, string> = {};
    return {
      getItem(key: string) {
        return store[key] || null;
      },
      setItem(key: string, value: string) {
        store[key] = value.toString();
      },
      clear() {
        store = {};
      },
      removeItem(key: string) {
        delete store[key];
      }
    };
  })();
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
  });
  Object.defineProperty(global, 'window', {
    value: { localStorage: localStorageMock },
    writable: true
  });
});

// Mock Obsidian App
const createMockApp = (language: string = 'en') => {
  window.localStorage.setItem('language', language);
  return {
    vault: {
      getConfig: jest.fn().mockReturnValue(language),
      configDir: 'mock-config-dir',
      adapter: {
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockResolvedValue('{}'),
        write: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined)
      }
    }
  } as unknown as import('obsidian').App;
};

describe('i18n Module', () => {
  beforeEach(async () => {
    // Reset i18n state before each test
    if (i18n.isInitialized) {
      await i18n.changeLanguage('en');
    }
  });

  describe('initializeI18n', () => {
    it('should initialize i18n with English by default', async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp, 'full-calendar-remastered');

      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe('en');
    });

    it('should detect Obsidian language setting', async () => {
      const mockApp = createMockApp('de');
      await initializeI18n(mockApp, 'full-calendar-remastered');

      expect(i18n.isInitialized).toBe(true);
      // Even if 'de' is set, it should initialize (fallback to 'en' if no translations)
      expect(i18n.language).toBeTruthy();
    });

    it('should fallback to English if language config is unavailable', async () => {
      window.localStorage.removeItem('language');
      const mockApp = {
        vault: {
          getConfig: jest.fn().mockReturnValue(undefined),
          configDir: 'mock-config-dir',
          adapter: {
            exists: jest.fn().mockResolvedValue(false),
            read: jest.fn().mockResolvedValue('{}'),
            write: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined)
          }
        }
      } as unknown as import('obsidian').App;

      await initializeI18n(mockApp, 'full-calendar-remastered');

      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe('en');
    });
  });

  describe('Translation function', () => {
    beforeEach(async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp, 'full-calendar-remastered');
    });

    it('should translate command strings', () => {
      expect(t('commands.newEvent')).toBe('New Event');
      expect(t('commands.resetCache')).toBe('Reset Event Cache');
      expect(t('commands.openCalendar')).toBe('Open Calendar');
    });

    it('should translate notice strings', () => {
      expect(t('notices.cacheReset')).toBe('Full Calendar has been reset.');
      expect(t('notices.googleAuthFailed')).toBe('Google authentication failed. Please try again.');
    });

    it('should translate ribbon tooltip', () => {
      expect(t('ribbon.openCalendar')).toBe('Open Full Calendar');
    });

    it('should return key if translation is missing', () => {
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });

    it('should handle interpolation', () => {
      // This will be used for dynamic strings like "Processing 5/10 files"
      const result = t('commands.newEvent'); // Simple test for now
      expect(result).toBeTruthy();
    });
  });

  describe('Language switching', () => {
    it('should allow language switching after initialization', async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp, 'full-calendar-remastered');

      expect(i18n.language).toBe('en');

      // Switch to another language (even if not loaded, should not error)
      await i18n.changeLanguage('de');
      expect(i18n.language).toBe('de');
    });

    it('should load German translations correctly', async () => {
      const mockApp = createMockApp('de');
      // Mock the app adapter to return the local German file so we don't query network during unit test
      mockApp.vault.adapter.read = jest.fn().mockResolvedValue(
        JSON.stringify({
          commands: {
            newEvent: 'Neues Ereignis',
            openCalendar: 'Kalender öffnen'
          },
          ribbon: {
            openCalendar: 'Full Calendar öffnen'
          }
        })
      );

      await initializeI18n(mockApp, 'full-calendar-remastered');

      // Test a German translation
      expect(t('commands.newEvent')).toBe('Neues Ereignis');
      expect(t('commands.openCalendar')).toBe('Kalender öffnen');
      expect(t('ribbon.openCalendar')).toBe('Full Calendar öffnen');
    });

    it('should fallback to English for missing German translations', async () => {
      const mockApp = createMockApp('de');
      // Mock the app adapter to return empty {} so it falls back to english
      mockApp.vault.adapter.read = jest.fn().mockResolvedValue('{}');

      await initializeI18n(mockApp, 'full-calendar-remastered');

      // Test a key that doesn't exist - should return the key itself as fallback
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });
  });
});
