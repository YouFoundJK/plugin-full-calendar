/**
 * @file auth.test.ts
 * @brief Tests for Google OAuth authentication public API
 */

import { Platform, requestUrl, Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import * as auth from './auth';
import * as http from 'http';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    Platform: {
      isMobile: false,
      isDesktop: true
    },
    requestUrl: jest.fn(),
    Notice: jest.fn()
  }),
  { virtual: true }
);

// Mock Node.js modules
jest.mock('http', () => ({
  createServer: jest.fn()
}));

// Mock crypto API  
global.crypto = {
  subtle: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
  }
} as any;

// Mock window.crypto as well
global.window = {
  ...global.window,
  crypto: {
    subtle: {
      digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
  } as any,
  open: jest.fn()
} as any;

// Mock btoa
global.btoa = jest.fn().mockImplementation((str: string) => 
  Buffer.from(str, 'binary').toString('base64')
);

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;
const mockNotice = Notice as jest.MockedFunction<typeof Notice>;

describe('Google OAuth Authentication', () => {
  let mockPlugin: jest.Mocked<FullCalendarPlugin>;

  beforeEach(() => {
    // Create mock plugin
    mockPlugin = {
      app: {} as any,
      manifest: {} as any,
      settings: {
        googleAuth: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiryDate: Date.now() + 3600000 // 1 hour from now
        },
        useCustomGoogleClient: false,
        googleClientId: '',
        googleClientSecret: ''
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      saveData: jest.fn().mockResolvedValue(undefined),
      settingsTab: {
        display: jest.fn().mockResolvedValue(undefined)
      }
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('startGoogleLogin', () => {
    it('should start OAuth flow for desktop platform', async () => {
      (Platform as any).isMobile = false;

      const http = require('http');
      const mockServer = {
        listen: jest.fn((port, callback) => {
          // Simulate server starting and callback being called
          callback();
        }),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      await auth.startGoogleLogin(mockPlugin);

      expect(http.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(42813, expect.any(Function));
      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth')
      );
    });

    it('should start OAuth flow for mobile platform', async () => {
      (Platform as any).isMobile = true;

      await auth.startGoogleLogin(mockPlugin);

      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('redirect_uri=https%3A%2F%2Fyoufoundjk.github.io%2Fplugin-full-calendar%2Fgoogle-auth-callback.html')
      );
    });

    it('should show notice when custom client credentials are missing', async () => {
      mockPlugin.settings.useCustomGoogleClient = true;
      mockPlugin.settings.googleClientId = '';
      mockPlugin.settings.googleClientSecret = '';

      await auth.startGoogleLogin(mockPlugin);

      expect(mockNotice).toHaveBeenCalledWith(
        'Custom Google Client ID and Secret must be set in the plugin settings.'
      );
    });
  });

  describe('getGoogleAuthToken', () => {
    it('should return existing valid token', async () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiryDate: Date.now() + 3600000 // 1 hour from now
      };

      const token = await auth.getGoogleAuthToken(mockPlugin);

      expect(token).toBe('valid-token');
      expect(mockRequestUrl).not.toHaveBeenCalled(); // No refresh needed
    });

    it('should return null when no refresh token exists', async () => {
      mockPlugin.settings.googleAuth = null;

      const token = await auth.getGoogleAuthToken(mockPlugin);

      expect(token).toBeNull();
    });

    it('should refresh expired token', async () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiryDate: Date.now() - 1000 // Expired
      };

      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          access_token: 'new-access-token',
          expires_in: 3600
        }
      } as any);

      const token = await auth.getGoogleAuthToken(mockPlugin);

      expect(token).toBe('new-access-token');
      expect(mockRequestUrl).toHaveBeenCalled();
      expect(mockPlugin.saveData).toHaveBeenCalled();
    });

    it('should handle refresh token failure', async () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        expiryDate: Date.now() - 1000
      };

      mockRequestUrl.mockRejectedValue(new Error('Refresh failed'));

      const token = await auth.getGoogleAuthToken(mockPlugin);

      expect(token).toBeNull();
      expect(mockPlugin.settings.googleAuth).toBeNull();
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith(
        'Google authentication expired. Please reconnect your account.'
      );
    });
  });
});