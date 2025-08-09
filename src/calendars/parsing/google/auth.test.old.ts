/**
 * @file auth.test.ts
 * @brief Tests for Google OAuth authentication public API
 */

import { Platform, requestUrl, Notice } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import * as auth from './auth';
import * as http from 'http';
import * as url from 'url';

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

jest.mock('url', () => ({
  parse: jest.fn()
}));

// Mock crypto API  
global.crypto = {
  subtle: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
  }
} as any;

// Mock btoa
global.btoa = jest.fn().mockImplementation((str: string) => 
  Buffer.from(str, 'binary').toString('base64')
);

// Mock window.open
global.window = {
  ...global.window,
  open: jest.fn()
} as any;

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
        listen: jest.fn(),
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
        expect.stringContaining('redirect_uri=https%3A//youfoundjk.github.io')
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

    it('should work with custom client credentials when provided', async () => {
      mockPlugin.settings.useCustomGoogleClient = true;
      mockPlugin.settings.googleClientId = 'custom-client-id';
      mockPlugin.settings.googleClientSecret = 'custom-client-secret';
      (Platform as any).isMobile = false;

      const http = require('http');
      const mockServer = {
        listen: jest.fn(),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      await auth.startGoogleLogin(mockPlugin);

      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('client_id=custom-client-id')
      );
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should handle successful token exchange with public client', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600
        }
      } as any);

      // Mock PKCE state (this would normally be set by startGoogleLogin)
      await auth.startGoogleLogin(mockPlugin);
      
      await auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin);

      expect(mockPlugin.saveSettings).toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith('Successfully connected Google Account!');
    });

    it('should handle successful token exchange with custom client', async () => {
      mockPlugin.settings.useCustomGoogleClient = true;
      mockPlugin.settings.googleClientId = 'custom-client-id';
      mockPlugin.settings.googleClientSecret = 'custom-client-secret';

      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600
        }
      } as any);

      await auth.startGoogleLogin(mockPlugin);
      await auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin);

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://oauth2.googleapis.com/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 400,
        text: 'Invalid request'
      } as any);

      await auth.startGoogleLogin(mockPlugin);
      await auth.exchangeCodeForToken('invalid-code', 'test-state', mockPlugin);

      expect(mockNotice).toHaveBeenCalledWith(
        'Failed to connect Google Account. Check the developer console for details.'
      );
    });

    it('should handle missing refresh token', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          access_token: 'new-access-token',
          expires_in: 3600
          // Missing refresh_token
        }
      } as any);

      await auth.startGoogleLogin(mockPlugin);
      await auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin);

      expect(mockNotice).toHaveBeenCalledWith(
        'Failed to connect Google Account. Check the developer console for details.'
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

    it('should return null when no refresh token exists', async () => {
      mockPlugin.settings.googleAuth = null;

      const token = await auth.getGoogleAuthToken(mockPlugin);

      expect(token).toBeNull();
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
          expiresAt: Date.now() + 3600000, // 1 hour from now
          tokenType: 'Bearer'
        }
      },
      saveSettings: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('initiateGoogleLogin', () => {
    it('should generate auth URL for desktop platform', async () => {
      (Platform as any).isMobile = false;
      (Platform as any).isDesktop = true;

      const http = require('http');
      const mockServer = {
        listen: jest.fn(),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      await auth.initiateGoogleLogin(mockPlugin);

      expect(http.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(42813, '127.0.0.1');
      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth')
      );
    });

    it('should generate auth URL for mobile platform', async () => {
      (Platform as any).isMobile = true;
      (Platform as any).isDesktop = false;

      await auth.initiateGoogleLogin(mockPlugin);

      expect(global.window.open).toHaveBeenCalledWith(
        expect.stringContaining('redirect_uri=https%3A//youfoundjk.github.io')
      );
    });

    it('should include correct OAuth parameters in auth URL', async () => {
      (Platform as any).isMobile = false;

      const http = require('http');
      const mockServer = {
        listen: jest.fn(),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      await auth.initiateGoogleLogin(mockPlugin);

      const authUrl = (global.window.open as jest.Mock).mock.calls[0][0];
      const url = new URL(authUrl);

      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('272284435724-ltjbog78np5lnbjhgecudaqhsfba9voi.apps.googleusercontent.com');
      expect(url.searchParams.get('scope')).toContain('calendar.readonly');
      expect(url.searchParams.get('scope')).toContain('calendar.events');
      expect(url.searchParams.has('code_challenge')).toBe(true);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.has('state')).toBe(true);
    });

    it('should handle PKCE generation correctly', async () => {
      (Platform as any).isMobile = false;

      const http = require('http');
      const mockServer = {
        listen: jest.fn(),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      await auth.initiateGoogleLogin(mockPlugin);

      expect(global.crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));
      expect(global.btoa).toHaveBeenCalled();

      const authUrl = (global.window.open as jest.Mock).mock.calls[0][0];
      const url = new URL(authUrl);
      const codeChallenge = url.searchParams.get('code_challenge');

      // Code challenge should be base64url encoded (no padding)
      expect(codeChallenge).not.toContain('=');
      expect(codeChallenge).not.toContain('+');
      expect(codeChallenge).not.toContain('/');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for tokens on desktop', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockRequestUrl.mockResolvedValue({
        json: mockTokenResponse
      } as any);

      // Set up PKCE state (normally set by initiateGoogleLogin)
      (auth as any).pkce = {
        verifier: 'test-verifier',
        state: 'test-state'
      };

      await auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin);

      expect(mockRequestUrl).toHaveBeenCalledWith({
        url: expect.stringContaining('gcal-proxy-server.vercel.app'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code',
          code_verifier: 'test-verifier',
          redirect_uri: 'http://127.0.0.1:42813/callback'
        })
      });

      expect(mockPlugin.settings.googleAuth).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: expect.any(Number),
        tokenType: 'Bearer'
      });

      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should exchange authorization code for tokens on mobile', async () => {
      (Platform as any).isMobile = true;

      const mockTokenResponse = {
        access_token: 'mobile-access-token',
        refresh_token: 'mobile-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockRequestUrl.mockResolvedValue({
        json: mockTokenResponse
      } as any);

      (auth as any).pkce = {
        verifier: 'mobile-verifier',
        state: 'mobile-state'
      };

      await auth.exchangeCodeForToken('mobile-code', 'mobile-state', mockPlugin);

      expect(mockRequestUrl).toHaveBeenCalledWith({
        url: expect.stringContaining('gcal-proxy-server.vercel.app'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'mobile-code',
          code_verifier: 'mobile-verifier',
          redirect_uri: 'https://youfoundjk.github.io/plugin-full-calendar/google-auth-callback.html'
        })
      });

      expect(mockPlugin.settings.googleAuth.accessToken).toBe('mobile-access-token');
    });

    it('should handle state mismatch error', async () => {
      (auth as any).pkce = {
        verifier: 'test-verifier',
        state: 'expected-state'
      };

      await expect(
        auth.exchangeCodeForToken('auth-code', 'wrong-state', mockPlugin)
      ).rejects.toThrow('Invalid state parameter');

      expect(mockRequestUrl).not.toHaveBeenCalled();
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should handle missing PKCE state error', async () => {
      (auth as any).pkce = null;

      await expect(
        auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin)
      ).rejects.toThrow('No PKCE state found');

      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    it('should handle token exchange failure', async () => {
      mockRequestUrl.mockRejectedValue(new Error('Network error'));

      (auth as any).pkce = {
        verifier: 'test-verifier',
        state: 'test-state'
      };

      await expect(
        auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin)
      ).rejects.toThrow('Network error');

      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should calculate correct expiration time', async () => {
      const mockTokenResponse = {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_in: 7200, // 2 hours
        token_type: 'Bearer'
      };

      mockRequestUrl.mockResolvedValue({
        json: mockTokenResponse
      } as any);

      (auth as any).pkce = {
        verifier: 'test-verifier',
        state: 'test-state'
      };

      const beforeTime = Date.now();
      await auth.exchangeCodeForToken('auth-code', 'test-state', mockPlugin);
      const afterTime = Date.now();

      const expectedMinExpiry = beforeTime + (7200 * 1000) - 60000; // 1 minute buffer
      const expectedMaxExpiry = afterTime + (7200 * 1000) + 60000;

      expect(mockPlugin.settings.googleAuth.expiresAt).toBeGreaterThan(expectedMinExpiry);
      expect(mockPlugin.settings.googleAuth.expiresAt).toBeLessThan(expectedMaxExpiry);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token when expired', async () => {
      // Set expired token
      mockPlugin.settings.googleAuth.expiresAt = Date.now() - 1000;

      const mockRefreshResponse = {
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockRequestUrl.mockResolvedValue({
        json: mockRefreshResponse
      } as any);

      const newToken = await auth.refreshAccessToken(mockPlugin);

      expect(mockRequestUrl).toHaveBeenCalledWith({
        url: expect.stringContaining('gcal-proxy-server.vercel.app/api/google/refresh'),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: 'test-refresh-token'
        })
      });

      expect(newToken).toBe('refreshed-access-token');
      expect(mockPlugin.settings.googleAuth.accessToken).toBe('refreshed-access-token');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should return existing token when not expired', async () => {
      // Set non-expired token
      mockPlugin.settings.googleAuth.expiresAt = Date.now() + 3600000;

      const token = await auth.refreshAccessToken(mockPlugin);

      expect(token).toBe('test-access-token');
      expect(mockRequestUrl).not.toHaveBeenCalled();
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should handle refresh token failure', async () => {
      mockPlugin.settings.googleAuth.expiresAt = Date.now() - 1000;
      mockRequestUrl.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(auth.refreshAccessToken(mockPlugin)).rejects.toThrow('Invalid refresh token');
    });

    it('should handle missing refresh token', async () => {
      mockPlugin.settings.googleAuth.refreshToken = undefined;

      await expect(auth.refreshAccessToken(mockPlugin)).rejects.toThrow();
    });

    it('should handle refresh response without access token', async () => {
      mockPlugin.settings.googleAuth.expiresAt = Date.now() - 1000;

      mockRequestUrl.mockResolvedValue({
        json: { error: 'invalid_grant' }
      } as any);

      await expect(auth.refreshAccessToken(mockPlugin)).rejects.toThrow();
    });
  });

  describe('hasValidGoogleAuth', () => {
    it('should return true for valid, non-expired auth', () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'valid-token',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };

      const isValid = auth.hasValidGoogleAuth(mockPlugin);

      expect(isValid).toBe(true);
    });

    it('should return false for expired auth', () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer'
      };

      const isValid = auth.hasValidGoogleAuth(mockPlugin);

      expect(isValid).toBe(false);
    });

    it('should return false for missing access token', () => {
      mockPlugin.settings.googleAuth = {
        accessToken: undefined,
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };

      const isValid = auth.hasValidGoogleAuth(mockPlugin);

      expect(isValid).toBe(false);
    });

    it('should return false for missing refresh token', () => {
      mockPlugin.settings.googleAuth = {
        accessToken: 'valid-token',
        refreshToken: undefined,
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };

      const isValid = auth.hasValidGoogleAuth(mockPlugin);

      expect(isValid).toBe(false);
    });

    it('should return false for undefined auth object', () => {
      mockPlugin.settings.googleAuth = undefined;

      const isValid = auth.hasValidGoogleAuth(mockPlugin);

      expect(isValid).toBe(false);
    });
  });

  describe('clearGoogleAuth', () => {
    it('should clear all authentication data', async () => {
      await auth.clearGoogleAuth(mockPlugin);

      expect(mockPlugin.settings.googleAuth).toEqual({
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
        tokenType: undefined
      });

      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('helper functions', () => {
    describe('generateRandomString', () => {
      it('should generate string of correct length', () => {
        const result = (auth as any).generateRandomString(128);
        expect(result).toHaveLength(128);
      });

      it('should use only allowed characters for PKCE', () => {
        const result = (auth as any).generateRandomString(128);
        const allowedChars = /^[A-Za-z0-9\-._~]+$/;
        expect(result).toMatch(allowedChars);
      });

      it('should generate different strings on successive calls', () => {
        const result1 = (auth as any).generateRandomString(128);
        const result2 = (auth as any).generateRandomString(128);
        expect(result1).not.toBe(result2);
      });
    });

    describe('sha256', () => {
      it('should call crypto.subtle.digest with correct parameters', async () => {
        const input = 'test-string';
        await (auth as any).sha256(input);

        expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
          'SHA-256',
          expect.any(Uint8Array)
        );
      });
    });

    describe('base64urlencode', () => {
      it('should encode ArrayBuffer to base64url', () => {
        const mockArrayBuffer = new ArrayBuffer(8);
        global.btoa.mockReturnValue('dGVzdCsv=');

        const result = (auth as any).base64urlencode(mockArrayBuffer);

        expect(result).toBe('dGVzdC-_'); // + replaced with -, / with _, padding removed
      });

      it('should remove padding from base64 output', () => {
        global.btoa.mockReturnValue('dGVzdA==');

        const result = (auth as any).base64urlencode(new ArrayBuffer(8));

        expect(result).toBe('dGVzdA'); // Padding removed
      });
    });

    describe('generateCodeChallenge', () => {
      it('should generate code challenge from verifier', async () => {
        global.crypto.subtle.digest.mockResolvedValue(new ArrayBuffer(32));
        global.btoa.mockReturnValue('Y2hhbGxlbmdl');

        const result = await (auth as any).generateCodeChallenge('test-verifier');

        expect(result).toBe('Y2hhbGxlbmdl');
        expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
          'SHA-256',
          expect.any(Uint8Array)
        );
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle crypto API unavailable', async () => {
      const originalCrypto = global.crypto;
      delete (global as any).crypto;

      await expect(
        auth.initiateGoogleLogin(mockPlugin)
      ).rejects.toThrow();

      global.crypto = originalCrypto;
    });

    it('should handle btoa unavailable', () => {
      const originalBtoa = global.btoa;
      delete (global as any).btoa;

      expect(() => {
        (auth as any).base64urlencode(new ArrayBuffer(8));
      }).toThrow();

      global.btoa = originalBtoa;
    });

    it('should handle window.open failure', async () => {
      (global.window.open as jest.Mock).mockImplementation(() => {
        throw new Error('Popup blocked');
      });

      const http = require('http');
      const mockServer = {
        listen: jest.fn(),
        close: jest.fn()
      };
      http.createServer.mockReturnValue(mockServer);

      // Should not throw - window.open failure should be handled gracefully
      await auth.initiateGoogleLogin(mockPlugin);

      expect(mockServer.listen).toHaveBeenCalled();
    });
  });
});