# Provider Blueprint (How to Add a New Provider)

!!! abstract "Blueprint goal"
    A provider is valid only when it respects the shared contract and integrates with registry, cache, and docs/test policies. This page is the canonical add-provider checklist.

## Step 1: Define provider config and UI

1. Add typed config schema/type for the provider.
2. Implement a configuration component for settings modal flow.
3. Keep source-specific validation inside the provider domain.

## Step 2: Implement provider contract

Implement the `CalendarProvider` interface with clear source capability boundaries:

- `getEvents` is mandatory.
- `createEvent` / `updateEvent` / `deleteEvent` should throw explicit read-only errors if unsupported.
- `getEventHandle` must return stable persistent identity.
- Optional hooks (`initialize`, `toggleComplete`, `canBeScheduledAt`) are allowed only when needed.

## Step 3: Register and instantiate via registry

1. Register dynamic loader in `registerBuiltInProviders`.
2. Ensure source `type` maps to the exported class static `type`.
3. Verify initialization path in `initializeInstances` and runtime source updates.

## Step 4: Choose load priority intentionally

Load priority controls staged loading behavior:

- Lower values load earlier and improve perceived first render.
- Higher values can defer expensive or non-critical providers.
- Priorities should reflect startup UX and source latency profile.

## Step 5: Validate identifier and sync behavior

- Ensure `getEventHandle` produces durable IDs across reads.
- Confirm mapping `calendarId::persistentId` remains stable.
- Verify update ingestion paths do not duplicate or orphan events.

## Step 6: Ship with docs and tests

Minimum expectation before merge:

- Unit tests for parser/serializer or source edge cases.
- Integration tests for cache-provider mutation path.
- Architecture docs update in Provider Architecture section.
- User docs update if the provider is user-configurable.

!!! warning "Contributor contract"
    Append or modify only relevant documentation sections. Do not rewrite unrelated architecture pages when adding a provider.

## Integration anchors

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/ui/settings/SettingsTab.tsx`
