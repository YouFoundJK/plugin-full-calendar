# Settings Architecture

This page describes how settings are modeled and applied.

## Core Components

- Settings model and defaults: `src/types/settings.ts`
- Plugin settings lifecycle: `src/main.ts`
- Settings UI composition: `src/ui/settings/SettingsTab.tsx`
- Feature-level settings renderers: `src/features/*/ui/*`

## Design Boundaries

- Settings schema remains the single typed source of truth.
- Features own their setting UI and behavior handlers.
- Settings updates propagate to views, cache, and providers.

## Related User Docs

- [Calendar Sources](../../user/settings/sources.md)
- [Display and Behavior](../../user/settings/fc_config.md)
- [Reminders and Notifications](../../user/guides/reminders.md)
