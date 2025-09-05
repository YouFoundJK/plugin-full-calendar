/**
 * @file TasksScheduling.integration.test.ts
 * @brief Integration tests for task scheduling and UI refresh functionality
 *
 * @description
 * This test suite verifies that the task scheduling functionality works correctly
 * and that cache invalidation occurs as expected.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from './TasksPluginProvider';

// Mock dependencies
jest.mock('../../main', () => ({}));

describe('Task Scheduling Integration', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;

  beforeEach(() => {
    // Create mock app with required methods
    mockApp = {
      read: jest.fn(),
      rewrite: jest
        .fn()
        .mockImplementation(async (file: any, modifyFn: (content: string) => string) => {
          // Simulate the rewrite operation
          const originalContent = '- [ ] Original task\n- [ ] Task to schedule';
          const modifiedContent = modifyFn(originalContent);
          return modifiedContent;
        }),
      getFileByPath: jest.fn().mockImplementation((path: string) => {
        // Simulate finding test.md
        if (path === 'test.md') {
          return { path: 'test.md', extension: 'md' };
        }
        return null;
      })
    };

    const config = {
      id: 'test-tasks',
      name: 'Test Tasks'
    };

    // The mockPlugin needs the app.vault structure
    const mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      }
    } as any;

    provider = new TasksPluginProvider(config, mockPlugin, mockApp as any);
  });

  describe('scheduleTask method', () => {
    it('should call _invalidateCache after successfully scheduling a task', async () => {
      // Mock the _findTaskByHandle method to return a valid task
      const mockFindTaskByHandle = jest.fn().mockResolvedValue({
        file: { path: 'test.md' },
        lineNumber: 1 // Valid line number (1-based)
      });
      (provider as any)._findTaskByHandle = mockFindTaskByHandle;

      // Mock _invalidateCache method
      const mockInvalidateCache = jest.fn();
      (provider as any)._invalidateCache = mockInvalidateCache;

      // Mock rewrite to simulate successful file modification
      mockApp.rewrite.mockImplementation(
        async (file: any, modifyFn: (content: string) => string) => {
          const originalContent = '- [ ] Task to schedule';
          const modifiedContent = modifyFn(originalContent);
          return modifiedContent;
        }
      );

      // Test scheduling a task
      const testDate = new Date('2024-01-15');
      await provider.scheduleTask('test.md::1', testDate);

      // Verify that cache invalidation was called
      expect(mockInvalidateCache).toHaveBeenCalled();
      expect(mockFindTaskByHandle).toHaveBeenCalledWith({ persistentId: 'test.md::1' });
    });

    it('should format date correctly for task scheduling', async () => {
      // Mock the _findTaskByHandle method
      const mockFindTaskByHandle = jest.fn().mockResolvedValue({
        file: { path: 'test.md' },
        lineNumber: 1 // Valid line number (1-based)
      });
      (provider as any)._findTaskByHandle = mockFindTaskByHandle;

      // Mock _invalidateCache
      (provider as any)._invalidateCache = jest.fn();

      // Mock rewrite to capture the modified content
      let capturedModification = '';
      mockApp.rewrite.mockImplementation(
        async (file: any, modifyFn: (content: string) => string) => {
          const originalContent = '- [ ] Task to schedule';
          capturedModification = modifyFn(originalContent);
          return capturedModification;
        }
      );

      const testDate = new Date('2024-01-15T10:30:00Z');
      await provider.scheduleTask('test.md::1', testDate);

      // Verify the rewrite function was called
      expect(mockApp.rewrite).toHaveBeenCalled();

      // Check that the date was formatted correctly (YYYY-MM-DD)
      expect(capturedModification).toContain('2024-01-15');
    });

    it('should handle errors gracefully and not call _invalidateCache on failure', async () => {
      // Mock _findTaskByHandle to throw an error
      const mockFindTaskByHandle = jest.fn().mockRejectedValue(new Error('Task not found'));
      (provider as any)._findTaskByHandle = mockFindTaskByHandle;

      // Mock _invalidateCache
      const mockInvalidateCache = jest.fn();
      (provider as any)._invalidateCache = mockInvalidateCache;

      const testDate = new Date('2024-01-15');

      // Should throw an error
      await expect(provider.scheduleTask('invalid-task-id', testDate)).rejects.toThrow(
        'Failed to schedule task'
      );

      // Cache should not be invalidated on error
      expect(mockInvalidateCache).not.toHaveBeenCalled();
    });
  });

  describe('Cache invalidation behavior', () => {
    it('should have a working _invalidateCache method', () => {
      // Test that the _invalidateCache method exists and is callable
      const invalidateCache = (provider as any)._invalidateCache;
      expect(typeof invalidateCache).toBe('function');

      // Should not throw when called
      expect(() => invalidateCache.call(provider)).not.toThrow();
    });
  });

  describe('Task ID format validation', () => {
    it('should accept valid task ID format', async () => {
      const mockFindTaskByHandle = jest.fn().mockResolvedValue({
        file: { path: 'test.md' },
        lineNumber: 1
      });
      (provider as any)._findTaskByHandle = mockFindTaskByHandle;
      (provider as any)._invalidateCache = jest.fn();

      const validTaskIds = ['test.md::1', 'folder/file.md::10', 'complex-file-name.md::999'];

      for (const taskId of validTaskIds) {
        await expect(provider.scheduleTask(taskId, new Date())).resolves.not.toThrow();
        expect(mockFindTaskByHandle).toHaveBeenCalledWith({ persistentId: taskId });
      }
    });
  });
});
