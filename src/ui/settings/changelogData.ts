// src/ui/changelogData.ts

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
    version: '0.11.6',
    changes: [
      {
        type: 'new',
        title: 'Advanced categorization with hierarchical timeline view',
        description:
          'Events can now be organized by categories and sub-categories in a new resource timeline view. Expandable groups and aggregated parent rows make it easier to manage complex schedules.'
      },
      {
        type: 'new',
        title: 'License update',
        description:
          'The plugin license has been updated to GPLv3 to comply with FullCalendar requirements.'
      },
      {
        type: 'improvement',
        title: 'Cleaner UI and initial view options',
        description:
          'The event modal and settings UI have been polished with dropdown options and a new initial view setting that supports the timeline view.'
      },
      {
        type: 'improvement',
        title: 'Smarter event titles and filenames',
        description:
          'Events now display clearer titles (e.g., "SubCategory - Event Name") while keeping filenames and internal data consistent.'
      }
    ]
  },

  {
    version: '0.11.5-beta',
    changes: [
      {
        type: 'new',
        title: 'Monthly and yearly recurring events',
        description:
          'You can now create events that repeat every month or every year — perfect for anniversaries, billing cycles, or annual planning.'
      },
      {
        type: 'new',
        title: 'Repeats dropdown in event modal',
        description:
          'Replaced the old recurring checkbox with a dropdown menu for choosing none, weekly, monthly, or yearly recurrence, with context-aware controls.'
      },
      {
        type: 'improvement',
        title: 'Descriptive filenames for recurring notes',
        description:
          'Recurring events now generate clean, readable filenames like "(Every month on the 15th) My Event.md".'
      },
      {
        type: 'improvement',
        title: 'Improved timezone and all-day support',
        description:
          'Timezone handling for recurring events has been refined, and all-day recurring events now display correctly.'
      },
      {
        type: 'fix',
        title: 'Right-click toggle for recurring tasks',
        description:
          'Recurring tasks can now be marked complete via right-click, just like one-time tasks.'
      }
    ]
  },
  {
    version: '0.11.4',
    changes: [
      {
        type: 'new',
        title: 'Smarter recurring events and tasks',
        description:
          'Recurring events can now be edited per-instance — drag, resize, or complete a task without affecting the whole series. Changes are reversible and tracked cleanly.'
      },
      {
        type: 'improvement',
        title: 'Safe deletion with confirmation options',
        description:
          'Deleting a recurring event now asks whether to remove just one instance, the entire series, or promote existing edits to standalone events.'
      },
      {
        type: 'improvement',
        title: 'Better task behavior for repeating events',
        description:
          'Recurring tasks now behave just like regular ones — you can check them off individually, and they show up correctly in the calendar.'
      },
      {
        type: 'fix',
        title: 'Multiday allday events fix by @yalikebaz',
        description:
          'Multiday allday events made inclusive for local calenders. Thanks to @yalikebaz for the fix!'
      },
      {
        type: 'fix',
        title: 'Performance and architecture improvements',
        description:
          'Refactored recurring event logic, improved performance on large calendars, and cleaned up the plugin architecture to prepare for future features.'
      }
    ]
  },
  {
    version: '0.11.3', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Insights engine has smarter dashboard with personas',
        description:
          'Adding persona (predefined rules like "Productivity", "Routine") to categories in insight config setting now cater to more powerful analysis.'
      },
      {
        type: 'fix',
        title: 'Insights panel and dashboard bugfixes',
        description: 'Multiple bugfixes and UI adjustments focused on the insights panel.'
      }
    ]
  },
  {
    version: '0.11.2', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Insights engine in ChronoAnalyser',
        description:
          'New intelligent engine that can analyse your calender for past events and give you cool insights.'
      },
      {
        type: 'improvement',
        title: 'Redesigned ChronoAnalyser UI/UX',
        description:
          'ChronoAnalyser now much more elegant. Check it using the `Analysis` button in the Full-Calendar window.'
      },
      {
        type: 'fix',
        title: 'Multiple bugfixes in ChronoAnalyser',
        description:
          'Make ChronoAnalyser more stable and reliable. Plotting and insights now work more reliably.'
      }
    ]
  },
  {
    version: '0.11.1', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Category coloring engine and settings UI',
        description:
          "A new optional setting, 'Enable Category Coloring,' allows you to color events based on a category defined in the event's title (e.g., 'Work - Project Meeting'). This overrides the default calendar color for fine-grained visual organization."
      },
      {
        type: 'new',
        title: 'Category-aware event modal',
        description:
          "The edit/create event modal now features a dedicated 'Category' input field. It provides intelligent autocomplete suggestions based on all your previously used categories, making categorization fast and consistent."
      },
      {
        type: 'improvement',
        title: 'Redesigned event modal UI/UX',
        description:
          'The edit/create event modal has been completely redesigned with a polished two-column layout, logical grouping of fields, and a dedicated footer for actions, improving clarity and ergonomics.'
      },
      {
        type: 'improvement',
        title: 'Color palette enhancements',
        description:
          'Colors no longer defaults to black, but is now rotated from a carefully choosen palette.'
      },
      {
        type: 'improvement',
        title: '"Open note" workflow enhancement',
        description:
          "Clicking 'Open Note' in the modal now opens the note in a split view, improving calendar-note navigation."
      }
    ]
  },
  {
    version: '0.10.13-beta', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'improvement',
        title: 'Robust timezone support',
        description:
          'Events from local and remote calendars are now fully timezone-aware, fixing bugs related to DST and travel.'
      },
      {
        type: 'new',
        title: 'Strict timezone mode for daily notes',
        description:
          'A new setting allows users to anchor daily note events to a specific timezone, just like regular notes.'
      },
      {
        type: 'fix',
        title: 'Correctly parse UTC events from ICS feeds',
        description:
          'Fixed a critical bug where events specified in UTC from Google Calendar and other sources would appear at the wrong time.'
      }
    ]
  },
  {
    version: '0.10.8',
    changes: [
      {
        type: 'new',
        title: 'ChronoAnalyser released',
        description:
          'ChronoAnalyser can now analyse you time spending! Check the new `Analysis` button in the Full-Calendar window.'
      }
    ]
  },
  {
    version: '0.10.7',
    changes: [
      {
        type: 'new',
        title: 'Initial plugin release',
        description: 'Welcome to the first version of the enhanced Full Calendar!'
      }
    ]
  }
];
