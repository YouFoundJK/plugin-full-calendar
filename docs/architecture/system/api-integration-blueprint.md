# API Integration Blueprint

!!! abstract "Audience"
    Use this page when another plugin needs controlled access to Full Calendar. The API is permissioned and must not bypass `EventCache`.

## Integration Steps

1. Detect the plugin and obtain the `PublicAPI` instance.
2. Request access with your plugin ID, a clear reason, and the scopes you need.
3. Store the returned token in your own plugin settings.
4. Use `withToken()` on startup to obtain an `AuthorizedAPI` instance.

## Minimal Example (TypeScript)

```ts
const fcPlugin = app.plugins?.plugins?.['full-calendar'] as { api?: { requestAccess: Function; withToken: Function } } | undefined;
const publicApi = fcPlugin?.api;
if (!publicApi) {
  return; // Full Calendar not installed or not loaded.
}

let token = await publicApi.requestAccess(
  'your-plugin-id',
  'Explain what you need from Full Calendar.',
  ['events:read', 'ui:open-calendar']
);
if (!token) {
  return; // User denied.
}

const api = publicApi.withToken(token);
if (!api) {
  return; // Token invalid or revoked.
}

await api.openCalendar();
const events = api.getAllEvents();
```

## Expected Behaviors

- `requestAccess()` always shows a user-facing authorization modal.
- Tokens are stored by Full Calendar in `authorizedTokens`, but the caller must persist the token too.
- `withToken()` returns `null` when the token is missing, invalid, or revoked.

## Best Practices

- Request the minimum access necessary and keep the reason explicit.
- Avoid re-prompting on every load; reuse stored tokens when possible.
- Handle `null` results and runtime errors without blocking your plugin.
- Do not cache or mutate event objects outside `EventCache` or the authorized API.

## Supported Operations

Authorized plugins can open views, change view mode, open the create modal, and read cached events. Direct data writes are intentionally not exposed.
