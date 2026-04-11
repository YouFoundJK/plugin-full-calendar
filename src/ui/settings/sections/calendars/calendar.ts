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
import {
  patchRRuleTimezoneExpansion,
  type RRulePluginLike
} from '../../../../features/timezone/Timezone';

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
  highlightCurrentOrNextEvent?: boolean;
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
  const MOBILE_BREAKPOINT = 500;
  const COMPACT_DESKTOP_BREAKPOINT = 910;
  const SWIPE_MIN_DISTANCE = 60;
  const SWIPE_DIRECTION_RATIO = 1.2;

  const getResponsiveWidth = (): number => {
    const measuredWidth = containerEl.getBoundingClientRect().width || containerEl.clientWidth;
    return measuredWidth > 0 ? measuredWidth : window.innerWidth;
  };

  const isMobile = getResponsiveWidth() < MOBILE_BREAKPOINT;
  const isNarrow = settings?.forceNarrow || isMobile;

  // Apply RRULE monkeypatch on every render to capture the latest settings.timeZone.
  // We apply the extracted logic from Timezone.ts to safely handle DST offsets.
  {
    const rrulePlugin = ((rrule as unknown as { default?: RRulePluginLike }).default ||
      rrule) as unknown as RRulePluginLike;

    patchRRuleTimezoneExpansion(rrulePlugin, settings?.timeZone);
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

  type ToolbarMode = 'narrow' | 'compact-desktop' | 'desktop';
  type ToolbarLayout = {
    mode: ToolbarMode;
    headerToolbar: { left: string; center: string; right: string } | false;
    footerToolbar: { left: string; right: string } | false;
  };

  const getToolbarLayout = (windowWidth: number): ToolbarLayout => {
    const narrow = !!settings?.forceNarrow || windowWidth < MOBILE_BREAKPOINT;

    if (narrow) {
      return {
        mode: 'narrow',
        headerToolbar: false,
        footerToolbar: {
          left: 'prev,today,next',
          right: 'views,more'
        }
      };
    }

    if (windowWidth < COMPACT_DESKTOP_BREAKPOINT) {
      return {
        mode: 'compact-desktop',
        headerToolbar: {
          left: 'prev,today,next',
          center: 'title',
          right: 'analysis more'
        },
        footerToolbar: false
      };
    }

    const fullDesktopViewGroup = ['views', showResourceViews ? 'timeline' : null]
      .filter(Boolean)
      .join(',');

    return {
      mode: 'desktop',
      headerToolbar: {
        left: 'workspace prev,today,navigate,next',
        center: 'title',
        right: `analysis ${fullDesktopViewGroup}`
      },
      footerToolbar: false
    };
  };

  const initialToolbarLayout = getToolbarLayout(getResponsiveWidth());
  let currentToolbarMode: ToolbarMode = initialToolbarLayout.mode;

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

  let dateNavigation: ReturnType<typeof createDateNavigation> | null = null;

  const addViewOptionsToMenu = (menu: Menu, mode: ToolbarMode): void => {
    const viewOptions =
      mode === 'narrow'
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

    for (const [viewName, viewLabel] of Object.entries(viewOptions) as [string, string][]) {
      menu.addItem(item =>
        item.setTitle(viewLabel).onClick(() => {
          cal.changeView(viewName);
        })
      );
    }
  };

  // Always add the "Views" dropdown
  customButtonConfig.views = {
    text: 'View ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();
      addViewOptionsToMenu(menu, currentToolbarMode);
      menu.showAtMouseEvent(ev);
    }
  };

  // Add the "Navigate" dropdown - will be configured after calendar creation
  customButtonConfig.navigate = {
    text: '▾',
    click: (ev: MouseEvent) => {
      dateNavigation?.showNavigationMenu(ev);
    }
  };

  // Keep compact layouts uncluttered by routing secondary actions into a single menu.
  customButtonConfig.more = {
    text: 'More ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();

      menu.addItem(item => {
        item.setTitle('Workspace').onClick(() => {
          void customButtons?.workspace?.click(ev);
        });
      });

      menu.addItem(item => {
        item.setTitle('Go to date').onClick(() => {
          dateNavigation?.showNavigationMenu(ev);
        });
      });

      if (currentToolbarMode === 'compact-desktop') {
        menu.addSeparator();
        addViewOptionsToMenu(menu, currentToolbarMode);
      }

      if (showResourceViews) {
        menu.addSeparator();
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
      }

      menu.showAtMouseEvent(ev);
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

  let currentUpcomingEventIds = new Set<string>();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }

    return !!target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], .cm-content, .cm-editor, .markdown-source-view, .markdown-preview-view'
    );
  };

  const toggleEventHighlightById = (eventId: string, add: boolean) => {
    const escapedId = CSS.escape(eventId);
    const elements = containerEl.querySelectorAll<HTMLElement>(`[data-event-id="${escapedId}"]`);
    elements.forEach(el => {
      el.toggleClass('ofc-event-current-or-next', add);

      // Month/Week/Timeline views often clip event glow at harness level,
      // so toggle a class on the nearest harness wrapper too.
      const harness = el.closest<HTMLElement>(
        '.fc-timegrid-event-harness, .fc-daygrid-event-harness, .fc-timeline-event-harness'
      );
      harness?.toggleClass('ofc-event-current-or-next-harness', add);
    });
  };

  const findCurrentOrNextEventIds = (events: EventApi[]): Set<string> => {
    const result = new Set<string>();
    if (!settings?.highlightCurrentOrNextEvent) {
      return result;
    }

    const nowMs = Date.now();
    let currentCandidate: EventApi | null = null;
    let currentCandidateEnd = Number.POSITIVE_INFINITY;
    let nextCandidate: EventApi | null = null;
    let nextCandidateStart = Number.POSITIVE_INFINITY;

    for (const event of events) {
      if (event.extendedProps?.isShadow || !event.start || event.allDay) {
        continue;
      }

      const startMs = event.start.getTime();
      const rawEndMs = event.end?.getTime() ?? startMs;
      // Treat zero-duration events as a 1ms window so equality checks stay deterministic.
      const endMs = rawEndMs <= startMs ? startMs + 1 : rawEndMs;

      if (startMs <= nowMs && nowMs < endMs) {
        if (endMs < currentCandidateEnd) {
          currentCandidate = event;
          currentCandidateEnd = endMs;
        }
        continue;
      }

      if (startMs > nowMs && startMs < nextCandidateStart) {
        nextCandidate = event;
        nextCandidateStart = startMs;
      }
    }

    const activeEvent = currentCandidate ?? nextCandidate;
    if (activeEvent?.id) {
      result.add(activeEvent.id);
    }
    return result;
  };

  const updateCurrentOrNextEventHighlight = () => {
    const nextUpcomingEventIds = findCurrentOrNextEventIds(cal.getEvents());

    for (const oldId of currentUpcomingEventIds) {
      if (!nextUpcomingEventIds.has(oldId)) {
        toggleEventHighlightById(oldId, false);
      }
    }

    // Always reapply in case FullCalendar remounted DOM nodes.
    for (const newId of nextUpcomingEventIds) {
      toggleEventHighlightById(newId, true);
    }

    currentUpcomingEventIds = nextUpcomingEventIds;
  };

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
    headerToolbar: initialToolbarLayout.headerToolbar,
    footerToolbar: initialToolbarLayout.footerToolbar,
    // Cast at usage point to satisfy FullCalendar without polluting variable with any
    views,
    ...(showResourceViews && {
      resourceAreaHeaderContent: 'Categories',
      resources,
      resourcesInitiallyExpanded: false
    }),

    // Business hours configuration
    ...(businessHours && { businessHours }),

    eventAllow: (dropInfo, draggedEvent) => {
      // dropInfo.resource is the resource that the event is being dropped on
      const resource = (dropInfo as { resource?: { extendedProps?: { isParent?: boolean } } })
        .resource;
      if (resource?.extendedProps?.isParent) {
        return false; // Disallow drop on parent
      }
      return true; // Allow drop on children (or in non-resource views)
    },

    windowResize: () => {
      const nextToolbarLayout = getToolbarLayout(getResponsiveWidth());
      if (nextToolbarLayout.mode === currentToolbarMode) {
        return;
      }

      currentToolbarMode = nextToolbarLayout.mode;
      cal.setOption('headerToolbar', nextToolbarLayout.headerToolbar);
      cal.setOption('footerToolbar', nextToolbarLayout.footerToolbar);
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

      el.setAttribute('data-event-id', event.id);
      el.toggleClass('ofc-event-current-or-next', currentUpcomingEventIds.has(event.id));
      const eventColor = event.backgroundColor || event.borderColor || '';
      if (eventColor) {
        el.style.setProperty('--event-color', eventColor);
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

    viewDidMount: () => {
      onViewChange?.();
      updateCurrentOrNextEventHighlight();
    },

    eventsSet: () => {
      updateCurrentOrNextEventHighlight();
    },

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

  // Keep toolbar mode and sizing in sync with pane/container changes
  // (e.g. Obsidian sidebars opening/closing) that do not emit window resize.
  const resizeObserver = new ResizeObserver(() => {
    const nextToolbarLayout = getToolbarLayout(getResponsiveWidth());
    if (nextToolbarLayout.mode !== currentToolbarMode) {
      currentToolbarMode = nextToolbarLayout.mode;
      cal.setOption('headerToolbar', nextToolbarLayout.headerToolbar);
      cal.setOption('footerToolbar', nextToolbarLayout.footerToolbar);
    }

    cal.updateSize();
  });
  resizeObserver.observe(containerEl);

  cal.render();

  if (!containerEl.hasAttribute('tabindex')) {
    containerEl.setAttribute('tabindex', '0');
  }

  const onPointerDownFocus = (event: PointerEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    containerEl.focus({ preventScroll: true });
  };

  const onKeyDownNavigate = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
      return;
    }

    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      cal.prev();
      return;
    }

    cal.next();
  };

  let touchStartX: number | null = null;
  let touchStartY: number | null = null;
  let swipeEnabled = false;

  const onTouchStartNavigate = (event: TouchEvent) => {
    if (event.touches.length !== 1 || isEditableTarget(event.target)) {
      swipeEnabled = false;
      return;
    }

    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    swipeEnabled = true;
  };

  const onTouchEndNavigate = (event: TouchEvent) => {
    if (!swipeEnabled || touchStartX === null || touchStartY === null || !event.changedTouches[0]) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    touchStartX = null;
    touchStartY = null;
    swipeEnabled = false;

    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) {
      return;
    }

    if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_DIRECTION_RATIO) {
      return;
    }

    if (deltaX < 0) {
      cal.next();
      return;
    }

    cal.prev();
  };

  containerEl.addEventListener('pointerdown', onPointerDownFocus);
  containerEl.addEventListener('keydown', onKeyDownNavigate);
  containerEl.addEventListener('touchstart', onTouchStartNavigate, { passive: true });
  containerEl.addEventListener('touchend', onTouchEndNavigate, { passive: true });

  updateCurrentOrNextEventHighlight();
  const activeHighlightInterval = window.setInterval(updateCurrentOrNextEventHighlight, 60_000);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      updateCurrentOrNextEventHighlight();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const originalDestroy = cal.destroy.bind(cal);
  cal.destroy = () => {
    resizeObserver.disconnect();
    containerEl.removeEventListener('pointerdown', onPointerDownFocus);
    containerEl.removeEventListener('keydown', onKeyDownNavigate);
    containerEl.removeEventListener('touchstart', onTouchStartNavigate);
    containerEl.removeEventListener('touchend', onTouchEndNavigate);
    window.clearInterval(activeHighlightInterval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    originalDestroy();
  };

  // Set up date navigation after calendar is created
  dateNavigation = createDateNavigation(cal, containerEl);

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
