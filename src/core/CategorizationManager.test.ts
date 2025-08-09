/**
 * @file CategorizationManager.test.ts
 * @brief Comprehensive tests for categorization management functionality
 */

import { Notice } from 'obsidian';
import { CategorizationManager } from './CategorizationManager';
import FullCalendarPlugin from '../main';
import { EditableCalendar, CategoryProvider } from '../calendars/EditableCalendar';
import { EventLocation, OFCEvent } from '../types';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    Notice: jest.fn(),
    Plugin: class {},
    TFile: class {},
    TFolder: class {
      isRoot() { return false; }
      name = 'test-folder';
    },
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
  }),
  { virtual: true }
);

const mockNotice = Notice as jest.MockedFunction<typeof Notice>;

describe('CategorizationManager', () => {
  let manager: CategorizationManager;
  let mockPlugin: jest.Mocked<FullCalendarPlugin>;
  let mockEditableCalendar1: jest.Mocked<EditableCalendar>;
  let mockEditableCalendar2: jest.Mocked<EditableCalendar>;
  let mockNonEditableCalendar: any;

  beforeEach(() => {
    // Create mock editable calendars
    mockEditableCalendar1 = {
      id: 'editable-1',
      name: 'Editable Calendar 1',
      bulkAddCategories: jest.fn().mockResolvedValue(undefined),
      bulkRemoveCategories: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockEditableCalendar2 = {
      id: 'editable-2',
      name: 'Editable Calendar 2',
      bulkAddCategories: jest.fn().mockResolvedValue(undefined),
      bulkRemoveCategories: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Create mock non-editable calendar
    mockNonEditableCalendar = {
      id: 'non-editable',
      name: 'Non-Editable Calendar'
    };

    // Create mock cache with calendars
    const mockCache = {
      calendars: new Map([
        ['editable-1', mockEditableCalendar1],
        ['editable-2', mockEditableCalendar2],
        ['non-editable', mockNonEditableCalendar]
      ]),
      isBulkUpdating: false
    };

    // Create mock file system
    const mockRootFolder = {
      isRoot: () => true,
      name: ''
    };

    const mockParentFolder = {
      isRoot: () => false,
      name: 'Events'
    };

    const mockFile = {
      path: 'Events/meeting.md',
      parent: mockParentFolder
    };

    const mockVault = {
      getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
        if (path === 'Events/meeting.md') return mockFile;
        if (path === 'root-file.md') return { path: 'root-file.md', parent: mockRootFolder };
        return null;
      })
    };

    // Create mock plugin
    mockPlugin = {
      app: {
        vault: mockVault
      } as any,
      cache: mockCache as any,
      saveSettings: jest.fn().mockResolvedValue(undefined)
    } as any;

    manager = new CategorizationManager(mockPlugin);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with plugin reference', () => {
      expect(manager).toBeInstanceOf(CategorizationManager);
    });
  });

  describe('getEditableCalendars', () => {
    it('should return only editable calendars', () => {
      const editableCalendars = (manager as any).getEditableCalendars();

      expect(editableCalendars).toHaveLength(2);
      expect(editableCalendars).toContain(mockEditableCalendar1);
      expect(editableCalendars).toContain(mockEditableCalendar2);
      expect(editableCalendars).not.toContain(mockNonEditableCalendar);
    });

    it('should return empty array when no editable calendars exist', () => {
      mockPlugin.cache.calendars.clear();

      const editableCalendars = (manager as any).getEditableCalendars();

      expect(editableCalendars).toHaveLength(0);
    });

    it('should handle mixed calendar types', () => {
      // Add more non-editable calendars
      mockPlugin.cache.calendars.set('google', { id: 'google', name: 'Google Cal' });
      mockPlugin.cache.calendars.set('ics', { id: 'ics', name: 'ICS Cal' });

      const editableCalendars = (manager as any).getEditableCalendars();

      expect(editableCalendars).toHaveLength(2);
      expect(editableCalendars.map(c => c.id)).toEqual(['editable-1', 'editable-2']);
    });
  });

  describe('performBulkOperation', () => {
    it('should execute operation when not already updating', async () => {
      const mockOperation = jest.fn().mockResolvedValue(undefined);

      await (manager as any).performBulkOperation(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('should prevent concurrent bulk operations', async () => {
      mockPlugin.cache.isBulkUpdating = true;

      const mockOperation = jest.fn().mockResolvedValue(undefined);

      await (manager as any).performBulkOperation(mockOperation);

      expect(mockOperation).not.toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith('A bulk update is already in progress.');
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('should handle operation errors gracefully', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await (manager as any).performBulkOperation(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledWith(
        'An error occurred during the bulk update. See console for details.'
      );
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(mockPlugin.cache.isBulkUpdating).toBe(false);
    });

    it('should reset bulk updating flag even if saveSettings fails', async () => {
      const mockOperation = jest.fn().mockResolvedValue(undefined);
      mockPlugin.saveSettings.mockRejectedValue(new Error('Save failed'));

      await expect((manager as any).performBulkOperation(mockOperation)).rejects.toThrow('Save failed');

      expect(mockPlugin.cache.isBulkUpdating).toBe(false);
    });

    it('should set and unset bulk updating flag correctly', async () => {
      const mockOperation = jest.fn().mockImplementation(async () => {
        expect(mockPlugin.cache.isBulkUpdating).toBe(true);
      });

      expect(mockPlugin.cache.isBulkUpdating).toBe(false);

      await (manager as any).performBulkOperation(mockOperation);

      expect(mockPlugin.cache.isBulkUpdating).toBe(false);
    });
  });

  describe('bulkUpdateCategories', () => {
    describe('smart mode', () => {
      it('should add categories based on folder structure', async () => {
        await manager.bulkUpdateCategories('smart');

        expect(mockEditableCalendar1.bulkAddCategories).toHaveBeenCalledTimes(1);
        expect(mockEditableCalendar2.bulkAddCategories).toHaveBeenCalledTimes(1);

        const [categoryProvider, force] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];
        expect(force).toBe(false);

        // Test category provider function
        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Test Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'Events/meeting.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBe('Events');
      });

      it('should handle events in root folder', async () => {
        await manager.bulkUpdateCategories('smart');

        const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Root Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'root-file.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBeUndefined();
      });

      it('should handle non-existent files', async () => {
        await manager.bulkUpdateCategories('smart');

        const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Missing File Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'non-existent.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBeUndefined();
      });
    });

    describe('force_folder mode', () => {
      it('should force add categories based on folder structure', async () => {
        await manager.bulkUpdateCategories('force_folder');

        expect(mockEditableCalendar1.bulkAddCategories).toHaveBeenCalledTimes(1);
        expect(mockEditableCalendar2.bulkAddCategories).toHaveBeenCalledTimes(1);

        const [categoryProvider, force] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];
        expect(force).toBe(true);

        // Test category provider behavior is same as smart mode
        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Test Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'Events/meeting.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBe('Events');
      });
    });

    describe('force_default mode', () => {
      it('should force add default category to all events', async () => {
        await manager.bulkUpdateCategories('force_default', 'Work');

        expect(mockEditableCalendar1.bulkAddCategories).toHaveBeenCalledTimes(1);
        expect(mockEditableCalendar2.bulkAddCategories).toHaveBeenCalledTimes(1);

        const [categoryProvider, force] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];
        expect(force).toBe(true);

        // Test category provider returns default category
        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Test Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'Events/meeting.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBe('Work');
      });

      it('should handle undefined default category', async () => {
        await manager.bulkUpdateCategories('force_default');

        const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

        const mockEvent: OFCEvent = {
          type: 'single',
          title: 'Test Event',
          date: '2024-01-15',
          endDate: null,
          allDay: true
        };

        const mockLocation: EventLocation = {
          file: { path: 'Events/meeting.md' } as any
        };

        const category = categoryProvider(mockEvent, mockLocation);
        expect(category).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should handle calendar operation failures', async () => {
        mockEditableCalendar1.bulkAddCategories.mockRejectedValue(new Error('Calendar 1 failed'));

        await manager.bulkUpdateCategories('smart');

        expect(mockNotice).toHaveBeenCalledWith(
          'An error occurred during the bulk update. See console for details.'
        );
        expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
      });

      it('should continue with other calendars if one fails', async () => {
        mockEditableCalendar1.bulkAddCategories.mockRejectedValue(new Error('Calendar 1 failed'));
        mockEditableCalendar2.bulkAddCategories.mockResolvedValue(undefined);

        await manager.bulkUpdateCategories('smart');

        expect(mockEditableCalendar1.bulkAddCategories).toHaveBeenCalledTimes(1);
        expect(mockEditableCalendar2.bulkAddCategories).toHaveBeenCalledTimes(1);
      });

      it('should handle concurrent operation attempts', async () => {
        mockPlugin.cache.isBulkUpdating = true;

        await manager.bulkUpdateCategories('smart');

        expect(mockEditableCalendar1.bulkAddCategories).not.toHaveBeenCalled();
        expect(mockEditableCalendar2.bulkAddCategories).not.toHaveBeenCalled();
        expect(mockNotice).toHaveBeenCalledWith('A bulk update is already in progress.');
      });
    });

    describe('integration scenarios', () => {
      it('should handle no editable calendars gracefully', async () => {
        mockPlugin.cache.calendars.clear();

        await manager.bulkUpdateCategories('smart');

        expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(mockNotice).not.toHaveBeenCalled();
      });

      it('should process all editable calendars in sequence', async () => {
        let calendar1Called = false;
        let calendar2Called = false;

        mockEditableCalendar1.bulkAddCategories.mockImplementation(async () => {
          calendar1Called = true;
          expect(calendar2Called).toBe(false); // Should not be called yet
        });

        mockEditableCalendar2.bulkAddCategories.mockImplementation(async () => {
          calendar2Called = true;
          expect(calendar1Called).toBe(true); // Should be called already
        });

        await manager.bulkUpdateCategories('smart');

        expect(calendar1Called).toBe(true);
        expect(calendar2Called).toBe(true);
      });
    });
  });

  describe('bulkRemoveCategories', () => {
    it('should remove categories from all editable calendars', async () => {
      const categoriesToRemove = new Set(['Work', 'Personal', 'Project']);

      await manager.bulkRemoveCategories(categoriesToRemove);

      expect(mockEditableCalendar1.bulkRemoveCategories).toHaveBeenCalledWith(categoriesToRemove);
      expect(mockEditableCalendar2.bulkRemoveCategories).toHaveBeenCalledWith(categoriesToRemove);
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('should handle empty category set', async () => {
      const emptyCategories = new Set<string>();

      await manager.bulkRemoveCategories(emptyCategories);

      expect(mockEditableCalendar1.bulkRemoveCategories).toHaveBeenCalledWith(emptyCategories);
      expect(mockEditableCalendar2.bulkRemoveCategories).toHaveBeenCalledWith(emptyCategories);
    });

    it('should handle removal operation failures', async () => {
      const categoriesToRemove = new Set(['Work']);
      mockEditableCalendar1.bulkRemoveCategories.mockRejectedValue(new Error('Removal failed'));

      await manager.bulkRemoveCategories(categoriesToRemove);

      expect(mockNotice).toHaveBeenCalledWith(
        'An error occurred during the bulk update. See console for details.'
      );
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('should prevent concurrent removal operations', async () => {
      mockPlugin.cache.isBulkUpdating = true;
      const categoriesToRemove = new Set(['Work']);

      await manager.bulkRemoveCategories(categoriesToRemove);

      expect(mockEditableCalendar1.bulkRemoveCategories).not.toHaveBeenCalled();
      expect(mockNotice).toHaveBeenCalledWith('A bulk update is already in progress.');
    });

    it('should handle large category sets', async () => {
      const largeCategories = new Set(
        Array.from({ length: 100 }, (_, i) => `Category${i}`)
      );

      await manager.bulkRemoveCategories(largeCategories);

      expect(mockEditableCalendar1.bulkRemoveCategories).toHaveBeenCalledWith(largeCategories);
      expect(mockEditableCalendar2.bulkRemoveCategories).toHaveBeenCalledWith(largeCategories);
      expect(largeCategories.size).toBe(100);
    });
  });

  describe('edge cases and complex scenarios', () => {
    it('should handle vault.getAbstractFileByPath returning null', async () => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);

      await manager.bulkUpdateCategories('smart');

      const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Missing File Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const mockLocation: EventLocation = {
        file: { path: 'missing.md' } as any
      };

      const category = categoryProvider(mockEvent, mockLocation);
      expect(category).toBeUndefined();
    });

    it('should handle files with null parent', async () => {
      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({
        path: 'orphan.md',
        parent: null
      });

      await manager.bulkUpdateCategories('smart');

      const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Orphan Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const mockLocation: EventLocation = {
        file: { path: 'orphan.md' } as any
      };

      const category = categoryProvider(mockEvent, mockLocation);
      expect(category).toBeUndefined();
    });

    it('should handle nested folder structures', async () => {
      const deepFolder = {
        isRoot: () => false,
        name: 'Projects'
      };

      mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue({
        path: 'Work/Projects/meeting.md',
        parent: deepFolder
      });

      await manager.bulkUpdateCategories('smart');

      const [categoryProvider] = mockEditableCalendar1.bulkAddCategories.mock.calls[0];

      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Deep Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const mockLocation: EventLocation = {
        file: { path: 'Work/Projects/meeting.md' } as any
      };

      const category = categoryProvider(mockEvent, mockLocation);
      expect(category).toBe('Projects');
    });

    it('should handle async operation timing correctly', async () => {
      let operationStarted = false;
      let operationCompleted = false;

      mockEditableCalendar1.bulkAddCategories.mockImplementation(async () => {
        operationStarted = true;
        await new Promise(resolve => setTimeout(resolve, 10));
        operationCompleted = true;
      });

      const updatePromise = manager.bulkUpdateCategories('smart');

      // Should not be completed immediately
      expect(operationCompleted).toBe(false);

      await updatePromise;

      expect(operationStarted).toBe(true);
      expect(operationCompleted).toBe(true);
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);
    });
  });
});