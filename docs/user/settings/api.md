# API and Security Settings

!!! abstract "Philosophy"
    Control your data. The API settings allow you to securely grant other Obsidian plugins or external tools permission to interact with your calendar and event data.

## API Token Management

Access these settings in **Full Calendar Settings → API & Security**.

*   **Authorized Tokens**: A list of all third-party plugins or scripts that have been granted access to the Full Calendar API. See: [API Integration Blueprint](../../architecture/system/api-integration-blueprint.md).
    *   **Plugin ID**: The identifier of the requesting plugin.
    *   **Reason**: The purpose for which access was requested.
    *   **Granted Scopes**: The specific permissions (Read, Write, Full Access) assigned to the token.
    *   **Revoke Access**: Instantly invalidate a token to cut off access.

## Permission Scopes

The plugin enforces a granular permission model. When a third-party tool requests access, you can review and approve specific scopes:

*   **`ui` scopes**: Open the calendar, sidebar, or specific modals.
*   **`events` scopes**: Read or modify your event data.
*   **`providers` scopes**: Manage your calendar sources.
*   **`settings` scopes**: Read or update plugin configuration.
*   **`system:full-access`**: Unrestricted access to all plugin internals.

## Security Best Practices

*   **Never share tokens**: API tokens are secret keys. Sharing them gives the recipient the ability to read or delete your calendar data.
*   **Audit regularly**: Review your Authorized Tokens list and revoke access for any plugins you no longer use.
*   **Least Privilege**: Only grant the minimum scopes required for a plugin to function.

---

[Reminders](reminders.md) · [Calendar Sources](sources.md) · [Back to Index](index.md)
