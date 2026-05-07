# Natural Language Quick Add

Full Calendar supports creating events and navigating views using plain English (or your configured language). Open the **Command Palette** and search for **"Quick add event (Natural Language)"** to launch the Quick Add modal.

---

## How It Works

1. Open the Command Palette (`Ctrl/Cmd + P`)
2. Search for **Quick add event**
3. Type a natural language phrase in the input field
4. A **live preview** shows exactly what will happen — the parsed date, time, title, target calendar, and intent
5. Press **Enter** or click **Add** to confirm

The modal pre-fills the standard event creation form, so you can review and adjust before saving.

---

## Supported Phrases

### Event Creation

| What you type | What happens |
|---|---|
| `Team standup tomorrow at 9 am` | Creates "Team standup" on tomorrow's date at 9:00 AM |
| `next tuesday at 4:30 pm Sprint review` | Creates "Sprint review" on the next Tuesday at 4:30 PM |
| `in 3 hours Deploy release` | Creates "Deploy release" 3 hours from now |
| `in 30 minutes Break` | Creates "Break" 30 minutes from now |
| `day after tomorrow Workshop` | Creates "Workshop" two days from now |
| `Meeting in Work calendar` | Creates "Meeting" targeting the "Work" calendar |
| `every monday Standup at 9 am` | Creates recurring "Standup" every Monday at 9 AM |
| `daily Standup` | Creates "Standup" repeating every day |

### Navigation

| What you type | What happens |
|---|---|
| `open weekly view` | Navigates to the week view |
| `show month view` | Navigates to the month view |
| `view day view` | Navigates to the day view |
| `open calendar` | Opens the main calendar tab |
| `open sidebar` | Opens the calendar sidebar |

### Time References

| Phrase | Meaning |
|---|---|
| `at 4 pm` / `at 4:30 pm` | Sets time to 4:00 PM / 4:30 PM |
| `at 12 am` | Midnight (00:00) |
| `at 12 pm` | Noon (12:00) |
| `at noon` | 12:00 PM |
| `at midnight` | 12:00 AM |

### Date References

| Phrase | Meaning |
|---|---|
| `today` | Today's date |
| `tomorrow` | Tomorrow's date |
| `yesterday` | Yesterday's date |
| `day after tomorrow` | Two days from now |
| `next tuesday` | The upcoming Tuesday (wraps to the following week if needed) |
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

The NLP engine follows the same internationalization pipeline as the rest of the plugin:

- English (`en`)
- French (`fr`)
- German (`de`)
- Spanish (`es`)
- Italian (`it`)

The language is automatically detected from your Obsidian language setting. Non-English payloads are fetched on first use and cached locally.

---

## Tips

- **Title placement**: Put the event title anywhere in the phrase — the engine strips matched patterns and uses whatever's left
- **Calendar targeting**: Use `in <name> calendar` to route to a specific calendar. If the name doesn't match any calendar, the first writable calendar is used
- **No match is safe**: If the engine doesn't recognize any patterns, the entire input becomes the event title with today's date (all-day)
- **Live preview**: Always check the preview card before submitting — it shows exactly what will be created

---

## Troubleshooting

- **Command not found**: Make sure the plugin is up to date. The command is registered as "Quick add event (Natural Language)"
- **Wrong date calculated**: The "next \<weekday\>" logic always advances forward, never backward. "Next Wednesday" on a Wednesday means one week later
- **Time rollover**: "in 3 hours" at 10 PM correctly creates an event at 1 AM the next day
- **Phrase conflicts**: Rules are ordered by specificity. "in 3 hours" will not accidentally match "in Work calendar"
