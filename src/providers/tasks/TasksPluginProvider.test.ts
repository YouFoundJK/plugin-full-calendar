/**
 * @file TasksPluginProvider.test.ts
 * @brief Unit tests for TasksPluginProvider functionality.
 *
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';

// Mock the dependencies
jest.mock('../../ObsidianAdapter');
jest.mock('./TasksParser');

describe('TasksPluginProvider', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;
  let mockPlugin: any;

  beforeEach(() => {
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      },
      settings: {}
    };

    const config: TasksProviderConfig = {
      id: 'tasks_1',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin, mockApp);
  });

  describe('basic properties', () => {
    it('should have correct static properties', () => {
      expect(TasksPluginProvider.type).toBe('tasks');
      expect(TasksPluginProvider.displayName).toBe('Obsidian Tasks');
      expect(provider.type).toBe('tasks');
      expect(provider.displayName).toBe('Obsidian Tasks');
      expect(provider.isRemote).toBe(false);
    });

    it('should return read-only capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.canCreate).toBe(false);
      expect(capabilities.canEdit).toBe(false);
      expect(capabilities.canDelete).toBe(false);
    });
  });

  describe('read-only enforcement', () => {
    it('should throw error when trying to create event', async () => {
      const event: any = { title: 'Test Event', type: 'single' };

      await expect(provider.createEvent(event)).rejects.toThrow(
        'TasksPluginProvider is read-only. Cannot create events.'
      );
    });

    it('should throw error when trying to update event', async () => {
      const handle = { persistentId: 'test' };
      const oldEvent: any = { title: 'Old' };
      const newEvent: any = { title: 'New' };

      await expect(provider.updateEvent(handle, oldEvent, newEvent)).rejects.toThrow(
        'TasksPluginProvider is read-only. Cannot update events.'
      );
    });

    it('should throw error when trying to delete event', async () => {
      const handle = { persistentId: 'test' };

      await expect(provider.deleteEvent(handle)).rejects.toThrow(
        'TasksPluginProvider is read-only. Cannot delete events.'
      );
    });

    it('should throw error when trying to create instance override', async () => {
      const masterEvent: any = { title: 'Master' };
      const instanceDate = '2024-01-15';
      const newEventData: any = { title: 'Override' };

      await expect(
        provider.createInstanceOverride(masterEvent, instanceDate, newEventData)
      ).rejects.toThrow('TasksPluginProvider is read-only. Cannot create instance overrides.');
    });
  });

  describe('event handle generation', () => {
    it('should generate event handle from UID', () => {
      const event: any = {
        uid: 'test-file.md::5',
        title: 'Test Task'
      };

      const handle = provider.getEventHandle(event);

      expect(handle).not.toBeNull();
      expect(handle!.persistentId).toBe('test-file.md::5');
    });

    it('should return null for event without UID', () => {
      const event: any = {
        title: 'Test Task'
      };

      const handle = provider.getEventHandle(event);

      expect(handle).toBeNull();
    });
  });

  describe('constructor validation', () => {
    it('should throw error when ObsidianInterface is not provided', () => {
      const config: TasksProviderConfig = { id: 'tasks_1' };

      expect(() => {
        new TasksPluginProvider(config, mockPlugin);
      }).toThrow('TasksPluginProvider requires an Obsidian app interface.');
    });
  });

  describe('caching functionality', () => {
    it('should use cache for subsequent calls', async () => {
      // Setup mock to track calls
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([
        { path: 'test.md' }
      ]);
      mockApp.read = jest.fn().mockResolvedValue('- [ ] Test task 📅 2024-01-15');

      // First call should scan vault
      await provider.getEvents();
      const firstCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Second call should use cache (no additional vault scans)
      await provider.getEvents();
      const secondCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Should only scan once if cache is working
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should invalidate cache and rescan after file changes', async () => {
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Initial scan
      await provider.getEvents();
      const initialCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Simulate file update
      provider.handleFileUpdate();

      // Next scan should re-read files
      await provider.getEvents();
      const afterInvalidationCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Should have made additional calls after cache invalidation
      expect(afterInvalidationCallCount).toBeGreaterThan(initialCallCount);
    });

    it('should provide undated tasks method', async () => {
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Should not throw and should return array
      const undatedTasks = await provider.getUndatedTasks();
      expect(Array.isArray(undatedTasks)).toBe(true);
    });

    it('should invalidate cache when files are deleted', async () => {
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Initial scan
      await provider.getEvents();
      const initialCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Simulate file deletion
      provider.handleFileDelete();

      // Next scan should re-read files
      await provider.getEvents();
      const afterInvalidationCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Should have made additional calls after cache invalidation
      expect(afterInvalidationCallCount).toBeGreaterThan(initialCallCount);
    });
  });
});
