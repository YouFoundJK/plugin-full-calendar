/**
 * @file TasksCompletionToggling.test.ts
 * @brief Tests for surgical completion status toggling that preserves metadata.
 *
 * @description
 * This test file specifically tests the issue where unchecking an Obsidian Tasks
 * event removes too much task information. The expected behavior is to only
 * remove the completion emoji and date while preserving all other metadata.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import { OFCEvent } from '../../types';

describe('TasksCompletionToggling', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;
  let fileContents: Map<string, string>;

  beforeEach(async () => {
    fileContents = new Map();
    
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn().mockImplementation((file: any) => {
        const content = fileContents.get(file.path);
        if (content === undefined) {
          throw new Error(`File not found: ${file.path}`);
        }
        return Promise.resolve(content);
      }),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn().mockImplementation((path: string) => {
        if (fileContents.has(path)) {
          return { path };
        }
        return null;
      }),
      getMetadata: jest.fn(),
      create: jest.fn().mockImplementation((path: string, content: string) => {
        fileContents.set(path, content);
        return Promise.resolve({ path });
      }),
      rewrite: jest.fn().mockImplementation((file: any, rewriteFn: any) => {
        const currentContent = fileContents.get(file.path) || '';
        const [newContent, location] = rewriteFn(currentContent);
        fileContents.set(file.path, newContent);
        return Promise.resolve(location);
      }),
      delete: jest.fn()
    };

    // Mock FullCalendarPlugin
    const mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockImplementation(() => {
            return Array.from(fileContents.keys()).map(path => ({ path }));
          })
        }
      },
      settings: {},
      providerRegistry: {
        refreshBacklogViews: jest.fn()
      }
    };
    
    const config: TasksProviderConfig = {
      id: 'test-tasks',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin as any, mockApp);
  });

  // Helper function to get events from the provider
  async function getTaskEvents(): Promise<any[]> {
    const eventsAndLocations = await provider.getEvents();
    return eventsAndLocations.map(([event]) => event);
  }

  describe('unchecking completed tasks', () => {
    it('should preserve all metadata when unchecking a task with rich metadata', async () => {
      // Create a task with rich metadata
      const richTaskLine = '- [x] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'test-tasks.md';
      
      // Set up the mock file
      fileContents.set(fileName, richTaskLine);
      
      // Parse the task to get the event data
      const events = await getTaskEvents();
      
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Verify it's completed
      expect(originalEvent.completed).not.toBe(false);
      
      // Create unchecked version of the event
      const uncheckedEvent: OFCEvent = {
        ...originalEvent,
        completed: false
      };
      
      // Update the event (uncheck it)
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        uncheckedEvent
      );
      
      // Read the updated file content
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // Should preserve all metadata except completion emoji and date
      const expectedLine = '- [ ] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14';
      
      expect(updatedLine).toBe(expectedLine);
    });

    it('should handle the exact example from the issue report', async () => {
      // This is the exact input from the GitHub issue
      const originalTaskLine = '- [x] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'issue-example.md';
      
      fileContents.set(fileName, originalTaskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Uncheck the task
      const uncheckedEvent: OFCEvent = {
        ...originalEvent,
        completed: false
      };
      
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        uncheckedEvent
      );
      
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // This is the expected output - should preserve ➕ and ⏳ that were missing before
      const expectedLine = '- [ ] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14';
      
      expect(updatedLine).toBe(expectedLine);
      
      // Verify that the missing emojis are preserved
      expect(updatedLine).toContain('➕ 2025-09-07'); // Date created should be preserved
      expect(updatedLine).toContain('⏳ 2025-09-08'); // Scheduled date should be preserved
      expect(updatedLine).not.toContain('✅'); // Completion emoji should be removed
    });

    it('should only remove completion emoji and its date when unchecking', async () => {
      const taskLine = '- [x] simple task 📅 2025-09-07 ✅ 2025-09-07';
      const fileName = 'test-simple.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      const uncheckedEvent: OFCEvent = {
        ...originalEvent,
        completed: false
      };
      
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        uncheckedEvent
      );
      
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // Should only change checkbox and remove completion emoji
      expect(updatedLine).toBe('- [ ] simple task 📅 2025-09-07');
    });

    it('should preserve other date emojis when unchecking', async () => {
      const taskLine = '- [x] meeting 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'test-dates.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      const uncheckedEvent: OFCEvent = {
        ...originalEvent,
        completed: false
      };
      
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        uncheckedEvent
      );
      
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // Should preserve start, scheduled, and due dates but remove completion
      expect(updatedLine).toBe('- [ ] meeting 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14');
    });
  });

  describe('checking uncompleted tasks', () => {
    it('should add completion emoji when checking a task', async () => {
      const taskLine = '- [ ] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14';
      const fileName = 'test-check.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Verify it's not completed
      expect(originalEvent.completed).toBe(false);
      
      // Create checked version of the event
      const checkedEvent: OFCEvent = {
        ...originalEvent,
        completed: DateTime.now().toISO()
      };
      
      // Update the event (check it)
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        checkedEvent
      );
      
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // Should preserve all metadata and add completion emoji with today's date
      const today = DateTime.now().toFormat('yyyy-MM-dd');
      const expectedLine = `- [x] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ ${today}`;
      
      expect(updatedLine).toBe(expectedLine);
    });
  });
});