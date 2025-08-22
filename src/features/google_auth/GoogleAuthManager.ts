/**
 * @file GoogleAuthManager.ts
 * @brief Centralized manager for Google account authentication and token handling.
 * @license See LICENSE.md
 */

import { requestUrl, Notice, Platform } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { CalendarInfo } from '../../types';
import { GoogleAccount } from '../../types/settings';
import { generateCalendarId } from '../../types/calendar_settings';

const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Type alias for a Google source from Zod schema
type GoogleCalendarInfo = Extract<CalendarInfo, { type: 'google' }>;

// Type for legacy auth object found on a source
type LegacyAuth = {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
};

// Moved from auth.ts
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PROXY_REFRESH_URL = 'https://gcal-proxy-server.vercel.app/api/google/refresh';
const PUBLIC_CLIENT_ID = '272284435724-ltjbog78np5lnbjhgecudaqhsfba9voi.apps.googleusercontent.com';

export class GoogleAuthManager {
  private plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Refreshes an access token using a refresh token for a specific account or legacy source.
   * This method MUTATES the provided account/auth object and SAVES settings.
   */
  private async refreshAccessToken(
    authObj: GoogleAccount | LegacyAuth,
    isLegacy: boolean
  ): Promise<string | null> {
    const { settings } = this.plugin;
    if (!authObj.refreshToken) {
      console.error('No refresh token available.');
      return null;
    }

    const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;

    let tokenUrl: string;
    let requestBody: string;
    let requestHeaders: Record<string, string>;

    if (settings.useCustomGoogleClient) {
      tokenUrl = GOOGLE_TOKEN_URL;
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: authObj.refreshToken,
        client_secret: settings.googleClientSecret
      });
      requestBody = body.toString();
      requestHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else {
      tokenUrl = PROXY_REFRESH_URL;
      const body = {
        client_id: clientId,
        refresh_token: authObj.refreshToken
      };
      requestBody = JSON.stringify(body);
      requestHeaders = { 'Content-Type': 'application/json' };
    }

    try {
      const response = await requestUrl({
        method: 'POST',
        url: tokenUrl,
        headers: requestHeaders,
        body: requestBody
      });

      const data = response.json;
      // Mutate the object that was passed in
      authObj.accessToken = data.access_token;
      authObj.expiryDate = Date.now() + data.expires_in * 1000;

      // Save settings to persist the new token
      await this.plugin.saveSettings();
      return data.access_token;
    } catch (e) {
      console.error('Failed to refresh Google access token:', e);

      if (isLegacy) {
        // Clear out the global legacy token
        settings.googleAuth = null;
      } else {
        // For multi-account, we might want to just nullify the specific account's tokens
        // For now, let's log the error and let the user re-authenticate.
      }
      await this.plugin.saveSettings();
      new Notice('Google authentication expired. Please reconnect your account.');
      return null;
    }
  }

  /**
   * Retrieves a valid access token for a given Google calendar source.
   * It handles both the new multi-account model (via `googleAccountId`) and the legacy
   * embedded `auth` object model with a fallback.
   */
  public async getTokenForSource(source: GoogleCalendarInfo): Promise<string | null> {
    // New multi-account path
    if (source.googleAccountId) {
      const account = this.plugin.settings.googleAccounts.find(
        a => a.id === source.googleAccountId
      );
      if (!account) {
        console.error(`Could not find Google account with ID: ${source.googleAccountId}`);
        return null;
      }

      if (account.accessToken && account.expiryDate && Date.now() < account.expiryDate - 60000) {
        return account.accessToken;
      }
      return this.refreshAccessToken(account, false);
    }

    // Legacy fallback path
    if (source.auth) {
      if (
        source.auth.accessToken &&
        source.auth.expiryDate &&
        Date.now() < source.auth.expiryDate - 60000
      ) {
        return source.auth.accessToken;
      }
      return this.refreshAccessToken(source.auth, true);
    }

    return null;
  }

  /**
   * Fetches the user's email address from the Google API.
   */
  private async getUserInfo(accessToken: string): Promise<{ email: string; id: string }> {
    const response = await requestUrl({
      url: USER_INFO_URL,
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.json;
  }

  /**
   * Adds a new Google Account to the plugin's settings.
   * This is called after a successful OAuth flow.
   */
  public async addAccount(auth: {
    refreshToken: string;
    accessToken: string;
    expiryDate: number;
  }): Promise<GoogleAccount> {
    const userInfo = await this.getUserInfo(auth.accessToken);
    const newAccount: GoogleAccount = {
      id: `gcal_${userInfo.id}`,
      email: userInfo.email,
      ...auth
    };

    const existingAccounts = this.plugin.settings.googleAccounts || [];
    const index = existingAccounts.findIndex(a => a.id === newAccount.id);
    if (index !== -1) {
      existingAccounts[index] = newAccount;
    } else {
      existingAccounts.push(newAccount);
    }
    this.plugin.settings.googleAccounts = existingAccounts;
    await this.plugin.saveSettings();
    return newAccount;
  }

  /**
   * Removes a Google Account and all its associated calendars.
   */
  public async removeAccount(accountId: string): Promise<void> {
    this.plugin.settings.googleAccounts = (this.plugin.settings.googleAccounts || []).filter(
      a => a.id !== accountId
    );
    this.plugin.settings.calendarSources = this.plugin.settings.calendarSources.filter(
      s => s.type !== 'google' || (s as any).googleAccountId !== accountId
    );
    await this.plugin.saveSettings();
  }

  /**
   * Gets a token from the legacy global `googleAuth` object.
   * This is used by the settings UI before a calendar source is created.
   * In a multi-account world, this will eventually be replaced by an account picker.
   */
  public async getLegacyToken(): Promise<string | null> {
    const { googleAuth } = this.plugin.settings;
    if (!googleAuth?.refreshToken) {
      return null;
    }

    if (
      googleAuth.accessToken &&
      googleAuth.expiryDate &&
      Date.now() < googleAuth.expiryDate - 60000
    ) {
      return googleAuth.accessToken;
    }
    return this.refreshAccessToken(googleAuth, true);
  }
}
