# System Overview

!!! abstract "System MOC"
    This page is the map of content for the **System** architecture fold. Use it to jump directly to the contract page you need, instead of scanning all architecture docs linearly.

## Quick Router (System Fold)

| If you need to understand... | Start here |
|---|---|
| Event-state ownership and mutation authority | [EventCache Contract](eventcache.md) |
| In-memory indexing and identifier mapping | [Event Storage and Identifiers](event-storage.md) |
| OFCEvent <-> FullCalendar conversion boundary | [FullCalendar Interop](interop.md) |
| Runtime flow (load, mutate, external sync, tick/reminders) | [Data Flow](data-flow.md) |
| Core subsystem contracts and invariants | [Core Systems](core-systems.md) |
| Event-domain architecture scope | [Events Architecture](../events/architecture.md) |
| Safe extension workflow | [Extending the Plugin](extending.md) |
| Verification policy and docs-test alignment | [Testing and Validation](testing.md) |

## Layer Model (At a Glance)

| Layer | Responsibility | Must Not Own |
|---|---|---|
| UI Layer | Capture user intent and render current state through views/modals. | Canonical state mutation rules.
| Presentation Layer | Apply workspace/view shaping and display-level overrides. | Provider I/O and persistence logic.
| Core Layer | Own event lifecycle, indexing, normalization, recurrence, and time-aware behavior. | Provider-specific protocol details.
| Provider Layer | Translate shared contracts into local/remote source reads and writes. | UI-specific decision making.
| Adapter Layer | Isolate Obsidian APIs behind testable abstractions. | Cross-module business rules.

## Full System Diagram

```text
.--------------------------.        .--------------------------.
| LEGEND                   |        | DATA FLOWS               |
| ──►  Direct Call         |        | ┌──> User-Initiated Write|
| ◄──► Internal R/W        |        | ├──> Filesystem Sync     |
| ◄──  Service Call        |        | └──> Remote Sync         |
| ..> Pub/Sub Notification |        '--------------------------'
| ~>  Specialized Link     |
'--------------------------'

                         ┌───────────────────────────────────────┐
               ┌───────► │  UI Layer (CalendarView + React UI)   │
               |         └───────────────────────────────────────┘
.─────────────────────.                   |                  
|     ViewEnhancer    |                   │ (User clicks/edit modal)
| (Filtering/View VM) |                   │      "CRUD Ops"
'─────────────────────'                   ▼                  
               ▲         ┌───────────────────────────────────────────┐        
(..> Pub/Sub   │         │    CORE Layer: EventCache (Single SoT)    │         ┌───────────────────┐
update notify) │         │  - Optimistic updates                     │ <.....> |  ChronoAnalyser   |
               └──────── │  - Orchestrates C/U/D                     │         └───────────────────┘
                         │  - Pub/Sub hub                            │
                         └───────────────────────────────────────────┘
                                            │
                                            │ (Delegate I/O)
                                            ▼
                            ┌─────────────────────────────────┐
                            │         EventEnhancer           │
                            │   (Stateless Data Transformer)  │     (Potential location of
                            │ - Enhance raw → canonical       │        new features)
                            │ - Prepare canonical → raw       │
                            └─────────────────────────────────┘
                                            │
                                            │ (Provider dispatch)
                                            ▼
                            ┌─────────────────────────────────┐
                            │    ProviderRegistry (I/O Hub)   │
                            │ - Calls providers getEvents()   │
                            │ - Maps IDs ↔ session IDs        │
                            │ - Routes read/write ops         │
                            └─────────────────────────────────┘
                                          │
                        ┌─────────────────┴───────────────┐
                        ▼                                 ▼  
            ┌────────────────────┐              ┌────────────────────┐
            │  local Providers   │              │ remote Providers   │
            │                    │              │ - Google API auth  │
            └────────────────────┘              └────────────────────┘ 
                    │                                    │                
                    │ "Delegate File Ops"                │ 
                    ▼                                    |                     
        ┌───────────────────────────┐                    |
        │      ObsidianAdapter      │                    |
        │ - Wraps vault + file API  │                    |  "Remote Sync"            
        └───────────────────────────┘                    |
                        │                                |
                        |   "Filesystem Sync"            |
                        ▼                                ▼
           ┌───────────────────────────┐       ┌────────────────────┐
           │   Obsidian Vault APIs*    │       │     Internet*      │
           └───────────────────────────┘       └────────────────────┘

 * Components with an asterisk are not part of the plugin's code.
```

## Stable Entry Points

Bootstrap and composition: `src/main.ts`  
State owner and orchestration: `src/core/EventCache.ts`  
Storage and indexing: `src/core/EventStore.ts`  
Provider routing: `src/providers/ProviderRegistry.ts`  
Workspace/view shaping: `src/core/ViewEnhancer.ts`
