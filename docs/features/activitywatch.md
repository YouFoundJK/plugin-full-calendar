# ActivityWatch Integration: Best-Fit Engine

Full Calendar integrates deeply with [ActivityWatch](https://activitywatch.net/), enabling you to transform granular, noisy computer usage timelines into beautiful, semantic intent-based calendar blocks natively inside Obsidian.

The engine uses a deeply mathematical **Best-Fit Finite State Machine (FSM)**. Instead of mapping one event to one block, it evaluates your timeline using "Context Profiles" to generate optimal sessions that reflect what you were *actually* doing, automatically filtering out minor distractions.

---

## 1. Context Profiles

Instead of simple mapping rules, you create **Context Profiles**. Each profile represents an "Intent" (e.g., "Study", "Gaming", "Coding").

### Settings

| Setting | Description |
|---|---|
| **Profile Name** | Identifier for this profile. Becomes the sub-category label on the calendar block. |
| **Category (Color)** | The color tag applied to the block in Full Calendar (maps to your existing Category Colors). |
| **Activation Threshold (Mins)** | The minimum accumulated matching time required before a session "locks in." If you match for 8 minutes and stop, but your threshold is 10, it will not appear on the calendar. |
| **Soft Break Limit (Mins)** | The hysteresis buffer. Dictates how long you can be *mismatching* (e.g. checking Twitter, a bathroom break, or going AFK) before the session is formally terminated. Return to a matching app before this limit expires and the session continues seamlessly. |
| **Title Template** | The template string for the calendar block title (see [Section 4](#4-dynamic-title-templating)). |

---

## 2. Granular Rules (Primary, Supporting, Hard Break)

You define exactly what drives a Profile using fine-grained nested rules.

*   **Primary Evidence Rules**: Strong evidence. If any rule matches, the timeline slice is a **primary match**. Primary matches can start warmup, contribute to activation threshold, and sustain active sessions.
*   **Supporting Evidence Rules**: Continuity evidence. If any rule matches, the timeline slice is a **supporting match**. Supporting matches can sustain warmup/active sessions but cannot start from idle, and do not contribute to activation threshold.
*   **Hard Break Rules**: If any rule matches, it **immediately terminates** the warmup/active session, completely bypassing the soft break limit.

Priority is always: **Hard Break > Primary Match > Supporting Match > Mismatch**.

### Constructing a Rule

When adding a rule, you specify a **Bucket**, **Field**, and **Pattern**. The UI provides native autocomplete dropdowns for standard ActivityWatch buckets:

| Shorthand | Maps To | Description |
|---|---|---|
| `window` | `aw-watcher-window` | Tracks the active window title and application name |
| `web` | `aw-watcher-web` | Tracks browser tabs via the AW browser extension |
| `afk` | `aw-watcher-afk` | Tracks idle/active status based on mouse and keyboard activity |

You can also type any custom bucket name for third-party watchers.

#### Fields

Once a bucket is selected, you must select the JSON key from the watcher payload. Common fields include:

| Bucket | Available Fields |
|---|---|
| **window** | `app`, `title` |
| **web** | `url`, `title`, `audible` |
| **afk** | `status` |

#### Pattern Matching

You then apply either a **literal string search** or enable **Regex** for more powerful matching:

*   **Literal**: Case-insensitive substring match. Pattern `obsidian` will match `Obsidian.exe - My Vault`.
*   **Regex**: Full regex with the `i` (case-insensitive) flag applied automatically. Pattern `Code|Antigravity` will match both `Code.exe` and `Antigravity.exe`.

!!! tip "All matching is case-insensitive"
    You don't need to worry about casing. `YouTube`, `youtube`, and `YOUTUBE` are all equivalent in both regex and literal modes. Bucket types and field names are also resolved case-insensitively.

---

## 3. How The Engine Works

The engine processes your ActivityWatch data through a 3-phase pipeline.

### Phase 0: Sweep-Line Splintering

Raw ActivityWatch events from multiple buckets (window, web, AFK) frequently overlap in time. The engine first flattens these into a single, non-overlapping timeline using a **sweep-line algorithm**.

When events overlap, the highest-fidelity source wins:

| Priority | Source | Rationale |
|---|---|---|
| **Highest (3)** | `aw-watcher-afk` | Ground truth — if you're AFK, that overrides whatever window was open |
| **Medium (2)** | `aw-watcher-web` | More specific than window — shows the actual tab URL, not just "Chrome" |
| **Base (1)** | `aw-watcher-window` | Least specific — just the application and window title |

!!! note "AFK Integration"
    The engine automatically pulls AFK watcher data. Only **true AFK periods** (status = "afk") are injected into the timeline. "Not-AFK" events are filtered out so they don't overwrite useful window/web data.

Adjacent splinters with identical data are merged to reduce noise.

### Phase 1: Hypothesis Generation (The FSM)

For each Context Profile, the engine walks through the splintered timeline using a **3-state Finite State Machine**:

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Warmup : Primary match
    Idle --> Idle : Supporting / Mismatch / Hard break
    Warmup --> Active : primaryTargetTime >= threshold
    Warmup --> Warmup : Primary match (target++)
    Warmup --> Warmup : Supporting match (buffer reset)
    Warmup --> Warmup : Mismatch (within softBreak)
    Warmup --> Idle : bufferTime > softBreak
    Warmup --> Idle : Hard break
    Active --> Active : Primary match (buffer reset)
    Active --> Active : Supporting match (buffer reset)
    Active --> Active : Mismatch (within softBreak)
    Active --> Idle : bufferTime > softBreak → commit
    Active --> Idle : Hard break → commit
```

**States:**

| State | Description |
|---|---|
| **Idle** | No session in progress. Waiting for a **primary** matching event. |
| **Warmup** | A match has started but hasn't yet accumulated enough time to meet the activation threshold. |
| **Active** | The session has met the threshold and is "locked in." It will be committed to the calendar when the session ends. |

**Key behaviors:**

*   **Gap Detection**: Chronological gaps between events (where ActivityWatch simply has no data) are counted as buffer time. If the accumulated gap + mismatch time exceeds the soft break limit, the session ends.
*   **Primary vs Supporting Accounting**: Only primary matches increase activation threshold time. Supporting matches keep continuity but do not help activate a session.
*   **AFK Is Profile-Defined**: AFK can be treated as supporting evidence (recommended for passive tasks like video watching), or left as mismatch. AFK is only a hard break if you explicitly configure it as one.
*   **Session Trimming**: When a session is committed, it ends at the timestamp of the **last evidence event** (primary or supporting), not at trailing mismatches. If you code until 23:08, remain AFK as supporting evidence to 23:15, then mismatch, the session is booked through 23:15.

### Phase 2: Greedy Best-Fit Allocation

Because multiple profiles can match the same time window (e.g., using Obsidian might match both "Coding" and "PhD Study"), the engine resolves conflicts predictably:

1.  **Fitness Scoring**: Each candidate session gets a `fitness_score` equal to the total milliseconds that matched **primary evidence** during that block.
2.  **Greedy Allocation**: Candidates are sorted globally by fitness score (descending). The highest-fitness block claims its time first.
3.  **Geometric Subtraction**: Lower-fitness blocks that overlap with already-booked blocks are geometrically trimmed. If the overlap is total, the weaker block is dropped.
4.  **Sub-Chunking**: If trimming leaves a surviving fragment that still meets the `activationThresholdMins`, it is preserved as an independent calendar block.

!!! example "Conflict Resolution Example"
    You have two profiles: **Coding** (Obsidian + VSCode + Browser) and **PhD** (Obsidian + Zotero + Browser). Your workflow: Obsidian (5 min) → Browser (10 min) → Zotero (12 min) → AFK.

    - **Coding** fitness: 5 + 10 = 15 minutes of matching
    - **PhD** fitness: 5 + 10 + 12 = 27 minutes of matching

    PhD wins. It claims 0→27m. Coding's 0→15m candidate is fully swallowed and dropped. Result: a single "PhD" block from 0:00 to 0:27.

---

## 4. Dynamic Title Templating

You do not need to manually name your calendar blocks. Inject the actual metadata from the underlying ActivityWatch event directly into the block title using `{brackets}`.

**Template**: `Coding - {app}`

If the session spanned multiple events, the engine calculates the **majority payload** from primary-evidence splinters first, then falls back to all splinters if needed. The data active for the longest total duration is used for template substitution.

Result: `Coding - Code.exe` (or whatever `app` name VSCode reports).

Available template variables depend on the watcher data. Common ones:

| Variable | Source | Example |
|---|---|---|
| `{app}` | Window watcher | `Obsidian.exe`, `Code.exe` |
| `{title}` | Window watcher | `main.ts - plugin-full-calendar` |
| `{url}` | Web watcher | `https://github.com/...` |

---

## 5. Sync Strategy

| Strategy | Description |
|---|---|
| **Sync from Last Checked** | Automatically pulls all new data since the last sync. Good for ongoing use. |
| **Custom Date Range** | Manually specify a start and end date. Useful for backfilling past data or testing. |

!!! warning "Custom Date Range"
    Ensure the start and end dates are different. Setting both to the same date results in a zero-width time window and no events will be fetched.
