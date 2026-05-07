# FCR Command — NLP Engine Architecture

!!! abstract "Architecture contract"
    The NLP engine is a pure-function virtual machine that executes data-defined rules from JSON payloads. The engine contains zero language-specific logic; all vocabulary, regex patterns, and phrase mappings live exclusively in the payload files. This separation ensures the engine scales to any language by adding a JSON file — no code changes required.

## Core model

| Layer | Ownership | Implementation |
|---|---|---|
| Engine (VM) | Core DSL execution, regex matching, title stripping, command dispatch | `src/features/nlp/engine.ts` |
| Payload (Lexer) | Language-specific regex rules and DSL action mappings | `src/features/nlp/payloads/<locale>.json` |
| Loader | Payload resolution, in-memory caching, disk caching, remote fetch | `src/features/nlp/loader.ts` |
| Smart Calendar | Pure-function title scanner for dynamic calendar name matching | `src/features/nlp/smartCalendar.ts` |
| Dispatcher | Maps `NLPActionObject` → plugin actions (modals, navigation, settings, sync) | `src/features/nlp/dispatcher.ts` |
| Modal | User-facing input with live preview, debounced parsing | `src/features/nlp/NLPCommandModal.ts` |

## Data flow

```
Raw Input String
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  NLP Loader │────▶│ JSON Payload │  (in-memory cache → disk cache → remote fetch)
└─────────────┘     └──────┬───────┘
                           │
       ┌───────────────────┘
       ▼
┌─────────────┐
│  NLP Engine │  For each rule: regex test → capture groups → DSL execution → title strip
│  (Pure VM)  │  Short-circuits on command/navigation intents
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ ActionObject │  { intent, title, date, hours, minutes, targetCalendar, recurrence }
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ Smart Calendar  │  Scans remaining title for "in <name>" → resolves against actual calendars
│ (Pure function) │  Only runs for CREATE_EVENT when no explicit target set
└──────┬──────────┘
       │
       ▼
┌────────────┐
│ Dispatcher │  CREATE_EVENT     → launchCreateModal()
│            │  NAVIGATE_*       → InternalAPI.changeView()
│            │  OPEN_*           → InternalAPI / PluginState
│            │  GOTO_DATE        → changeView('timeGridDay') + gotoDate()
│            │  RESET_CACHE      → EventCache.reset()
│            │  REVALIDATE_*     → ProviderRegistry.revalidateRemoteCalendars()
│            │  SYNC_*           → activitywatch/sync
│            │  SHOW_CHANGELOG   → PluginState.showChangelog()
└────────────┘
```

## Intent taxonomy

| Intent | Short-circuits? | Dispatcher target |
|---|---|---|
| `CREATE_EVENT` | No | `launchCreateModal()` with smart calendar resolution |
| `NEW_EVENT` | No | `openCreateModal()` (blank form) |
| `NAVIGATE_DAY` | Yes | `changeView('timeGridDay')` |
| `NAVIGATE_WEEK` | Yes | `changeView('timeGridWeek')` |
| `NAVIGATE_MONTH` | Yes | `changeView('dayGridMonth')` |
| `OPEN_CALENDAR` | Yes | `InternalAPI.openCalendar()` |
| `OPEN_SIDEBAR` | Yes | `InternalAPI.openSidebar()` |
| `OPEN_SETTINGS` | Yes | `PluginState.displaySettingsTab()` |
| `OPEN_CHRONO` | Yes | Lazy-loads `AnalysisView`, opens in new tab |
| `SHOW_CHANGELOG` | Yes | `PluginState.showChangelog()` |
| `RESET_CACHE` | Yes | `EventCache.reset()` + Notice |
| `REVALIDATE_REMOTE` | Yes | `ProviderRegistry.revalidateRemoteCalendars()` |
| `SYNC_ACTIVITYWATCH` | Yes | Lazy-loads `activitywatch/sync`, checks enabled |
| `GOTO_DATE` | **No** | `changeView('timeGridDay')` + `gotoDate(date)` |

> **GOTO_DATE does NOT short-circuit** so that subsequent date rules (e.g., `tomorrow`, `next tuesday`) can still modify the context date before the dispatcher navigates.

## DSL command reference

| Command | Arguments | Behavior |
|---|---|---|
| `ADD_DAYS(x)` | Integer | Adds `x` days to context date |
| `SUBTRACT_DAYS(x)` | Integer | Subtracts `x` days from context date |
| `ADD_HOURS(x)` | Integer | Adds `x` hours (rolls over days via native `Date`) |
| `ADD_MINUTES(x)` | Integer | Adds `x` minutes (rolls over hours/days via native `Date`) |
| `ADD_WEEKS(x)` | Integer | Adds `x * 7` days |
| `SET_TIME(h, m, meridiem)` | hours, minutes, "am"/"pm"/"" | Sets time with AM/PM conversion (`12 am` → 0, `4 pm` → 16) |
| `NEXT_WEEKDAY(day)` | Weekday name or index (0-6) | Advances to next occurrence; wraps +7 if target == current day |
| `SET_DAY(day)` | Weekday name or index (0-6) | Sets to specific weekday of current week (can go backward) |
| `SET_INTENT(type)` | NLPIntent string | Sets intent; triggers short-circuit for non-event intents |
| `SET_TARGET(keyword)` | Calendar name string | Sets target calendar for routing |
| `SET_RECURRENCE(freq, interval, byDay?)` | freq, interval, optional weekday | Sets recurrence metadata |

## Smart calendar resolution

The smart calendar resolver (`smartCalendar.ts`) is a pure function that runs **after** the engine and **before** the dispatcher. It scans the remaining title text for a trailing `in <name>` pattern and matches against actual configured calendar names (case-insensitive).

**Algorithm:**
1. Skip if `targetCalendar` is already set (explicit `in <name> calendar` rule ran)
2. Skip if intent is not `CREATE_EVENT`
3. Find all occurrences of ` in <text>` in the title
4. For each occurrence (left-to-right), check if the suffix after "in" matches a calendar name
5. Use the **last** matching occurrence (rightmost) to avoid stripping location phrases like "Meeting in London in daily1"

**This function has zero Obsidian dependencies**, making it fully testable in Jest.

## Payload schema

```json
{
  "version": 2,
  "locale": "en",
  "rules": [
    {
      "name": "rule_identifier",
      "regex": "escaped regex with (capture groups)",
      "flags": "i",
      "actions": ["DSL_COMMAND($1, $2)"]
    }
  ]
}
```

!!! warning "Ordering contract"
    Rules are evaluated sequentially from top to bottom. The array **must** be ordered by specificity: longest/most-complex patterns first, broad/simple patterns last. Violating this invariant causes partial matches to consume text that longer patterns need.

## Rule evaluation semantics

1. For each rule, test regex against the current (progressively stripped) input text
2. On match: extract capture groups, strip matched substring, execute DSL actions
3. If any action sets a short-circuiting intent → abort remaining rules
4. After all rules: remaining text becomes event title

## Invariants for contributors

- **No logic in payloads.** JSON files contain only regex patterns and DSL command strings
- **No language-specific code in engine.** The `WEEKDAY_INDEX` lookup table supports multiple languages but the engine itself is language-agnostic
- **Short-circuit is intent-driven.** All intents short-circuit except `CREATE_EVENT` and `GOTO_DATE`
- **Title is the residual.** After all matched substrings are stripped, the remaining whitespace-normalized text is the event title
- **Smart calendar runs post-engine.** It's a pure function applied to the action object, not part of the engine loop
- **Payload ordering is the developer's responsibility.** The engine does not sort or reorder rules

## Integration anchors

- `src/features/nlp/engine.ts` — Core VM, pure function `processNaturalLanguage()`
- `src/features/nlp/types.ts` — All NLP type definitions (15 intents)
- `src/features/nlp/loader.ts` — Payload loading with three-tier resolution
- `src/features/nlp/smartCalendar.ts` — Pure smart calendar resolver
- `src/features/nlp/dispatcher.ts` — Action → plugin API bridge (orchestrator)
- `src/features/nlp/NLPCommandModal.ts` — Live preview modal
- `src/features/nlp/registerNLPCommand.ts` — Command palette registration
- `src/features/nlp/payloads/en.json` — English payload v2 (bundled)
- `src/features/nlp/index.ts` — Public module API
