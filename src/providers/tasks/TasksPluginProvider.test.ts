/**
 * @file TasksPluginProvider.test.ts
 * @brief Tests for TasksPluginProvider - simplified test focusing on core functionality
 */

import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksPluginProviderConfig } from './typesTask';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';

// Simple tests for the basic functionality
describe('TasksPluginProvider', () => {
  let provider: TasksPluginProvider;
  let config: TasksPluginProviderConfig;

  beforeEach(() => {
    config = {
      id: 'test-tasks',
      type: 'tasks',
      displayName: 'Test Tasks'
    };

    const mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn(() => [])
        },
        plugins: {
          plugins: {
            'obsidian-tasks-plugin': {
              apiV1: {},
              settings: { dueDateEmoji: '📅' }
            }
          }
        }
      }
    } as unknown as FullCalendarPlugin;

    const mockApp = {
      read: jest.fn(() => Promise.resolve(''))
    } as unknown as ObsidianInterface;

    provider = new TasksPluginProvider(config, mockPlugin, mockApp);
  });

  describe('_ofcEventToTaskLine (private method testing)', () => {
    it('should convert all-day event to task line', () => {
      const event = {
        type: 'single' as const,
        title: 'Test Task',
        date: '2025-01-15',
        allDay: true
      } as any;

      // Access private method for testing
      const taskLine = (provider as any)._ofcEventToTaskLine(event);
      expect(taskLine).toBe('- [ ] Test Task 📅 2025-01-15');
    });

    it('should convert timed event to task line', () => {
      const event = {
        type: 'single' as const,
        title: 'Timed Task',
        date: '2025-01-16',
        startTime: '14:30',
        allDay: false
      } as any;

      const taskLine = (provider as any)._ofcEventToTaskLine(event);
      expect(taskLine).toBe('- [ ] Timed Task 📅 2025-01-16 14:30');
    });
  });

  describe('getCapabilities', () => {
    it('should return writable capabilities for Step 2', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities).toEqual({
        canCreate: true,
        canEdit: true,
        canDelete: true
      });
    });
  });

  describe('static properties', () => {
    it('should have correct static type and displayName', () => {
      expect(TasksPluginProvider.type).toBe('tasks');
      expect(TasksPluginProvider.displayName).toBe('Obsidian Tasks');
    });
  });

  describe('getEventHandle', () => {
    it('should return handle with persistent ID', () => {
      const event = {
        type: 'single' as const,
        uid: 'task-file.md::2',
        title: 'Test Task',
        date: '2025-01-15',
        endDate: null,
        allDay: true
      } as any;

      const handle = provider.getEventHandle(event);
      expect(handle).toEqual({
        persistentId: 'task-file.md::2'
      });
    });

    it('should return null for events without uid', () => {
      const event = {
        type: 'single' as const,
        title: 'Test Task',
        date: '2025-01-15',
        endDate: null,
        allDay: true
      } as any;

      const handle = provider.getEventHandle(event);
      expect(handle).toBeNull();
    });
  });
});