/**
 * @file TasksSurgicalEditing.test.ts
 * @brief Tests for surgical editing functionality in TasksPluginProvider.
 *
 * @description
 * These tests verify that the Tasks provider preserves user data (links, tags, comments)
 * when updating tasks via calendar operations like drag-and-drop.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import { OFCEvent } from '../../types';
import { EventHandle } from '../typesProvider';

describe('TasksPluginProvider - Surgical Editing', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;
  let mockPlugin: any;

  beforeEach(() => {
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn(),
      getFileByPath: jest.fn(),
      rewrite: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      },
      settings: {},
      providerRegistry: {
        refreshBacklogViews: jest.fn()
      }
    };

    const config: TasksProviderConfig = {
      id: 'tasks_1',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin, mockApp);
  });

  describe('_extractExtraData', () => {
    it('should extract links and comments from task line', () => {
      const originalLine = '- [ ] Review PR #42 📅 2024-01-15 [PR Link](http://example.com) #urgent';
      const taskData: OFCEvent = {
        type: 'single',
        title: 'Review PR #42',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test::1'
      };

      // Access the private method for testing
      const result = (provider as any)._extractExtraData(originalLine, taskData);

      expect(result).toBe('[PR Link](http://example.com) #urgent');
    });

    it('should extract user comments after task metadata', () => {
      const originalLine = '- [x] Meeting with team ⏳ 2024-08-15 🛫 2024-08-10 Additional notes here';
      const taskData: OFCEvent = {
        type: 'single',
        title: 'Meeting with team',
        date: '2024-08-15',
        endDate: null,
        allDay: true,
        uid: 'test::1'
      };

      const result = (provider as any)._extractExtraData(originalLine, taskData);

      expect(result).toBe('Additional notes here');
    });

    it('should return empty string when no extra data exists', () => {
      const originalLine = '- [ ] Simple task 📅 2024-01-15';
      const taskData: OFCEvent = {
        type: 'single',
        title: 'Simple task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test::1'
      };

      const result = (provider as any)._extractExtraData(originalLine, taskData);

      expect(result).toBe('');
    });

    it('should preserve tags when they are part of extra data', () => {
      const originalLine = '- [ ] Task with project tag 📅 2024-01-15 #project-x #important';
      const taskData: OFCEvent = {
        type: 'single',
        title: 'Task with project tag',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test::1'
      };

      const result = (provider as any)._extractExtraData(originalLine, taskData);

      expect(result).toBe('#project-x #important');
    });

    it('should handle complex mixed extra data', () => {
      const originalLine = '- [ ] Complex task 📅 2024-01-15 [link](url) #tag additional comment';
      const taskData: OFCEvent = {
        type: 'single',
        title: 'Complex task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test::1'
      };

      const result = (provider as any)._extractExtraData(originalLine, taskData);

      expect(result).toBe('[link](url) #tag additional comment');
    });
  });

  describe('updateEvent with surgical editing', () => {
    it('should preserve extra data when updating task date', async () => {
      const handle: EventHandle = { persistentId: 'test.md::5' };
      const originalLine = '- [ ] Review code 📅 2024-01-15 [PR](https://example.com) #review';
      const fileContent = `# Tasks

Some other content

${originalLine}

More content`;

      const oldEventData: OFCEvent = {
        type: 'single',
        title: 'Review code',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test.md::5'
      };

      const newEventData: OFCEvent = {
        type: 'single',
        title: 'Review code',
        date: '2024-01-20', // Changed date
        endDate: null,
        allDay: true,
        uid: 'test.md::5'
      };

      const mockFile = { path: 'test.md' };
      mockApp.getFileByPath.mockReturnValue(mockFile);
      mockApp.read.mockResolvedValue(fileContent);

      let rewriteCallback: any;
      mockApp.rewrite.mockImplementation((file: any, callback: any) => {
        rewriteCallback = callback;
        return Promise.resolve({ file: { path: 'test.md' }, lineNumber: 5 });
      });

      await provider.updateEvent(handle, oldEventData, newEventData);

      // Verify the rewrite callback was called and check the result
      expect(mockApp.rewrite).toHaveBeenCalled();
      
      const [newContent] = rewriteCallback(fileContent);
      const lines = newContent.split('\n');
      
      // The updated line should preserve the extra data
      const expectedLine = '- [ ] Review code 📅 2024-01-20 [PR](https://example.com) #review';
      expect(lines[4]).toBe(expectedLine);
    });

    it('should work correctly when no extra data exists', async () => {
      const handle: EventHandle = { persistentId: 'test.md::3' };
      const originalLine = '- [ ] Simple task 📅 2024-01-15';
      const fileContent = `# Tasks

${originalLine}

More content`;

      const oldEventData: OFCEvent = {
        type: 'single',
        title: 'Simple task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'test.md::3'
      };

      const newEventData: OFCEvent = {
        type: 'single',
        title: 'Simple task',
        date: '2024-01-20',
        endDate: null,
        allDay: true,
        uid: 'test.md::3'
      };

      const mockFile = { path: 'test.md' };
      mockApp.getFileByPath.mockReturnValue(mockFile);
      mockApp.read.mockResolvedValue(fileContent);

      let rewriteCallback: any;
      mockApp.rewrite.mockImplementation((file: any, callback: any) => {
        rewriteCallback = callback;
        return Promise.resolve({ file: { path: 'test.md' }, lineNumber: 3 });
      });

      await provider.updateEvent(handle, oldEventData, newEventData);

      const [newContent] = rewriteCallback(fileContent);
      const lines = newContent.split('\n');
      
      // Should be just the new task line without extra spaces
      const expectedLine = '- [ ] Simple task 📅 2024-01-20';
      expect(lines[2]).toBe(expectedLine);
    });

    it('should preserve multiple types of extra data', async () => {
      const handle: EventHandle = { persistentId: 'tasks.md::1' };
      const originalLine = '- [ ] Meeting ⏳ 2024-01-15 🛫 2024-01-14 [zoom](link) #work extra notes';
      const fileContent = originalLine;

      const oldEventData: OFCEvent = {
        type: 'single',
        title: 'Meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        uid: 'tasks.md::1'
      };

      const newEventData: OFCEvent = {
        type: 'single',
        title: 'Meeting',
        date: '2024-01-16', // New date
        endDate: null,
        allDay: true,
        uid: 'tasks.md::1'
      };

      const mockFile = { path: 'tasks.md' };
      mockApp.getFileByPath.mockReturnValue(mockFile);
      mockApp.read.mockResolvedValue(fileContent);

      let rewriteCallback: any;
      mockApp.rewrite.mockImplementation((file: any, callback: any) => {
        rewriteCallback = callback;
        return Promise.resolve({ file: { path: 'tasks.md' }, lineNumber: 1 });
      });

      await provider.updateEvent(handle, oldEventData, newEventData);

      const [newContent] = rewriteCallback(fileContent);
      
      // Should preserve all extra data: link, tag, and comment
      const expectedLine = '- [ ] Meeting 📅 2024-01-16 [zoom](link) #work extra notes';
      expect(newContent.trim()).toBe(expectedLine);
    });
  });
});