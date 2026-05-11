# Milestones Architecture

Milestones are implemented as a feature-layer policy that consumes canonical plugin state and provider outcomes. The module tracks durable progress counters, evaluates unlock rules, and exposes read-only card data for settings rendering.

## Four Single Sources Of Truth

1. Persistent milestone state in settings
   - Location: settings.milestones
   - Shape: counters and unlockedAt maps
   - Responsibility: durable progress and unlock history

2. Milestone rule definitions
   - Location: src/features/milestones/milestones.ts
   - Anchor: MILESTONE_DEFINITIONS
   - Responsibility: milestone ids, i18n keys, and compute functions

3. Success-only mutation hooks
   - Location: src/core/cache/CacheMutationHandler.ts
   - Anchor: recordMilestoneAction calls after confirmed provider success
   - Responsibility: robust increment semantics and rollback safety

4. Settings-page presentation flow
   - Locations: src/core/PluginState.ts, src/ui/settings/LazySettingsTab.ts, src/ui/settings/SettingsTab.tsx, src/ui/settings/sections/renderAppearance.ts
   - Responsibility: navigation to milestones page, read-only rendering, and shared settings footer behavior

## Data Model

Milestone state is stored under settings.milestones:

- counters: Record of numeric counters for global actions, provider-scoped actions, day buckets, and metadata.
- unlockedAt: Record of unlock timestamps keyed by milestone id.

Counters include categories such as:

- action totals by scope
- daily buckets for streak and consistency calculations
- metadata counters for NLP, recurring series, timezone diversity, and lifetime span markers

## Tracking Pipeline

1. A cache mutation path executes an event operation.
2. Provider operation is attempted through registry delegation.
3. On confirmed success, CacheMutationHandler calls recordMilestoneAction.
4. milestones.ts updates scoped counters and metadata.
5. Unlock evaluation runs against MILESTONE_DEFINITIONS.
6. Settings persistence is executed through PluginState.persistData.
7. Newly unlocked milestones are queued into the toast notifier.

Failure paths and delegated action rollbacks do not commit milestone progress.

## Computation Strategy

Each milestone definition has a compute function that returns current and target values. Compute functions are deterministic over the current milestone state and selected runtime context where required.

Representative computation types:

- direct totals such as created.total
- provider-aggregated totals across remote or task families
- threshold counts such as number of providers above a target
- day-series analysis for streak and consistency objectives
- live environment checks such as active remote source count and local live event totals

## UI Rendering Contract

The settings milestones page consumes getMilestoneCards and does not mutate milestone state. Card fields include id, title, description, targetLabel, current, percent, and unlocked.

Sorting contract:

- unlocked cards first
- lexicographic title order inside same unlock group

Footer contract:

- use shared settings footer renderer to preserve consistent layout and behavior

## Internationalization Contract

All user-facing milestone text is sourced from locale keys. The architecture relies on translation keys in rule definitions and notice keys for unlock toasts.

## Extension Checklist

To add a new milestone:

1. Add a new definition in MILESTONE_DEFINITIONS with id and i18n keys.
2. Add or reuse compute primitives in milestones.ts.
3. Add translation keys in en locale and required locales.
4. Verify increment paths are covered by success-only mutation hooks.
5. Validate settings page rendering and toast behavior.

## Related Docs

- [Features Architecture](index.md)
- [Settings Architecture](../../../settings/architecture.md)
- [Event Cache](../../eventcache.md)
- [User Guide: Milestones and Progress](../../../../user/features/milestones.md)
