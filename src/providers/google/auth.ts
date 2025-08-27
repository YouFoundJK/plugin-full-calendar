/**
 * @file auth.ts
 * @brief Handles all OAuth 2.0 logic for Google Calendar integration.
 *
 * @description
 * This module manages the OAuth 2.0 Authorization Code Flow with PKCE.
 * It handles generating auth URLs, exchanging the authorization code for tokens,
 * storing tokens securely, and automatically refreshing the access token when it expires.
 *
 * @license See LICENSE.md
 */

import { Platform, requestUrl, Notice } from 'obsidian';
import FullCalendarPlugin from '../../main';
import * as http from 'http';
import * as url from 'url';
import { GoogleAuthManager } from '../../features/google_auth/GoogleAuthManager';

// =================================================================================================
// CONSTANTS
// =================================================================================================

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'; // Renamed for clarity
const PROXY_TOKEN_URL = 'https://gcal-proxy-server.vercel.app/api/google/token';
const PROXY_REFRESH_URL = 'https://gcal-proxy-server.vercel.app/api/google/refresh';

const SCOPES =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

const MOBILE_REDIRECT_URI =
  'https://youfoundjk.github.io/plugin-full-calendar/google-auth-callback.html';
const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:42813/callback';

const PUBLIC_CLIENT_ID = '272284435724-ltjbog78np5lnbjhgecudaqhsfba9voi.apps.googleusercontent.com';

// =================================================================================================
// MODULE STATE
// =================================================================================================

let pkce: { verifier: string; state: string } | null = null;
let server: http.Server | null = null;

// =================================================================================================
// PKCE HELPER FUNCTIONS
// =================================================================================================

function generateRandomString(length: number): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
  const bytes = new Uint8Array(a);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

function startDesktopLogin(plugin: FullCalendarPlugin, authUrl: string): void {
  if (server) {
    window.open(authUrl);
    return;
  }
  server = http.createServer(async (req, res) => {
    try {
      if (!req.url || !req.url.startsWith('/callback')) {
        res.writeHead(204).end();
        return;
      }

      const { code, state } = url.parse(req.url, true).query;

      if (typeof code !== 'string' || typeof state !== 'string') {
        throw new Error('Invalid callback parameters');
      }

      res.end('Authentication successful! Please return to Obsidian.');

      if (server) {
        server.close();
        server = null;
      }

      await exchangeCodeForToken(code, state, plugin);
      // Refresh the settings tab if it's open
      await plugin.settingsTab?.display();
    } catch (e) {
      console.error('Error handling Google Auth callback:', e);
      res.end('Authentication failed. Please check the console in Obsidian and try again.');
      if (server) {
        server.close();
        server = null;
      }
    }
  });
  server.listen(42813, () => {
    window.open(authUrl);
  });
}

// =================================================================================================
// EXPORTED AUTHENTICATION FUNCTIONS
// =================================================================================================

/**
 * Kicks off the Google OAuth 2.0 flow.
 */
export async function startGoogleLogin(plugin: FullCalendarPlugin): Promise<void> {
  const state = generateRandomString(16);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);

  // Store the verifier and state to be used in the callback.
  pkce = { verifier, state };

  const { settings } = plugin;
  const isMobile = Platform.isMobile;

  const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;

  if (settings.useCustomGoogleClient && (!clientId || !settings.googleClientSecret)) {
    new Notice('Custom Google Client ID and Secret must be set in the plugin settings.');
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    prompt: 'consent',
    access_type: 'offline',
    state: state,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;
  if (isMobile) {
    window.open(authUrl);
  } else {
    startDesktopLogin(plugin, authUrl);
  }
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  plugin: FullCalendarPlugin
): Promise<void> {
  if (!pkce || state !== pkce.state) {
    new Notice('Google authentication failed. State mismatch.');
    console.error('State mismatch during OAuth callback.');
    return;
  }

  const { settings } = plugin;
  const isMobile = Platform.isMobile;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;
  const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;

  let tokenUrl: string;
  let requestBody: string;
  let requestHeaders: Record<string, string>;

  if (settings.useCustomGoogleClient) {
    // Legacy path: User provides their own credentials, talk to Google directly.
    tokenUrl = GOOGLE_TOKEN_URL;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      code_verifier: pkce.verifier,
      redirect_uri: redirectUri,
      client_secret: settings.googleClientSecret
    });
    requestBody = body.toString();
    requestHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  } else {
    // New default path: Use the public client ID and the proxy server.
    tokenUrl = PROXY_TOKEN_URL;
    const body = {
      client_id: clientId,
      code: code,
      code_verifier: pkce.verifier,
      state: state
    };
    requestBody = JSON.stringify(body);
    requestHeaders = { 'Content-Type': 'application/json' };
  }

  try {
    const response = await requestUrl({
      method: 'POST',
      url: tokenUrl,
      headers: requestHeaders,
      body: requestBody,
      throw: false
    });

    if (response.status >= 400) {
      console.error('Token exchange failed:', response.text);
      throw new Error(`Google API returned status ${response.status}: ${response.text}`);
    }
    const data = response.json;

    if (!data.refresh_token) {
      throw new Error(
        "No refresh token received. If you are using a custom client, ensure it is configured for a 'Desktop app' and has not already been used to grant a refresh token."
      );
    }

    // --- REPLACEMENT BLOCK ---
    // Use GoogleAuthManager to add the account
    const authManager = new GoogleAuthManager(plugin);
    await authManager.addAccount({
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiryDate: Date.now() + data.expires_in * 1000
    });
    // --- END REPLACEMENT BLOCK ---

    new Notice('Successfully connected Google Account!');
  } catch (e) {
    new Notice('Failed to connect Google Account. Check the developer console for details.');
    if (e instanceof Error) {
      console.error('Error during token exchange:', e.message);
    } else {
      console.error('An unknown error occurred during token exchange:', e);
    }
  } finally {
    pkce = null;
  }
}
