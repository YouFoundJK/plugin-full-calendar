/**
 * @file TasksCompletionEdgeCases.test.ts
 * @brief Edge case tests for surgical completion status toggling.
 *
 * @description
 * Additional tests to verify the surgical modification handles various
 * edge cases properly.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import { OFCEvent } from '../../types';

describe('TasksCompletionEdgeCases', () => {
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

  describe('edge cases for surgical modification', () => {
    it('should handle multiple completion emojis', async () => {
      // Task with multiple completion emojis
      const taskLine = '- [x] task ✅ 2025-09-07 ❌ 2025-09-06 📅 2025-09-14';
      const fileName = 'test-multiple-completion.md';
      
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
      
      // Should remove all completion emojis but preserve other metadata
      expect(updatedLine).toBe('- [ ] task 📅 2025-09-14');
      expect(updatedLine).not.toContain('✅');
      expect(updatedLine).not.toContain('❌');
    });

    it('should handle completion emoji without date', async () => {
      const taskLine = '- [x] task ✅ 📅 2025-09-14';
      const fileName = 'test-completion-no-date.md';
      
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
      
      // Should remove completion emoji but preserve due date
      expect(updatedLine).toBe('- [ ] task 📅 2025-09-14');
    });

    it('should handle spacing correctly when removing completion emojis', async () => {
      const taskLine = '- [x] task   ✅   2025-09-07   📅 2025-09-14';
      const fileName = 'test-spacing.md';
      
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
      
      // Should normalize spacing when removing completion
      expect(updatedLine).toBe('- [ ] task 📅 2025-09-14');
    });

    it('should handle title changes separately from completion changes', async () => {
      const taskLine = '- [x] old task 🆔 12 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'test-title-change.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Change both title and completion status
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        title: 'new task title',
        completed: false
      };
      
      await provider.updateEvent(
        { persistentId: `${fileName}::1` },
        originalEvent,
        modifiedEvent
      );
      
      const updatedContent = fileContents.get(fileName);
      const updatedLine = updatedContent?.trim();
      
      // Since title changed, should use full reconstruction, not surgical modification
      // This means metadata like 🆔 will be lost (expected behavior for non-completion-only changes)
      expect(updatedLine).toBe('- [ ] new task title 📅 2025-09-14');
      expect(updatedLine).not.toContain('🆔'); // Lost due to full reconstruction
    });

    it('should preserve all metadata when only completion status changes', async () => {
      const taskLine = '- [x] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'test-completion-only.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Only change completion status
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
      
      // Should preserve all metadata since only completion changed
      expect(updatedLine).toBe('- [ ] task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14');
      expect(updatedLine).toContain('🆔 12'); // Preserved
      expect(updatedLine).toContain('⛔ 21'); // Preserved
      expect(updatedLine).toContain('⏫'); // Preserved
      expect(updatedLine).toContain('🏁 keep'); // Preserved
      expect(updatedLine).not.toContain('✅'); // Removed
    });
  });
});