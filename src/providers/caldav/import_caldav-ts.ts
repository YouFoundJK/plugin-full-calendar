// import_caldav-ts.ts
import { Authentication } from '../../types';
import { generateCalendarId } from '../../types/calendar_settings';
import { ensureTrailingSlash } from './helper_caldav';
import { createDAVClient } from 'tsdav';
import { CalDAVProviderTSConfig } from './typesCalDAVTS';

/**
 * TS-DAV mode with automatic calendar discovery:
 *  - If a server URL is provided, use ts-dav to discover all available calendars.
 *  - Returns an array of CalDAVProviderTSConfig objects, one for each discovered calendar.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVProviderTSConfig[]> {
  const serverUrl = ensureTrailingSlash(inputUrl.trim());

  // Create a DAV client with the provided credentials
  const client = await createDAVClient({
    serverUrl,
    credentials: {
      username: auth.username,
      password: auth.password
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  });

  // Discover all available calendars on the account
  const calendars = await client.fetchCalendars();

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
