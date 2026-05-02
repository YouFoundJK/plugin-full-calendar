/**
 * @file TasksPluginProvider.test.ts
 * @brief Unit tests for TasksPluginProvider functionality.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from '../TasksPluginProvider';
import { TasksProviderConfig } from '../typesTask';
import type { OFCEvent } from '../../../types/schema';
import type { ObsidianInterface } from '../../../ObsidianAdapter';
import type FullCalendarPlugin from '../../../main';

// Mock the dependencies
jest.mock('../../../ObsidianAdapter');
// NOTE: NOT mocking TasksParser so we can test the real enhanced parsing functionality

type MockApp = {
  read: jest.Mock;
  getAbstractFileByPath: jest.Mock;
  getFileByPath: jest.Mock;
  getMetadata: jest.Mock;
  create: jest.Mock;
  rewrite: jest.Mock;
  delete: jest.Mock;
};

type MockPlugin = {
  app: {
    vault: { getMarkdownFiles: jest.Mock };
    workspace: { trigger: jest.Mock };
    plugins?: {
      plugins?: Record<string, { apiV1?: { editTaskLineModal: jest.Mock } }>;
    };
  };
  settings: Record<string, unknown>;
  providerRegistry: {
    refreshBacklogViews: jest.Mock;
    reloadProviderNow: jest.Mock;
  };
};

describe('TasksPluginProvider', () => {
  let provider: TasksPluginProvider;
  let mockApp: MockApp;
  let mockPlugin: MockPlugin;

  beforeEach(() => {
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn(),
      create: jest.fn(),
      rewrite: jest.fn(),
      delete: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        },
        workspace: {
          trigger: jest.fn((eventName: string, callback: (data: unknown) => void) => {
            if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
              callback({ state: 'Warm', tasks: [] }); // MODIFIED: resolves cache warm promise
            }
          })
        }
      },
      settings: {
        tasksIntegration: {
          backlogDateTarget: 'scheduledDate',
          calendarDisplayDateTarget: 'scheduledDate',
          openEditModalAfterBacklogDrop: false
        }
      },
      providerRegistry: {
        refreshBacklogViews: jest.fn(),
        reloadProviderNow: jest.fn()
      }
    };

    const config: TasksProviderConfig = {
      id: 'tasks_1',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(
      config,
      mockPlugin as unknown as FullCalendarPlugin,
      mockApp as unknown as ObsidianInterface
    );
  });

  describe('basic properties', () => {
    it('should have correct static properties', () => {
      expect(TasksPluginProvider.type).toBe('tasks');
      expect(TasksPluginProvider.displayName).toBe('Obsidian Tasks');
      expect(provider.type).toBe('tasks');
      expect(provider.displayName).toBe('Obsidian Tasks');
      expect(provider.isRemote).toBe(false);
      expect(provider.loadPriority).toBe(130);
    });

    it('should return writable capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.canCreate).toBe(false);
      expect(capabilities.canEdit).toBe(true);
      expect(capabilities.canDelete).toBe(true);
      expect(capabilities.contextMenu).toMatchObject({
        allowGenericTaskActions: false,
        providesNativeTaskSemantics: true
      });
    });
  });

  describe('Tasks API integration', () => {
    it('keeps explicit task time ranges for timed calendar events', async () => {
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Planning (09:00-10:15)',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Planning (09:00-10:15) ⏳ 2026-05-02',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events[0][0]).toMatchObject({
        type: 'single',
        allDay: false,
        date: '2026-05-02',
        startTime: '09:00',
        endTime: '10:15'
      });
    });

    it('gives single-time tasks a visible duration for week/time-grid views', async () => {
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Standup (09:00)',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Standup (09:00) ⏳ 2026-05-02',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events[0][0]).toMatchObject({
        type: 'single',
        allDay: false,
        date: '2026-05-02',
        startTime: '09:00',
        endTime: '09:30'
      });
    });

    it('shows Tasks events only on the configured calendar display date field', async () => {
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Scheduled only',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Scheduled only ⏳ 2026-05-02',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Due task',
                  taskLocation: { lineNumber: 1 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  dueDate: { toDate: () => new Date('2026-05-04T00:00:00') },
                  originalMarkdown: '- [ ] Due task ⏳ 2026-05-02 📅 2026-05-04',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0][0]).toMatchObject({
        title: 'Due task',
        date: '2026-05-04'
      });
    });

    it('should reject creating events directly', async () => {
      const event = { title: 'Test Event', type: 'single', date: '2024-01-01' } as OFCEvent;

      await expect(provider.createEvent(event)).rejects.toThrow(
        'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
      );
    });

    it('should reject recurring events for update', async () => {
      const handle = { persistentId: 'test::1' };
      const oldEvent = { title: 'Old', type: 'single' } as OFCEvent;
      const newEvent = { title: 'New', type: 'recurring' } as OFCEvent;

      await expect(provider.updateEvent(handle, oldEvent, newEvent)).rejects.toThrow(
        'Tasks provider can only update single, dated events.'
      );
    });

    it('should reject invalid handle format for delete', async () => {
      const handle = { persistentId: 'invalid-format' };

      await expect(provider.deleteEvent(handle)).rejects.toThrow(
        'Invalid task handle format. Expected "filePath::lineNumber".'
      );
    });

    it('should still reject instance overrides', async () => {
      const masterEvent = { title: 'Master' } as OFCEvent;
      const instanceDate = '2024-01-15';
      const newEventData = { title: 'Override' } as OFCEvent;

      await expect(
        provider.createInstanceOverride(masterEvent, instanceDate, newEventData)
      ).rejects.toThrow('Tasks provider does not support recurring event overrides.');
    });

    it('schedules backlog drops using the configured calendar display date field', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        const updated = update('- [ ] Backlog task');
        expect(updated).toBe(`- [ ] Backlog task ${String.fromCodePoint(0x1f4c5)} 2026-05-02`);
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'dueDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false
      };
      const editTaskLineModal = jest.fn();
      mockPlugin.app.plugins = {
        plugins: {
          'obsidian-tasks-plugin': {
            apiV1: { editTaskLineModal }
          }
        }
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Backlog task',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Backlog task',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getUndatedTasks();
      await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T00:00:00'));

      expect(editTaskLineModal).not.toHaveBeenCalled();
      await expect(provider.getUndatedTasks()).resolves.toEqual([]);
    });

    it('filters backlog tasks by the configured Tasks date field', async () => {
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'dueDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: false
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Scheduled only',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Scheduled only ⏳ 2026-05-02',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Has due date',
                  taskLocation: { lineNumber: 1 },
                  dueDate: { toDate: () => new Date('2026-05-03T00:00:00') },
                  originalMarkdown: '- [ ] Has due date 📅 2026-05-03',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await expect(provider.getUndatedTasks()).resolves.toEqual([
        expect.objectContaining({ title: 'Scheduled only' })
      ]);
    });

    it('opens the Tasks edit modal after backlog drops only when enabled', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        update('- [ ] Backlog task');
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: true
      };
      const editTaskLineModal = jest.fn().mockResolvedValue('- [ ] Backlog task edited');
      mockPlugin.app.plugins = {
        plugins: {
          'obsidian-tasks-plugin': {
            apiV1: { editTaskLineModal }
          }
        }
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Backlog task',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Backlog task',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getUndatedTasks();
      await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T00:00:00'));

      expect(editTaskLineModal).toHaveBeenCalledWith('- [ ] Backlog task ⏳ 2026-05-02');
    });

    it('updates timed Tasks events against the configured calendar display date field', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        const updated = update('- [ ] Due task 📅 2026-05-03');
        expect(updated).toBe('- [ ] Due task (9:00-10:00) 📅 2026-05-05');
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Due task',
                  taskLocation: { lineNumber: 0 },
                  dueDate: { toDate: () => new Date('2026-05-03T00:00:00') },
                  originalMarkdown: '- [ ] Due task 📅 2026-05-03',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getEvents();
      await provider.updateEvent(
        { persistentId: 'Daily.md::0' },
        { type: 'single', title: 'Due task', date: '2026-05-03' } as OFCEvent,
        {
          type: 'single',
          title: 'Due task',
          allDay: false,
          date: '2026-05-05',
          startTime: '09:00',
          endTime: '10:00'
        } as OFCEvent
      );
    });
  });

  describe('event handle generation', () => {
    it('should generate event handle from UID', () => {
      const event = {
        uid: 'test-file.md::5',
        title: 'Test Task'
      } as OFCEvent;

      const handle = provider.getEventHandle(event);

      expect(handle).not.toBeNull();
      expect(handle!.persistentId).toBe('test-file.md::5');
    });

    it('should return null for event without UID', () => {
      const event = {
        title: 'Test Task'
      } as OFCEvent;

      const handle = provider.getEventHandle(event);

      expect(handle).toBeNull();
    });
  });

  describe('constructor validation', () => {
    it('should throw error when ObsidianInterface is not provided', () => {
      const config: TasksProviderConfig = { id: 'tasks_1' };

      expect(() => {
        new TasksPluginProvider(config, mockPlugin as unknown as FullCalendarPlugin);
      }).toThrow('TasksPluginProvider requires an Obsidian app interface.');
    });
  });
});
