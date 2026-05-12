# Outlook Calendar

Easily add, edit, and delete events from your Microsoft Outlook calendars in Full Calendar.

!!! tip "Power Up with Categories"
    Google Calendar events fully support **[Advanced Categories](../events/categories.md)**. Use a title like `Personal - Doctor` to automatically apply your "Personal" color and styling.

## What This Source Supports

- Read events from Outlook calendars
- Create, update, and delete single events
- Multi-account support via connected Outlook accounts

Current limitation:

- Recurring single-instance overrides are not yet supported for Outlook sources

## Setup

1. Open Full Calendar settings.
2. Go to Integrations and open Outlook Accounts.
3. Configure credentials mode:
   - Default mode uses built-in client/proxy defaults.
   - Optional custom mode lets you enter your own Microsoft Client ID and proxy URL.
4. Connect an Outlook account.
5. Return to Calendars and add Outlook calendars from the connected account.

## Naming and Account Differentiation

When selecting calendars, Full Calendar stores source names as:

- CalendarName (account@domain.com)

This helps distinguish calendars when multiple Outlook accounts are connected.

## Troubleshooting

If custom tocken creationg and account connect fails:

- Verify the Azure app is configured for Desktop/Native flow
- Verify redirect URI is exactly `http://localhost:42813/callback`
- Ensure proxy has required Microsoft env vars
- Reconnect the account after any auth config change

If events are missing:

- Revalidate remote calendars from command/settings
- Confirm the event exists in the selected Outlook calendar
- Confirm the calendar source is linked to the expected Outlook account
