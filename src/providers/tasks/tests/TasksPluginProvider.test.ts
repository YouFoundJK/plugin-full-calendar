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
      settings: {},
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
