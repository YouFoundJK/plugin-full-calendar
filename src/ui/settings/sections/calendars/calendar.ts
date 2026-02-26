/**
 * @file calendar.ts
 * @brief A wrapper for initializing and rendering the FullCalendar.js library.
 *
 * @description
 * This file provides the `renderCalendar` function, which is a factory for
 * creating a `Calendar` instance from the `@fullcalendar/core` library. It
 * encapsulates all the configuration and boilerplate needed to set up the
 * calendar, including plugins, views, toolbar settings, and interaction
 * callbacks.
 *
 * @exports renderCalendar
 *
 * @license See LICENSE.md
 */

import type {
  Calendar,
  EventApi,
  EventClickArg,
  EventHoveringArg,
  EventSourceInput
} from '@fullcalendar/core';

import { Menu } from 'obsidian';
import type { PluginDef } from '@fullcalendar/core';
import { createDateNavigation } from '../../../../features/navigation/DateNavigation';

// Store the truly-original rrule expand function so we never wrap our own patch.
let _originalRRuleExpand: any = null;

// Minimal shape for the rrule plugin we monkeypatch.
interface RRuleDateEnvLike {
  toDate: (input: Date | string | number) => Date;
}

interface RRuleFrameRange {
  start: Date | string | number;
  end: Date | string | number;
}

interface RRuleSetLike {
  tzid: () => string | null | undefined;
}

interface RRuleExpandData {
  rruleSet: RRuleSetLike;
}

interface RRulePluginLike {
  recurringTypes: { expand: any }[];
}

interface ExtraRenderProps {
  eventClick?: (info: EventClickArg) => void;
  customButtons?: {
    [key: string]: {
      text: string;
      click: (ev?: MouseEvent) => void | Promise<void>;
    };
  };

  select?: (startDate: Date, endDate: Date, allDay: boolean, viewType: string) => Promise<void>;
  modifyEvent?: (event: EventApi, oldEvent: EventApi, newResource?: string) => Promise<boolean>;
  eventMouseEnter?: (info: EventHoveringArg) => void;
  firstDay?: number;
  initialView?: { desktop: string; mobile: string };
  timeFormat24h?: boolean;
  openContextMenuForEvent?: (event: EventApi, mouseEvent: MouseEvent) => Promise<void>;
  toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
  dateRightClick?: (date: Date, mouseEvent: MouseEvent) => void;
  viewRightClick?: (mouseEvent: MouseEvent, calendar: Calendar) => void;
  forceNarrow?: boolean;
  resources?: { id: string; title: string; eventColor?: string }[];
  onViewChange?: () => void; // Add view change callback
  businessHours?: boolean | object; // Support for business hours
  drop?: (taskId: string, date: Date) => Promise<void>; // Drag-and-drop from backlog
  timeZone?: string;

  // New granular view configuration properties
  slotMinTime?: string;
  slotMaxTime?: string;
  weekends?: boolean;
  hiddenDays?: number[];
  dayMaxEvents?: number | boolean;
}

export async function renderCalendar(
  containerEl: HTMLElement,
  eventSources: EventSourceInput[],
  settings?: ExtraRenderProps & { enableAdvancedCategorization?: boolean }
): Promise<Calendar> {
  // Lazy-load FullCalendar core and plugins only when rendering
  const [core, list, rrule, daygrid, timegrid, interaction, luxon] = await Promise.all([
    import('@fullcalendar/core'),
    import('@fullcalendar/list'),
    import('@fullcalendar/rrule'),
    import('@fullcalendar/daygrid'),
    import('@fullcalendar/timegrid'),
    import('@fullcalendar/interaction'),
    import('@fullcalendar/luxon3')
  ]);

  // Optionally load scheduler plugin only when needed
  const showResourceViews = !!settings?.enableAdvancedCategorization;
  const resourceTimeline = showResourceViews
    ? await import('@fullcalendar/resource-timeline')
    : null;

  const isMobile = window.innerWidth < 500;
  const isNarrow = settings?.forceNarrow || isMobile;

  // Apply RRULE monkeypatch on every render to capture the latest settings.timeZone.
  // We store the truly-original expand function in a module-level variable to prevent
  // recursive wrapping (each render would otherwise capture the already-patched version).
  {
    const rrulePlugin =
      (rrule as unknown as { default?: RRulePluginLike }).default ||
      (rrule as unknown as RRulePluginLike);

    // Save the truly original expand function ONCE
    if (!_originalRRuleExpand) {
      _originalRRuleExpand = rrulePlugin.recurringTypes[0].expand;
    }
    const trueOriginalExpand = _originalRRuleExpand;

    rrulePlugin.recurringTypes[0].expand = function (
      errd: RRuleExpandData,
      fr: RRuleFrameRange,
      de: RRuleDateEnvLike
    ) {
      const tzid = errd.rruleSet.tzid();

      if (tzid && settings?.timeZone) {
        // Evaluate the raw date representations natively using the original rrule expansion.
        const result = trueOriginalExpand.call(this, errd, fr, de);

        const { DateTime } = require('luxon');

        return result.map((d: Date) => {
          // MATHEMATICAL PROOF OF EXTRACTION:
          // 1. `rrule.js` parses strings like "11:00" and strictly stores them in the UTC fields of `_dtstart`.
          //    So `_dtstart.getUTCHours()` perfectly equals the literal string "11".
          // 2. `rrule.js` computes recurrences (`d`) by locking the browser's *local* hour at parsing time.
          //    This causes the UTC representation of `d` to drift across midnight on DST boundaries!
          // 3. To safely recover the exact sequence without midnight drift, we MUST read the year/month/day
          //    from the local fields of `d` (since `rrule` aligns local days), and we MUST read the hour/min/sec
          //    from the UTC fields of `_dtstart` (since it captures the literal string offset-free).

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rruleObj = errd.rruleSet as any;
          const baseHour = rruleObj._dtstart ? rruleObj._dtstart.getUTCHours() : d.getUTCHours();
          const baseMinute = rruleObj._dtstart
            ? rruleObj._dtstart.getUTCMinutes()
            : d.getUTCMinutes();
          const baseSecond = rruleObj._dtstart
            ? rruleObj._dtstart.getUTCSeconds()
            : d.getUTCSeconds();

          console.log(
            '[DEBUG ICS rrule patch] original d:',
            d.toISOString(),
            'd_local:',
            d.toString(),
            'tzid:',
            tzid
          );
          console.log('[DEBUG ICS rrule patch] _dtstart: ', rruleObj._dtstart?.toISOString());
          console.log('[DEBUG ICS rrule patch] extracted baseTime:', {
            h: baseHour,
            m: baseMinute,
            s: baseSecond
          });

          // 1. Interpret the theoretically perfect naive fields as wall-clock time in the SOURCE timezone (tzid)
          const sourceDt = DateTime.fromObject(
            {
              year: d.getFullYear(),
              month: d.getMonth() + 1, // luxon months are 1-12
              day: d.getDate(),
              hour: baseHour,
              minute: baseMinute,
              second: baseSecond
            },
            { zone: tzid }
          );

          // 2. Convert to the display timezone natively
          const targetDt = sourceDt.setZone(settings.timeZone!);

          const finalDate = new Date(
            Date.UTC(
              targetDt.year,
              targetDt.month - 1, // Date.UTC months are 0-11
              targetDt.day,
              targetDt.hour,
              targetDt.minute,
              targetDt.second
            )
          );

          console.log(
            '[DEBUG ICS rrule patch] settings.timeZone:',
            settings.timeZone,
            'sourceDt:',
            sourceDt.toISO(),
            'targetDt:',
            targetDt.toISO(),
            'finalDate:',
            finalDate.toISOString(),
            finalDate.toString()
          );

          // 3. Output the required FullCalendar Marker Date (where UTC equals local display time)
          return finalDate;
        });
      }

      // Fallback for floating time events without a strict TZID string
      return trueOriginalExpand.call(this, errd, fr, de);
    };
  }

  const {
    eventClick,
    select,
    modifyEvent,
    eventMouseEnter,
    openContextMenuForEvent,
    toggleTask,
    dateRightClick,
    viewRightClick,
    customButtons,
    resources,
    onViewChange,
    businessHours,
    drop
  } = settings || {};

  // Wrap eventClick to ignore shadow events
  const wrappedEventClick =
    eventClick &&
    ((info: EventClickArg) => {
      // Ignore clicks on shadow events
      if (info.event.extendedProps.isShadow) {
        return;
      }
      return eventClick(info);
    });
  const modifyEventCallback =
    modifyEvent &&
    (({
      event,
      oldEvent,
      revert,
      newResource
    }: {
      event: EventApi;
      oldEvent: EventApi;
      revert: () => void;
      newResource?: { id: string };
    }): void => {
      void (async () => {
        // Extract the string ID from the newResource object
        const success = await modifyEvent(event, oldEvent, newResource?.id);
        if (!success) {
          revert();
        }
      })();
    });

  // Group the standard and timeline views together with a space.
  // This tells FullCalendar to render them as a single, connected button group.
  const viewButtonGroup = ['views', showResourceViews ? 'timeline' : null]
    .filter(Boolean)
    .join(',');

  // Add workspace and navigate buttons to the left side of toolbar when not narrow
  const leftToolbarGroup = !isNarrow
    ? 'workspace prev,next today,navigate'
    : 'prev,next today,navigate';

  // The comma between 'analysis' and the view group creates the visual separation.
  const rightToolbarGroup = [!isNarrow ? 'analysis' : null, viewButtonGroup]
    .filter(Boolean)
    .join(' ');

  const headerToolbar = !isNarrow
    ? {
        left: leftToolbarGroup,
        center: 'title',
        right: rightToolbarGroup
      }
    : false; // On narrow views (including mobile), the header is empty.

  const footerToolbar = isNarrow
    ? {
        left: 'workspace,today,navigate,prev,next',
        right: rightToolbarGroup // Analysis is already filtered out for narrow views.
      }
    : false;

  type ViewSpec = {
    type: string;
    duration?: { days?: number; weeks?: number };
    buttonText: string;
    slotMinWidth?: number;
  };
  const views: Record<string, ViewSpec> = {
    timeGridDay: {
      type: 'timeGrid',
      duration: { days: 1 },
      buttonText: isNarrow ? '1' : 'day'
    },
    timeGrid3Days: {
      type: 'timeGrid',
      duration: { days: 3 },
      buttonText: '3'
    }
  };
  if (showResourceViews) {
    views.resourceTimelineDay = {
      type: 'resourceTimeline',
      duration: { days: 1 },
      buttonText: 'Timeline day'
    };
    views.resourceTimelineWeek = {
      type: 'resourceTimeline',
      duration: { weeks: 1 },
      buttonText: 'Timeline week',
      slotMinWidth: 100
    };
  }

  const customButtonConfig: Record<string, { text: string; click: (ev: MouseEvent) => void }> =
    Object.assign({}, customButtons);

  // Always add the "Views" dropdown
  customButtonConfig.views = {
    text: 'View ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();

      const views = isNarrow
        ? {
            dayGridMonth: 'Month',
            timeGrid3Days: '3 Days',
            timeGridDay: 'Day',
            listWeek: 'List'
          }
        : {
            dayGridMonth: 'Month',
            timeGridWeek: 'Week',
            timeGridDay: 'Day',
            listWeek: 'List'
          };

      for (const [viewName, viewLabel] of Object.entries(views) as [string, string][]) {
        menu.addItem(item =>
          item.setTitle(viewLabel).onClick(() => {
            cal.changeView(viewName);
          })
        );
      }
      menu.showAtMouseEvent(ev);
    }
  };

  // Add the "Navigate" dropdown - will be configured after calendar creation
  customButtonConfig.navigate = {
    text: '▾',
    click: (ev: MouseEvent) => {
      // This will be replaced after calendar creation
    }
  };

  // Conditionally add the "Timeline" dropdown
  if (showResourceViews) {
    customButtonConfig.timeline = {
      text: 'Timeline ▾',
      click: (ev: MouseEvent) => {
        const menu = new Menu();
        menu.addItem(item =>
          item.setTitle('Timeline week').onClick(() => {
            cal.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline day').onClick(() => {
            cal.changeView('resourceTimelineDay');
          })
        );
        menu.showAtMouseEvent(ev);
      }
    };
  }

  // FullCalendar Premium open-source license key (GPLv3 projects)
  // See: https://fullcalendar.io/license for details
  // Narrow dynamic imports to expected shapes without pervasive any usage.
  const CalendarCtor = (core as { Calendar: typeof Calendar }).Calendar;
  const dayGridPlugin = (daygrid as { default: PluginDef }).default;
  const timeGridPlugin = (timegrid as { default: PluginDef }).default;
  const listPlugin = (list as { default: PluginDef }).default;
  const rrulePlugin = (rrule as { default: PluginDef }).default;
  const interactionPlugin = (interaction as { default: PluginDef }).default;
  const luxonPlugin = (luxon as { default: PluginDef }).default;
  const resourceTimelinePlugin = resourceTimeline
    ? (resourceTimeline as { default: PluginDef }).default
    : null;

  const cal = new CalendarCtor(containerEl, {
    // Only include schedulerLicenseKey when resource-timeline plugin is loaded
    ...(showResourceViews && resourceTimelinePlugin
      ? { schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source' }
      : {}),
    customButtons: customButtonConfig,
    timeZone: settings?.timeZone,
    plugins: [
      // View plugins
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      // Only include the heavy scheduler plugin when needed
      ...(showResourceViews && resourceTimelinePlugin
        ? ([resourceTimelinePlugin] as const)
        : ([] as const)),
      // Drag + drop and editing
      interactionPlugin,
      rrulePlugin,
      luxonPlugin
    ],
    initialView:
      settings?.initialView?.[isNarrow ? 'mobile' : 'desktop'] ||
      (isNarrow ? 'timeGrid3Days' : 'timeGridWeek'),
    nowIndicator: true,
    scrollTimeReset: false,
    dayMaxEvents: settings?.dayMaxEvents !== undefined ? settings.dayMaxEvents : true, // Use setting override or default to true
    headerToolbar,
    footerToolbar,
    // Cast at usage point to satisfy FullCalendar without polluting variable with any
    views,
    ...(showResourceViews && {
      resourceAreaHeaderContent: 'Categories',
      resources,
      resourcesInitiallyExpanded: false
    }),

    // Business hours configuration
    ...(businessHours && { businessHours }),

    // Prevent dropping events onto parent category rows
    eventAllow: (dropInfo, draggedEvent) => {
      // dropInfo.resource is the resource that the event is being dropped on
      if (dropInfo.resource?.extendedProps?.isParent) {
        return false; // Disallow drop on parent
      }
      return true; // Allow drop on children (or in non-resource views)
    },

    firstDay: settings?.firstDay,
    // New granular view configuration settings
    ...(settings?.slotMinTime !== undefined && { slotMinTime: settings.slotMinTime }),
    ...(settings?.slotMaxTime !== undefined && { slotMaxTime: settings.slotMaxTime }),
    ...(settings?.weekends !== undefined && { weekends: settings.weekends }),
    ...(settings?.hiddenDays !== undefined && { hiddenDays: settings.hiddenDays }),
    ...(settings?.timeFormat24h && {
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      },
      slotLabelFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      }
    }),
    eventSources,
    eventClick: wrappedEventClick,

    selectable: select && true,
    selectMirror: select && true,
    select:
      select &&
      ((info): void => {
        void (async () => {
          await select(info.start, info.end, info.allDay, info.view.type);
          info.view.calendar.unselect();
        })();
      }),

    // Handle date clicks (including right-clicks for navigation menu)
    dateClick: info => {
      // Only handle right-clicks for date navigation
      if (info.jsEvent.button === 2 && dateRightClick) {
        info.jsEvent.preventDefault();
        dateRightClick(info.date, info.jsEvent);
      }
    },

    editable: modifyEvent && true,
    eventDrop: modifyEventCallback,
    eventResize: modifyEventCallback,

    eventMouseEnter,

    eventDidMount: ({ event, el, textColor }) => {
      // Don't add context menu or checkboxes to shadow events
      if (event.extendedProps.isShadow) {
        el.addClass('fc-event-shadow');
        return;
      }

      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (openContextMenuForEvent) {
          void openContextMenuForEvent(event, e);
        }
      });
      if (toggleTask) {
        if (event.extendedProps.isTask) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = !!event.extendedProps.taskCompleted;
          checkbox.onclick = async e => {
            e.stopPropagation();
            if (e.target) {
              const ret = await toggleTask(event, (e.target as HTMLInputElement).checked);
              if (!ret) {
                (e.target as HTMLInputElement).checked = !(e.target as HTMLInputElement).checked;
              }
            }
          };
          // Make the checkbox more visible against different color events.
          if (textColor == 'black') {
            checkbox.addClass('ofc-checkbox-black');
          } else {
            checkbox.addClass('ofc-checkbox-white');
          }

          if (checkbox.checked) {
            el.addClass('ofc-task-completed');
          }

          // Depending on the view, we should put the checkbox in a different spot.
          const container =
            el.querySelector('.fc-event-time') ||
            el.querySelector('.fc-event-title') ||
            el.querySelector('.fc-list-event-title');

          container?.addClass('ofc-has-checkbox');
          container?.prepend(checkbox);
        }
      }
    },

    viewDidMount: onViewChange,

    // Enable drag-and-drop from external sources (e.g., Tasks Backlog)
    droppable: drop && true,
    drop:
      drop &&
      (info => {
        // Get the task ID from the dragged element's data transfer
        const taskId = info.draggedEl.getAttribute('data-task-id');
        if (taskId) {
          void drop(taskId, info.date);
        }
      }),

    longPressDelay: 250
  });

  cal.render();

  // Set up date navigation after calendar is created
  const dateNavigation = createDateNavigation(cal, containerEl);

  // Update the navigate button click handler
  const navigateButton = containerEl.querySelector('.fc-navigate-button') as HTMLButtonElement;
  if (navigateButton) {
    navigateButton.addEventListener('click', (ev: MouseEvent) => {
      dateNavigation.showNavigationMenu(ev);
    });
  }

  // Add general right-click handler to calendar container for view-level navigation
  if (viewRightClick) {
    containerEl.addEventListener('contextmenu', (event: MouseEvent) => {
      // Only handle if not handled by specific date or event right-clicks
      if (!event.defaultPrevented) {
        event.preventDefault();
        viewRightClick(event, cal);
      }
    });
  }

  return cal;
}
