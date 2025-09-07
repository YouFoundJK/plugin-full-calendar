/**
 * @file TaskSurgicalEditing.test.ts
 * @brief Comprehensive tests for the generalized surgical editing system.
 *
 * @description
 * This test file validates that the new surgical editing architecture
 * can handle all types of task modifications while preserving metadata,
 * following the SOLID/DRY principles requested by the user.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import { OFCEvent } from '../../types';

describe('TaskSurgicalEditing', () => {
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

  describe('completion surgical editing', () => {
    it('should surgically modify completion status while preserving rich metadata', async () => {
      // Rich task with lots of metadata
      const richTaskLine = '- [x] Complex task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14 ✅ 2025-09-07';
      const fileName = 'test-completion.md';
      
      fileContents.set(fileName, richTaskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Modify only completion status
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        completed: false
      };
      
      // Update the event
      const handle = provider.getEventHandle(originalEvent);
      expect(handle).not.toBeNull();
      
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      // Verify the line was modified surgically
      const updatedContent = fileContents.get(fileName);
      expect(updatedContent).toBe('- [ ] Complex task 🆔 12 ⛔ 21 ⏫ 🏁 keep ➕ 2025-09-07 🛫 2025-09-07 ⏳ 2025-09-08 📅 2025-09-14');
      
      // Only completion emoji should be removed, all other metadata preserved
      expect(updatedContent).toContain('🆔 12');
      expect(updatedContent).toContain('⛔ 21');
      expect(updatedContent).toContain('⏫');
      expect(updatedContent).toContain('🏁 keep');
      expect(updatedContent).toContain('➕ 2025-09-07');
      expect(updatedContent).toContain('🛫 2025-09-07');
      expect(updatedContent).toContain('⏳ 2025-09-08');
      expect(updatedContent).toContain('📅 2025-09-14');
      expect(updatedContent).not.toContain('✅');
    });
  });

  describe('title surgical editing', () => {
    it('should surgically modify title while preserving all metadata', async () => {
      const taskLine = '- [ ] Original title 🆔 123 📅 2025-09-14 ⏫ urgent';
      const fileName = 'test-title.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Modify only title
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        title: 'New amazing title'
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      expect(updatedContent).toBe('- [ ] New amazing title 🆔 123 📅 2025-09-14 ⏫ urgent');
      
      // All metadata should be preserved
      expect(updatedContent).toContain('🆔 123');
      expect(updatedContent).toContain('📅 2025-09-14');
      expect(updatedContent).toContain('⏫ urgent');
    });

    it('should handle title changes with complex metadata patterns', async () => {
      const taskLine = '- [x] Buy groceries 🆔 abc-123 ⛔ high ➕ 2025-01-01 📅 2025-09-15 ✅ 2025-09-14';
      const fileName = 'test-title-complex.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      const [originalEvent] = events;
      
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        title: 'Purchase organic vegetables'
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      expect(updatedContent).toBe('- [x] Purchase organic vegetables 🆔 abc-123 ⛔ high ➕ 2025-01-01 📅 2025-09-15 ✅ 2025-09-14');
    });
  });

  describe('date surgical editing', () => {
    it('should surgically modify due date while preserving other metadata', async () => {
      const taskLine = '- [ ] Project deadline 🆔 proj-1 ⏫ high 📅 2025-09-14 ➕ 2025-09-01';
      const fileName = 'test-date.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      const [originalEvent] = events;
      
      // Modify only the date
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        date: '2025-12-25'
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      
      // Date should be updated surgically
      expect(updatedContent).toContain('📅 2025-12-25');
      // Other metadata should be preserved
      expect(updatedContent).toContain('🆔 proj-1');
      expect(updatedContent).toContain('⏫ high');
      expect(updatedContent).toContain('➕ 2025-09-01');
      expect(updatedContent).not.toContain('📅 2025-09-14');
    });

    it('should handle due date changes surgically', async () => {
      // Test changing an existing due date  
      const taskLine = '- [ ] Task with due date 📅 2025-09-14';
      const fileName = 'test-duedate.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      const [originalEvent] = events;
      
      // Modify the due date
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        date: '2025-12-25'
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      
      // Should update the existing due date
      expect(updatedContent).toContain('📅 2025-12-25');
      expect(updatedContent).not.toContain('📅 2025-09-14');
      expect(updatedContent).toBe('- [ ] Task with due date 📅 2025-12-25');
    });
  });

  describe('fallback to full reconstruction', () => {
    it('should fall back to full reconstruction for complex multi-field changes', async () => {
      const taskLine = '- [ ] Original task 📅 2025-09-14 🆔 123';
      const fileName = 'test-fallback.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      const [originalEvent] = events;
      
      // Modify multiple fields that no single surgical editor can handle
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        title: 'Completely new task',
        date: '2025-12-25',
        completed: DateTime.now().toISO() // Adding completion too
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      
      // Should have been reconstructed fully
      expect(updatedContent).toContain('Completely new task');
      expect(updatedContent).toContain('📅 2025-12-25');
      expect(updatedContent).not.toContain('Original task');
      expect(updatedContent).not.toContain('📅 2025-09-14');
      
      // Note: Full reconstruction loses non-standard metadata like 🆔
      // This is expected behavior for complex changes
    });
  });

  describe('surgical editor priority', () => {
    it('should use the most specific surgical editor available', async () => {
      const taskLine = '- [ ] Task with metadata 🆔 123 📅 2025-09-14 ⏫ high';
      const fileName = 'test-priority.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      const [originalEvent] = events;
      
      // Only change completion - should use CompletionSurgicalEditor
      const completionOnlyEvent: OFCEvent = {
        ...originalEvent,
        completed: DateTime.now().toISO()
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, completionOnlyEvent);
      
      const updatedContent = fileContents.get(fileName);
      
      // Should preserve all original metadata because completion editor was used
      expect(updatedContent).toContain('🆔 123');
      expect(updatedContent).toContain('📅 2025-09-14');
      expect(updatedContent).toContain('⏫ high');
      expect(updatedContent).toContain('[x]');
      expect(updatedContent).toContain('✅');
    });
  });

  describe('edge cases', () => {
    it('should handle tasks with no metadata gracefully', async () => {
      const taskLine = '- [ ] Simple task';
      const fileName = 'test-simple.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(0); // No date, so not a dated task
      
      // This is expected - simple tasks without dates aren't handled by the Tasks provider
    });

    it('should handle tasks with only title and date', async () => {
      const taskLine = '- [ ] Simple dated task 📅 2025-09-14';
      const fileName = 'test-simple-dated.md';
      
      fileContents.set(fileName, taskLine);
      
      const events = await getTaskEvents();
      expect(events).toHaveLength(1);
      const [originalEvent] = events;
      
      // Change title only
      const modifiedEvent: OFCEvent = {
        ...originalEvent,
        title: 'Updated simple task'
      };
      
      const handle = provider.getEventHandle(originalEvent);
      await provider.updateEvent(handle!, originalEvent, modifiedEvent);
      
      const updatedContent = fileContents.get(fileName);
      expect(updatedContent).toBe('- [ ] Updated simple task 📅 2025-09-14');
    });
  });
});