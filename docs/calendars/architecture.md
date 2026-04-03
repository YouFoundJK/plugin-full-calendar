# Provider Architecture

!!! abstract "Provider architecture intent"
    Providers are the extensibility backbone of Full Calendar. They isolate source-specific parsing/persistence while exposing one shared runtime contract to the core state engine.

## Contract and orchestration

`Provider` defines operations and capabilities; `ProviderRegistry` owns registration, lifecycle, load-priority orchestration, fetch/write routing, and global identifier mapping. `EventCache` only talks to providers through this registry path.

## Provider families

| Family | Providers | Design note |
|---|---|---|
| Local | Full Note, Daily Note | Vault-backed parsing and write paths with file/location identity. |
| Remote | Google, CalDAV, ICS | Network-backed ingestion and protocol/auth handling. |
| Integration | Tasks, Bases | Plugin-integrated sources with custom semantics beyond plain calendar files. |

## Runtime flow (provider perspective)

1. Registry selects provider instances by configured sources.
2. Providers return raw source events and source locations/handles.
3. Cache normalizes events through enhancer and stores canonical state.
4. Mutations route back to providers through registry and capability checks.

## Non-standard implementations and patches

Important implementation-specific behavior is documented in the implementation deep dive page, including:

- ICS hybrid behavior (remote URL and local file support in one read-only provider).
- CalDAV defensive REPORT/GET retrieval and XML namespace fallback handling.
- Tasks provider surgical markdown updates and custom completion scheduling semantics.
- Provider load-priority tuning for staged startup behavior.

See: [Provider Implementations and Patches](provider-implementations.md)

## New provider onboarding

Use the canonical blueprint when adding sources so registration, identifiers, capabilities, and tests/docs stay consistent:

See: [Provider Blueprint](provider-blueprint.md)

## Where to look in code

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/providers/fullnote/`
- `src/providers/dailynote/`
- `src/providers/google/`
- `src/providers/caldav/`
- `src/providers/ics/`
- `src/providers/tasks/`
- `src/providers/bases/`
