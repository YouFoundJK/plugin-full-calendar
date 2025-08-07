/**
 * Integration test for workspace functionality
 */

import {
  WorkspaceSettings,
  createDefaultWorkspace,
  FullCalendarSettings,
  DEFAULT_SETTINGS
} from '../../src/types/settings';

// Mock CalendarView methods for testing
class MockCalendarView {
  plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  getActiveWorkspace(): WorkspaceSettings | null {
    if (!this.plugin.settings.activeWorkspace) return null;
    return (
      this.plugin.settings.workspaces.find(
        (w: WorkspaceSettings) => w.id === this.plugin.settings.activeWorkspace
      ) || null
    );
  }

  applyWorkspaceSettings(settings: any) {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return settings;

    const workspaceSettings = { ...settings };

    // Apply view overrides
    if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
      workspaceSettings.initialView = {
        desktop: workspace.defaultView.desktop || settings.initialView?.desktop,
        mobile: workspace.defaultView.mobile || settings.initialView?.mobile
      };
    }

    // Apply business hours override
    if (workspace.businessHours !== undefined) {
      workspaceSettings.businessHours = workspace.businessHours;
    }

    return workspaceSettings;
  }

  filterCalendarSources(sources: any[]) {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return sources;

    return sources.filter(source => {
      // If visible calendars are specified, only show those calendars
      if (workspace.visibleCalendars && workspace.visibleCalendars.length > 0) {
        return workspace.visibleCalendars.includes(source.id);
      }

      return true;
    });
  }

  filterEventsByCategory(events: any[]): any[] {
    const workspace = this.getActiveWorkspace();
    if (!workspace?.categoryFilter) return events;

    const { mode, categories } = workspace.categoryFilter;

    // If 'show-only' mode is selected but no categories are chosen, don't apply filtering
    if (mode === 'show-only' && categories.length === 0) {
      return events;
    }

    return events.filter(event => {
      const category =
        event.extendedProps?.category ||
        event.extendedProps?.originalEvent?.category ||
        event.resourceId;

      if (!category) {
        return mode === 'hide';
      }

      const mainCategory = category.includes('::') ? category.split('::')[0] : category;

      if (mode === 'show-only') {
        return categories.includes(mainCategory);
      } else {
        return !categories.includes(mainCategory);
      }
    });
  }
}

describe('Workspace Integration Tests', () => {
  let mockPlugin: any;
  let mockView: MockCalendarView;

  beforeEach(() => {
    mockPlugin = {
      settings: { ...DEFAULT_SETTINGS }
    };
    mockView = new MockCalendarView(mockPlugin);
  });

  test('should work with no workspaces', () => {
    const settings = mockView.applyWorkspaceSettings(mockPlugin.settings);
    expect(settings).toEqual(mockPlugin.settings);
  });

  test('should apply workspace view settings', () => {
    const workspace = createDefaultWorkspace('Test Workspace');
    workspace.defaultView = {
      desktop: 'dayGridMonth',
      mobile: 'timeGridDay'
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const settings = mockView.applyWorkspaceSettings(mockPlugin.settings);
    expect(settings.initialView.desktop).toBe('dayGridMonth');
    expect(settings.initialView.mobile).toBe('timeGridDay');
  });

  test('should apply business hours override', () => {
    const workspace = createDefaultWorkspace('Work Workspace');
    workspace.businessHours = {
      enabled: true,
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00'
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const settings = mockView.applyWorkspaceSettings(mockPlugin.settings);
    expect(settings.businessHours?.enabled).toBe(true);
  });

  test('should filter calendar sources', () => {
    const workspace = createDefaultWorkspace('Filtered Workspace');
    workspace.visibleCalendars = ['cal1', 'cal2'];

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const sources = [
      { id: 'cal1', name: 'Calendar 1' },
      { id: 'cal2', name: 'Calendar 2' },
      { id: 'cal3', name: 'Calendar 3' },
      { id: 'cal4', name: 'Calendar 4' }
    ];

    const filteredSources = mockView.filterCalendarSources(sources);

    // Should show cal1 and cal2 (visible), but not cal3 (hidden) or cal4 (not in visible list)
    expect(filteredSources).toHaveLength(2);
    expect(filteredSources.map(s => s.id)).toEqual(['cal1', 'cal2']);
  });

  test('should filter events by category', () => {
    const workspace = createDefaultWorkspace('Category Workspace');
    workspace.categoryFilter = {
      mode: 'show-only',
      categories: ['Work', 'Important']
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const events = [
      { id: '1', extendedProps: { category: 'Work' } },
      { id: '2', extendedProps: { category: 'Personal' } },
      { id: '3', extendedProps: { category: 'Important' } },
      { id: '4', resourceId: 'Work::Subcategory' },
      { id: '5', extendedProps: {} } // No category
    ];

    const filteredEvents = mockView.filterEventsByCategory(events);

    // Should show events with Work or Important categories
    expect(filteredEvents).toHaveLength(3);
    expect(filteredEvents.map(e => e.id)).toEqual(['1', '3', '4']);
  });

  test('should handle hide mode category filtering', () => {
    const workspace = createDefaultWorkspace('Hide Workspace');
    workspace.categoryFilter = {
      mode: 'hide',
      categories: ['Personal']
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const events = [
      { id: '1', extendedProps: { category: 'Work' } },
      { id: '2', extendedProps: { category: 'Personal' } },
      { id: '3', extendedProps: {} } // No category
    ];

    const filteredEvents = mockView.filterEventsByCategory(events);

    // Should hide Personal events but show Work and uncategorized
    expect(filteredEvents).toHaveLength(2);
    expect(filteredEvents.map(e => e.id)).toEqual(['1', '3']);
  });

  test('should handle complex workspace configuration', () => {
    const workspace: WorkspaceSettings = {
      id: 'complex_workspace',
      name: 'Complex Workspace',
      defaultView: {
        desktop: 'resourceTimelineWeek',
        mobile: 'listWeek'
      },
      defaultDate: 'today',
      visibleCalendars: ['work_cal', 'project_cal'],
      categoryFilter: {
        mode: 'show-only',
        categories: ['Work', 'Project']
      },
      businessHours: {
        enabled: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00'
      },
      timelineExpanded: true
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    // Test settings application
    const settings = mockView.applyWorkspaceSettings(mockPlugin.settings);
    expect(settings.initialView.desktop).toBe('resourceTimelineWeek');
    expect(settings.initialView.mobile).toBe('listWeek');
    expect(settings.businessHours?.enabled).toBe(true);

    // Test calendar filtering
    const sources = [
      { id: 'work_cal', name: 'Work' },
      { id: 'personal_cal', name: 'Personal' },
      { id: 'project_cal', name: 'Project' }
    ];
    const filteredSources = mockView.filterCalendarSources(sources);
    expect(filteredSources.map(s => s.id)).toEqual(['work_cal', 'project_cal']);

    // Test event filtering
    const events = [
      { id: '1', extendedProps: { category: 'Work' } },
      { id: '2', extendedProps: { category: 'Personal' } },
      { id: '3', extendedProps: { category: 'Project' } }
    ];
    const filteredEvents = mockView.filterEventsByCategory(events);
    expect(filteredEvents.map(e => e.id)).toEqual(['1', '3']);
  });

  test('should not filter events when show-only mode has no categories selected', () => {
    // This tests the fix for the bug where show-only mode with no categories would filter out all events
    const workspace = createDefaultWorkspace('Empty Show-Only Workspace');
    workspace.categoryFilter = {
      mode: 'show-only',
      categories: [] // No categories selected
    };

    mockPlugin.settings.workspaces = [workspace];
    mockPlugin.settings.activeWorkspace = workspace.id;

    const events = [
      { id: '1', extendedProps: { category: 'Work' } },
      { id: '2', extendedProps: { category: 'Personal' } },
      { id: '3', extendedProps: {} } // No category
    ];

    const filteredEvents = mockView.filterEventsByCategory(events);

    // Should return all events when show-only has no categories selected
    expect(filteredEvents).toHaveLength(3);
    expect(filteredEvents.map(e => e.id)).toEqual(['1', '2', '3']);
  });
});
