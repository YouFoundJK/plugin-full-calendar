// src/ui/changelogs/changelogData.ts

export interface Change {
  type: 'new' | 'fix' | 'improvement';
  title: string;
  description: string;
}

export interface Version {
  version: string;
  changes: Change[];
}

// Add new versions to the TOP of this array.
export const changelogData: Version[] = [
  {
    version: '0.13.0',
    changes: [
      {
        type: 'new',
        title: 'Natural language processing (NLP)',
        description:
          'RECOMMENDED: Introducing [NLP](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/nlp/) for keyboard free orchestration.'
      },
      {
        type: 'new',
        title: 'Outlook Integration',
        description:
          'Added Outlook integration with full recurrence support and improved frontmatter/metadata handling. ([#259](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/259))'
      },
      {
        type: 'new',
        title: 'Major Feature Expansions',
        description:
          'Introduced a new [Milestones](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/milestones/) system, [TaskNotes integration](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/tasknotes/), and comprehensive Calendar [API](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/settings/api/) & Cache refactoring'
      },
      {
        type: 'improvement',
        title: 'i18n and Documentation',
        description:
          'Added Chinese (zh) localization and restructured the documentation suite for better navigation. ([#246](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/246))'
      },
      {
        type: 'improvement',
        title: 'Tasks Plugin Enhancements',
        description:
          'Added Day Planner format support, 24h time prefix serialization, deduplication for mirrored tasks, and fuzzy search in the tasks backlog.'
      },
      {
        type: 'fix',
        title: 'CalDAV & Event fixes',
        description:
          'Hardened mobile CalDAV authentication, improved import UX diagnostics, and resolved DailyNote UID collisions on move. Converting all-day to timed events now defaults to 1-hour duration.'
      }
    ]
  },
  {
    version: '0.12.9',
    changes: [
      {
        type: 'new',
        title: 'ActivityWatch sync',
        description:
          'Added a dedicated ActivityWatch sync engine with continuity-aware ingestion, auto-sync scheduling, and title templating.'
      },
      {
        type: 'improvement',
        title: 'Tasks integrations',
        description:
          'Checkout [Tasks Integration docs](https://youfoundjk.github.io/plugin-full-calendar/user/calendars/tasks-plugin-integration/). Expanded Tasks backlog and display settings, plus payload handling and workflow improvements. ([#142](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/142), [#166](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/166), [#175](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/175))'
      },
      {
        type: 'improvement',
        title: 'Core sync identity',
        description:
          'Switched sync handling to keyed identity diffs with reverse lookup maps and safer continuity replacement to reduce churn and duplicate blocks.'
      },
      {
        type: 'improvement',
        title: 'Settings and calendar UX',
        description:
          'Updated settings navigation, calendar interactions, search behavior, and mobile responsiveness.'
      },
      {
        type: 'fix',
        title: 'Build, docs, and i18n',
        description:
          'Reduced startup and bundle overhead, refreshed locale loading, and added ActivityWatch architecture documentation.'
      }
    ]
  },
  {
    version: '0.12.8',
    changes: [
      {
        type: 'new',
        title: 'Tasks Time Features',
        description:
          'Tasks can now have an optional time block. Drag and drop a task to a specific time or back to all-day to update it. (#227)'
      },
      {
        type: 'new',
        title: 'CalDAV enhancements',
        description:
          'Auto-fetch calendar name and color when importing, validate collection. (#230)'
      },
      {
        type: 'improvement',
        title: 'Advanced Categorization',
        description:
          'Robust advanced categorization workflows and modal UX. Added "Disable without cleanup" option. (#222, #231)'
      },
      {
        type: 'improvement',
        title: 'Robust Timezone Handling',
        description:
          'Prevent RRULE TZID one-day date shift in recurrence expansion (#194) and prevent timezone shift for all-day date-only events. (#223, #231)'
      },
      {
        type: 'fix',
        title: 'Provider Sync & Remote Payloads',
        description:
          'Refactored file delete handling during rename races. (#224) Hardened CalDAV payload parsing for null-body and malformed XML. (#218)'
      },
      {
        type: 'fix',
        title: 'Localization & Mobile UI',
        description:
          'Updated UI responsiveness on desktop & mobile. Workspace filters now display user-defined calendar names. Updated ES/FR/IT translations.'
      }
    ]
  },
  {
    version: '0.12.7.1',
    changes: [
      {
        type: 'new',
        title: 'Local ICS Support',
        description: 'You can now view `.ics` files stored directly in your Obsidian vault!'
      },
      {
        type: 'improvement',
        title: 'Timezone & DST Hardening',
        description:
          'The timezone pipeline has been completely rewritten and hardened to properly handle recurring events crossing Daylight Saving Time boundaries, and complex EU/US transit scenarios without drifting. Removed luxon dependency.'
      },
      {
        type: 'improvement',
        title: 'Staged Loading Architecture viz v0.12.7.1',
        description:
          'Dramatic startup performance improvements (5x in [selective audit](https://youfoundjk.github.io/plugin-full-calendar/changelog/#version-01271)). Providers now quickly load a 3-month window surrounding the current date first, then quietly load your full calendar history in the background.'
      },
      {
        type: 'improvement',
        title: 'Codebase Linting & Safety',
        description:
          'Migrated to ESLint 9 and native obsidianmd rules. Eliminated unsafe casting and improved the UI responsiveness by wrapping unhandled background promises.'
      },
      {
        type: 'fix',
        title: 'UI Fixes and LiveSync Compatibility',
        description:
          'Improved mobile responsiveness across various views. Fixed UI injection conflicts with the Self-Hosted LiveSync plugin.'
      }
    ]
  }
];
