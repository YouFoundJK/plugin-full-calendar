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
- If a setting is exposed in more than one UI location, each control must write the same typed settings field and trigger the same downstream refresh path. For example, the Tasks backlog date-field selector in Settings and in the Tasks Backlog view both write `tasksIntegration.backlogDateTarget` and refresh backlog views through the provider registry.

## Related User Docs

- [Calendar Sources](../../user/settings/sources.md)
- [Display and Behavior](../../user/settings/fc_config.md)
- [Reminders and Notifications](../../user/guides/reminders.md)
