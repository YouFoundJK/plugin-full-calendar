// import_caldav-ts.ts
import { Authentication } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';
import { ensureTrailingSlash } from './helper_caldav';
import { fetchCalendars, getBasicAuthHeaders } from 'tsdav';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';

/**
 * TS-DAV mode with automatic calendar discovery:
 *  - If a server URL is provided, use ts-dav to discover all available calendars.
 *  - Returns an array of CalDAVProviderTSConfig objects, one for each discovered calendar.
 *  - Completely bypasses service discovery to avoid CORS issues in Electron/Obsidian.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVProviderTSConfig[]> {
  const serverUrl = ensureTrailingSlash(inputUrl.trim());

  // Build a fully-formed account object to bypass service discovery entirely
  // This avoids the .well-known CORS issue in Obsidian's Electron environment
  const account = {
    accountType: 'caldav' as const,
    serverUrl,
    credentials: {
      username: auth.username,
      password: auth.password
    },
    // Provide all URLs upfront to skip service discovery
    rootUrl: serverUrl,
    principalUrl: serverUrl,
    homeUrl: serverUrl
  };

  // Get auth headers for requests
  const headers = getBasicAuthHeaders(account.credentials);

  // Discover all available calendars on the account
  // This will make PROPFIND requests directly to the server without .well-known discovery
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
