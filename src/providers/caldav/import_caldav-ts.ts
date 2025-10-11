// import_caldav-ts.ts
import { Authentication } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';
import { ensureTrailingSlash } from './helper_caldav';
import { createAccount, fetchCalendars, getBasicAuthHeaders } from 'tsdav';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';

/**
 * TS-DAV mode with automatic calendar discovery:
 *  - If a server URL is provided, use ts-dav to discover all available calendars.
 *  - Returns an array of CalDAVProviderTSConfig objects, one for each discovered calendar.
 *  - Uses createAccount with minimal discovery to avoid CORS issues in Electron/Obsidian.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVProviderTSConfig[]> {
  const serverUrl = ensureTrailingSlash(inputUrl.trim());

  // Build account object with credentials
  const baseAccount = {
    accountType: 'caldav' as const,
    serverUrl,
    credentials: {
      username: auth.username,
      password: auth.password
    }
  };

  // Get auth headers for requests
  const headers = getBasicAuthHeaders(baseAccount.credentials);

  // Try to create account with discovery
  // If this fails due to CORS, we'll fall back to manual URL construction
  let account;
  try {
    account = await createAccount({
      account: baseAccount,
      headers,
      loadCollections: false,
      loadObjects: false
    });
  } catch (error) {
    console.warn('[caldav-ts] Account creation failed, attempting manual URL construction', error);
    
    // If account creation fails (likely due to CORS on .well-known),
    // construct URLs manually based on common CalDAV patterns
    const pathSegments = new URL(serverUrl).pathname.split('/').filter(s => s);
    
    // Common patterns: /caldav/, /remote.php/dav/, etc.
    // Try to infer the principal and home URLs from the server URL
    let principalUrl = serverUrl;
    let homeUrl = serverUrl;
    
    // For Zoho: https://calendar.zoho.in/caldav/ => home is typically /caldav/<userid>/
    // For most servers, if the URL ends with /caldav/, the calendars are in /calendars/ subdirectory
    if (serverUrl.includes('/caldav/')) {
      // Keep the URL as-is, fetchCalendars will handle it
      homeUrl = serverUrl;
    }
    
    account = {
      ...baseAccount,
      rootUrl: serverUrl,
      principalUrl,
      homeUrl
    };
  }

  // Now discover all available calendars on the account
  const calendars = await fetchCalendars({ account, headers });

  if (calendars.length === 0) {
    throw new Error('No calendars found on this CalDAV server.');
  }

  // Map each discovered calendar to a CalDAVProviderTSConfig object
  const configs: CalDAVProviderTSConfig[] = calendars.map(calendar => {
    const id = generateCalendarId('caldav-ts', existingIds);
    existingIds.push(id);

    // Handle displayName which can be string or Record<string, unknown>
    const calendarName =
      typeof calendar.displayName === 'string' ? calendar.displayName : 'Unnamed Calendar';

    return {
      type: 'caldav-ts',
      id,
      name: calendarName,
      url: serverUrl,
      homeUrl: ensureTrailingSlash(calendar.url), // The specific collection URL
      color: '#888888',
      username: auth.username,
      password: auth.password
    };
  });

  return configs;
}
