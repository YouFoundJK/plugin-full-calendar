# What's New in Full Calendar

This page highlights the latest major features and improvements to help you get the most out of the plugin.  
For a detailed version-by-version breakdown, see the [Changelog](changelog.md).

---

## 🎨 Powerful Advanced Categories & Coloring

Supercharge your calendar's organization with Advanced Categories! This new system allows you to override a calendar's default color for specific events based on a category prefix in the event's title. It's the foundation for many powerful features to come.

-   **Universal Organization:** Works for local and remote calendars. An event from Google Calendar titled `Work - Project Deadline` will be colored correctly in Obsidian.
-   **Sub-Categories:** Organize even further with a `Category - SubCategory - Title` format.
-   **Smart Setup:** When you enable the feature, the plugin can automatically categorize your existing events based on their folder structure.
-   **Autocomplete Editor:** The event editor now has a dedicated "Category" field with autocomplete suggestions for all your existing categories, ensuring consistency.

➡️ **[Learn how to set up Advanced Categories](events/categories.md)**

---

## ✨ Recurring Events Reimagined

The entire recurring event system has been rebuilt from the ground up to be more powerful, intuitive, and safe.

- **Per-Instance Editing:** Drag, resize, or rename a single occurrence of a recurring event without affecting the entire series. The plugin automatically creates a smart "override" that is linked to the parent.
- **Recurring Tasks That Work:** Check off a single instance of a recurring task as "done." It will be crossed out for that day only, leaving future occurrences ready for action.
- **Safe Deletion:** When deleting a recurring event, you'll now be asked whether you want to delete just that one instance, or the entire series (including any overrides you've made).

➡️ **[Learn more about Recurring Events & Overrides](events/recurring.md)**

---

## 🧠 Chrono Analyser Dashboard

Unlock powerful insights into your time with Chrono Analyser! Chrono Analyser is a built-in dashboard that transforms your calendar events into actionable analytics.

- **Proactive Insights Engine:** Automatically analyzes your calendar history and highlights trends, habits, and summaries.
- **Interactive Charting:** Explore your data visually with pie, sunburst, time-series, and activity pattern charts.
- **Persona & Group Analysis:** Create custom insight groups (e.g., "Productivity", "Routine") for tailored analysis.
- **All Sources Supported:** Works with Full Note, Daily Note, Google Calendar, CalDAV, and ICS calendars.
- **Real-Time Filtering:** Instantly filter by category, project, or date range.

➡️ **[Learn more about Chrono Analyser](chrono_analyser/introduction.md)**

---

## 🌍 Robust Timezone Support

Travel and collaborate across timezones with confidence. Full Calendar is now fully timezone-aware, ensuring your events always appear at the correct local time, no matter where you are.

-   **Display Timezone:** Set a specific timezone for your calendar view, independent of your system's timezone. Perfect for planning trips or coordinating with remote teams.
-   **Automatic Conversion:** Events from all sources—local notes, daily notes, and remote calendars like Google Calendar—are automatically converted to your chosen display timezone.
-   **DST Safe:** All conversions are Daylight Saving Time aware, so you never have to worry about "fall back" or "spring forward" bugs again.

➡️ **[Read more about Timezone Support](events/timezones.md)**

---

##  🖌️ Redesigned Event Editor

The event editor has been completely redesigned from the ground up for a cleaner, more intuitive experience.

-   **Two-Column Layout:** A polished layout makes it easier to find and edit the fields you need.
-   **Logical Grouping:** Date, time, and recurrence options are logically grouped for faster editing.
-   **Dedicated Actions:** Buttons for Save, Delete, and Open Note are neatly organized in the footer.