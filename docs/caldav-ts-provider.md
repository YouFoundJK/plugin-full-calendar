# CalDAV (ts-dav) Provider

This document describes the new `caldav-ts` provider that uses the `ts-dav` library for improved CalDAV integration.

## Overview

The `caldav-ts` provider is a modern CalDAV implementation that offers automatic calendar discovery and simplified configuration compared to the original `caldav` provider. It runs alongside the existing provider without any breaking changes.

## Key Advantages

1. **Automatic Calendar Discovery**: No need to manually construct collection URLs. Simply provide your server URL and credentials, and the plugin will discover all available calendars.

2. **Simplified Configuration**: Users only need three pieces of information:
   - Server URL (e.g., `https://caldav.icloud.com`)
   - Username
   - Password

3. **Robust Implementation**: Uses the battle-tested `ts-dav` library instead of manual HTTP requests.

4. **Standards-Compliant**: Properly implements CalDAV protocol through ts-dav's abstractions.

## Usage

### Adding a CalDAV (ts-dav) Calendar

1. Open Obsidian Settings
2. Navigate to Full Calendar plugin settings
3. In the "Calendars" section, click the "+" button
4. Select "CalDAV (ts-dav)" from the dropdown
5. Enter your credentials:
   - **Server URL**: The main CalDAV server URL (examples below)
   - **Username**: Your account username or email
   - **Password**: Your account password
6. Click "Import Calendars"
7. The plugin will automatically discover all calendars and add them to your configuration

### Supported CalDAV Servers

The `caldav-ts` provider works with any standards-compliant CalDAV server:

#### Zoho Calendar
- **Server URL**: `https://calendar.zoho.in/caldav/` or `https://calendar.zoho.com/caldav/` (depending on region)
- **Username**: Your Zoho email address
- **Password**: Your Zoho password or app-specific password

#### iCloud Calendar
- **Server URL**: `https://caldav.icloud.com`
- **Username**: Your Apple ID email
- **Password**: App-specific password (generate at appleid.apple.com)

#### Nextcloud/ownCloud
- **Server URL**: `https://your-domain.com/remote.php/dav/`
- **Username**: Your Nextcloud username
- **Password**: Your Nextcloud password or app password

#### Google Calendar
Note: For Google Calendar, use the dedicated "Google Calendar" provider which offers better integration through OAuth2.

#### Other CalDAV Servers
- Fastmail: `https://caldav.fastmail.com`
- Yahoo: `https://caldav.calendar.yahoo.com`
- Generic CalDAV: Most servers use `/caldav/` or similar paths

## Technical Details

### Architecture

The caldav-ts provider consists of four main components:

1. **CalDAVProviderTS** (`CalDAVProviderTS.ts`): Main provider class that implements the CalendarProvider interface
2. **CalDAVConfigComponentTS** (`CalDAVConfigComponentTS.tsx`): React component for configuration UI
3. **importCalendars** (`import_caldav-ts.ts`): Calendar discovery logic using ts-dav
4. **CalDAVProviderTSConfig** (`typesCalDAVTS.ts`): TypeScript type definitions

### Event Fetching

The provider fetches events using the following process:

1. Creates a DAV client with user credentials
2. Calls `client.fetchCalendarObjects()` with:
   - Calendar URL (from discovery)
   - Time range (1 month ago to 6 months ahead)
3. Extracts ICS data from calendar objects
4. Parses ICS data using the existing `getEventsFromICS` parser
5. Returns parsed events to the plugin

### Calendar Discovery

The discovery process works as follows:

1. User enters server URL and credentials
2. Plugin creates a DAV client
3. Calls `client.fetchCalendars()` to get all available calendars
4. Maps each calendar to a configuration object with:
   - Display name
   - Server URL
   - Calendar collection URL
   - User credentials
5. Allows user to import one or multiple calendars at once

## Differences from Original CalDAV Provider

| Feature | Original `caldav` | New `caldav-ts` |
|---------|------------------|----------------|
| Calendar Discovery | Manual - requires collection URL | Automatic - discovers all calendars |
| Configuration | Complex - need to construct URLs | Simple - just server URL + credentials |
| Implementation | Manual HTTP REPORT requests | ts-dav library abstraction |
| URL Requirements | Must end with `/events/` | Any valid server URL |
| Multiple Calendars | One at a time | Can import all at once |
| Maintenance | Custom code to maintain | Library handles protocol details |

## Testing

The caldav-ts provider includes comprehensive test coverage:

- **CalDAVProviderTS.test.ts**: 15 tests covering provider functionality
- **import_caldav-ts.test.ts**: 5 tests covering calendar discovery

Run tests with:
```bash
npm test -- CalDAVProviderTS.test.ts
npm test -- import_caldav-ts.test.ts
```

## Troubleshooting

### No calendars found
- Verify your server URL is correct
- Check that your credentials are valid
- Ensure you're using the correct authentication method (most use Basic auth)
- For services requiring app-specific passwords (iCloud, Fastmail), generate one first

### Events not loading
- Check the Obsidian console for error messages
- Verify the calendar URL in your configuration
- Ensure your network allows connections to the CalDAV server
- Try the original `caldav` provider to see if it's a server-specific issue

### Authentication failures
- Double-check username and password
- For email addresses as usernames, ensure proper formatting
- Some services require app-specific passwords instead of account passwords
- Check if two-factor authentication is interfering

## Future Enhancements

Potential improvements for future versions:

1. **Write Support**: Currently read-only; could add support for creating/editing/deleting events
2. **Sync Token Support**: Use CalDAV sync tokens for more efficient updates
3. **Custom Time Ranges**: Allow users to configure the event fetch time range
4. **Calendar Colors**: Use server-provided calendar colors instead of default
5. **Shared Calendars**: Better support for shared/subscribed calendars
6. **Performance**: Cache discovered calendars to speed up subsequent imports

## Contributing

To contribute to the caldav-ts provider:

1. Familiarize yourself with the ts-dav documentation: https://tsdav.vercel.app/docs/intro
2. Review the existing test suite
3. Ensure all tests pass before submitting changes
4. Add tests for new functionality
5. Follow the existing code style and patterns

## License

This provider is part of the Full Calendar plugin and follows the same license.
