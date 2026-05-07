# FCR Command — Natural Language Orchestrator

The **FCR Command** is your single point of control for Full Calendar Remastered. Open it from the **Command Palette** (`Ctrl/Cmd + P → "FCR Command"`) and use natural language to do anything: create events, navigate views, open settings, sync data, and more.

---

## How It Works

1. Open the Command Palette (`Ctrl/Cmd + P`)
2. Search for **FCR Command**
3. Type any command in natural language
4. A **live preview** shows exactly what will happen before you hit **Run**
5. Press **Enter** or click **Run** to execute

---

## Everything You Can Do

### 📅 Create Events

| What you type | What happens |
|---|---|
| `Team standup tomorrow at 9 am` | Creates "Team standup" tomorrow at 9:00 AM |
| `next tuesday at 4:30 pm Sprint review` | Creates "Sprint review" next Tuesday at 4:30 PM |
| `in 3 hours Deploy release` | Creates "Deploy release" 3 hours from now |
| `in 30 minutes Break` | Creates "Break" 30 minutes from now |
| `day after tomorrow Workshop` | Creates "Workshop" two days from now |
| `Matthews 2 in daily1` | Creates "Matthews 2" in the "daily1" calendar (smart match) |
| `Meeting in Work calendar` | Creates "Meeting" in the "Work" calendar (explicit match) |
| `every monday Standup at 9 am` | Creates recurring "Standup" every Monday |
| `daily Standup` | Creates "Standup" repeating every day |
| `new event tomorrow Dentist` | Strips "new event" prefix, creates "Dentist" tomorrow |

### 🧭 Navigate Views

| What you type | What happens |
|---|---|
| `open weekly view` | Switches to the week view |
| `show month view` | Switches to the month view |
| `view day view` | Switches to the day view |
| `open calendar` | Opens the main calendar tab |
| `open sidebar` | Opens the calendar sidebar |

### 📆 Go to Date

| What you type | What happens |
|---|---|
| `go to tomorrow` | Navigates the calendar to tomorrow's date |
| `goto next tuesday` | Navigates to next Tuesday |
| `jump to next week` | Navigates 7 days forward |

### ⚙️ Plugin Orchestration

| What you type | What happens |
|---|---|
| `open settings` | Opens Full Calendar settings tab |
| `open chrono` / `show analyser` | Opens the Chrono Analyser dashboard |
| `show changelog` / `show whats new` | Displays the changelog |
| `reset cache` / `clear event cache` | Clears and rebuilds the event cache |
| `refresh calendars` / `revalidate remote calendars` | Resyncs all remote calendars |
| `sync activitywatch` / `sync aw` | Pulls latest data from ActivityWatch |

---

## Smart Calendar Matching

When you type `in <name>` at the end of your input, the system checks if `<name>` matches any of your configured calendars (case-insensitive). If it does, the event is routed to that calendar and the `in <name>` is stripped from the title.

> **Input:** `Tomorrow at 4pm Matthews 2 in daily1`
>
> - If `daily1` is a calendar → Title = "Matthews 2", Calendar = "daily1"
> - If `daily1` is NOT a calendar → Title = "Matthews 2 in daily1" (left as-is)

You can also use the explicit form `in Work calendar` which always works regardless of name matching.

---

## Time References

| Phrase | Meaning |
|---|---|
| `at 4 pm` / `at 4:30 pm` | Sets time to 4:00 PM / 4:30 PM |
| `at 12 am` | Midnight (00:00) |
| `at 12 pm` | Noon (12:00) |
| `at noon` | 12:00 PM |
| `at midnight` | 12:00 AM |

## Date References

| Phrase | Meaning |
|---|---|
| `today` | Today's date |
| `tomorrow` | Tomorrow's date |
| `yesterday` | Yesterday's date |
| `day after tomorrow` | Two days from now |
| `next tuesday` | The upcoming Tuesday (wraps to following week if needed) |
| `next week` | 7 days from now |
| `next month` | 30 days from now |
| `in 3 days` | 3 days from now |
| `in 2 weeks` | 14 days from now |

---

## Combining Phrases

You can combine multiple phrases in a single input. The engine processes them left-to-right and strips matched fragments, leaving the remainder as the event title:

> **Input:** `next tuesday at 4 pm Team sync in Work calendar`
>
> **Result:** Title = "Team sync", Date = next Tuesday, Time = 4:00 PM, Calendar = "Work"

---

## Supported Languages

The FCR Command follows the same internationalization pipeline as the rest of the plugin:

- English (`en`), French (`fr`), German (`de`), Spanish (`es`), Italian (`it`)

The language is automatically detected from your Obsidian language setting. Non-English payloads are fetched on first use and cached locally.

---

## Tips

- **Title placement**: Put the event title anywhere — the engine strips matched patterns and uses whatever's left
- **Live preview is your safety net**: Always check the preview card before running — it shows exactly what will happen
- **"in" calendar smart matching**: Type `in <calendar_name>` at the end without needing to write "calendar"
- **No match is safe**: If the engine doesn't recognize any patterns, the entire input becomes the event title
- **Rollover works**: "in 3 hours" at 10 PM correctly creates at 1 AM the next day

---

## Troubleshooting

- **Command not found**: Make sure the plugin is up to date. Search for "FCR Command" in the command palette
- **Wrong date**: "next \<weekday\>" always advances forward, never backward. "Next Wednesday" on a Wednesday means one week later
- **Phrase conflicts**: Rules are ordered by specificity — "in 3 hours" will not accidentally match "in Work calendar"
- **Calendar not matched**: Smart matching is case-insensitive. Check that the name exactly matches your calendar's display name in settings
