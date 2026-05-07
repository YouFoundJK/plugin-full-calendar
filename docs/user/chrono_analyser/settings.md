# Chrono Analyser Settings

!!! abstract "Philosophy"
    Configure the intelligence of your dashboard. Chrono Analyser uses a rule-based system to categorize your historical data into meaningful "Insight Groups."

## Accessing Configuration

To configure the analyser, open the **[Chrono Analyser Dashboard](introduction.md)** and click the `⚙️` (Settings) icon in the **Proactive Insights** panel.

## Insight Groups

Insight Groups are the foundation of your analysis. You can create groups like "Work," "Wellness," or "Learning."

### Rule Parameters

For each group, you can define how the engine identifies relevant events:

*   **Persona**: Categorize the group's intent for specialized analysis (e.g., `Productivity` vs `Wellness`).
*   **Hierarchies**: Match against specific **[Categories](../settings/categories.md)** or folder paths.
*   **Projects**: Match against project tags identified in event titles.
*   **Subproject Keywords**: List keywords to include sub-segments of a project.
*   **Muted Projects/Keywords**: Explicitly exclude specific tags or words from this group's totals.

## Data Management

*   **Version Control**: The analyser maintains its own configuration version to ensure compatibility across plugin updates.
*   **Unsaved Changes**: The configuration modal will warn you if you attempt to close it with pending changes. Use the **Save** button to persist your rules to the `chrono_analyser_config` in the **[main plugin settings](../settings/fc_config.md)**.

## Integration with Main Settings

The Chrono Analyser respects your global **[Category Coloring](../settings/categories.md)** toggle. 

*   If **Categories** are enabled, the analyser uses your category list as the available hierarchies. 
*   If **Categories** are disabled, it defaults to using the parent folder names of your **[Full Note Calendars](../calendars/local.md)**.

---

[Introduction](introduction.md) · [Advanced Categorization](../settings/categories.md) · [Back to Index](index.md)
