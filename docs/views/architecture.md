# Views Architecture

This page describes how calendar views are rendered and controlled.

## Core Components

- Calendar view integration: `src/ui/view.ts`
- Presentation shaping and filtering: `src/core/ViewEnhancer.ts`
- Workspace behavior: `src/features/workspaces/WorkspaceManager.ts`
- Date navigation controls: `src/features/navigation/DateNavigation.ts`

## Design Boundaries

- View code handles rendering and interaction callbacks.
- ViewEnhancer and workspace logic own presentation-specific filtering.
- Core event state is not owned by the view layer.

## Related User Docs

- [Workspaces](workspaces.md)
- [Timeline View Usage](timeline_view.md)
