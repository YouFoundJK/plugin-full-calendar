# NLP Engine Architecture

!!! abstract "NLP contract"
    The NLP engine is a pure-function virtual machine that executes data-defined rules from JSON payloads. The engine contains zero language-specific logic; all vocabulary, regex patterns, and phrase mappings live exclusively in the payload files. This separation ensures the engine scales to any language by adding a JSON file — no code changes required.

## Core model

| Layer | Ownership | Implementation |
|---|---|---|
| Engine (VM) | Core DSL execution, regex matching, title stripping, command dispatch | `src/features/nlp/engine.ts` |
| Payload (Lexer) | Language-specific regex rules and DSL action mappings | `src/features/nlp/payloads/<locale>.json` |
| Loader | Payload resolution, in-memory caching, disk caching, remote fetch | `src/features/nlp/loader.ts` |
| Dispatcher | Maps `NLPActionObject` → plugin actions (modals, navigation, view changes) | `src/features/nlp/dispatcher.ts` |
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
│  (Pure VM)  │  Short-circuits on navigation intents
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ ActionObject │  { intent, title, date, hours, minutes, targetCalendar, recurrence }
└──────┬───────┘
       │
       ▼
┌────────────┐
│ Dispatcher │  CREATE_EVENT → launchCreateModal()
│            │  NAVIGATE_*  → InternalAPI.changeView()
│            │  OPEN_*      → InternalAPI.openCalendar()/openSidebar()
└────────────┘
```

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
| `SET_INTENT(type)` | NLPIntent string | Sets intent; triggers short-circuit for navigation/open intents |
| `SET_TARGET(keyword)` | Calendar name string | Sets target calendar for routing |
| `SET_RECURRENCE(freq, interval, byDay?)` | freq, interval, optional weekday | Sets recurrence metadata |

## Payload schema

```json
{
  "version": 1,
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
3. If any action sets a navigation/open intent → `shortCircuit = true` → abort remaining rules
4. After all rules: remaining text becomes event title

## Capture group resolution

DSL arguments use `$N` syntax (1-indexed) to reference regex capture groups. Literal strings use quotes (`"value"`). The engine resolves arguments before executing each command.

## Invariants for contributors

- **No logic in payloads.** JSON files contain only regex patterns and DSL command strings. No conditional logic, no computed values.
- **No language-specific code in engine.** The `WEEKDAY_INDEX` lookup table supports multiple languages but the engine itself is language-agnostic — it only executes DSL commands.
- **Short-circuit is final.** Once `SET_INTENT` triggers a navigation/open intent, no further rules are evaluated.
- **Title is the residual.** After all matched substrings are stripped, the remaining whitespace-normalized text is the event title.
- **Payload ordering is the developer's responsibility.** The engine does not sort or reorder rules.

## Integration anchors

- `src/features/nlp/engine.ts` — Core VM, pure function `processNaturalLanguage()`
- `src/features/nlp/types.ts` — All NLP type definitions
- `src/features/nlp/loader.ts` — Payload loading with three-tier resolution
- `src/features/nlp/dispatcher.ts` — Action → plugin API bridge
- `src/features/nlp/NLPCommandModal.ts` — Live preview modal
- `src/features/nlp/registerNLPCommand.ts` — Command palette registration
- `src/features/nlp/payloads/en.json` — English payload (bundled)
- `src/features/nlp/index.ts` — Public module API
