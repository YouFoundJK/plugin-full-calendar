/**
 * @file TaskSurgicalEditorUnits.test.ts
 * @brief Unit tests for individual surgical editors.
 *
 * @description
 * This test file validates the individual surgical editors in isolation,
 * demonstrating the SOLID principles and modular architecture.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { 
  CompletionSurgicalEditor, 
  TitleSurgicalEditor, 
  DateSurgicalEditor,
  TaskSurgicalEditorRegistry 
} from './surgical';
import { OFCEvent } from '../../types';

describe('TaskSurgicalEditorUnits', () => {
  
  describe('CompletionSurgicalEditor', () => {
    let editor: CompletionSurgicalEditor;
    
    beforeEach(() => {
      editor = new CompletionSurgicalEditor();
    });

    it('should identify completion-only changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: DateTime.now().toISO()
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(true);
    });

    it('should not handle title changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'Changed title'
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(false);
    });

    it('should surgically add completion', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: DateTime.now().toISO()
      };

      const originalLine = '- [ ] Test task 🆔 123 📅 2025-09-14';
      const result = editor.apply(originalLine, oldEvent, newEvent);

      expect(result).toContain('- [x] Test task');
      expect(result).toContain('🆔 123');
      expect(result).toContain('📅 2025-09-14');
      expect(result).toContain('✅');
    });

    it('should surgically remove completion', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: '2025-09-14T10:00:00Z'
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: false
      };

      const originalLine = '- [x] Test task 🆔 123 📅 2025-09-14 ✅ 2025-09-14';
      const result = editor.apply(originalLine, oldEvent, newEvent);

      expect(result).toContain('- [ ] Test task');
      expect(result).toContain('🆔 123');
      expect(result).toContain('📅 2025-09-14');
      expect(result).not.toContain('✅');
    });
  });

  describe('TitleSurgicalEditor', () => {
    let editor: TitleSurgicalEditor;
    
    beforeEach(() => {
      editor = new TitleSurgicalEditor();
    });

    it('should identify title-only changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old title',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'New title'
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(true);
    });

    it('should not handle completion changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: DateTime.now().toISO()
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(false);
    });

    it('should surgically replace title', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old title',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'New amazing title'
      };

      const originalLine = '- [ ] Old title 🆔 123 📅 2025-09-14 ⏫ high';
      const result = editor.apply(originalLine, oldEvent, newEvent);

      expect(result).toContain('- [ ] New amazing title');
      expect(result).toContain('🆔 123');
      expect(result).toContain('📅 2025-09-14');
      expect(result).toContain('⏫ high');
    });
  });

  describe('DateSurgicalEditor', () => {
    let editor: DateSurgicalEditor;
    
    beforeEach(() => {
      editor = new DateSurgicalEditor();
    });

    it('should identify date-only changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        date: '2025-12-25'
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(true);
    });

    it('should not handle title changes', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'Changed title'
      };

      expect(editor.canHandle(oldEvent, newEvent)).toBe(false);
    });

    it('should surgically replace date', () => {
      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        date: '2025-12-25'
      };

      const originalLine = '- [ ] Test task 🆔 123 📅 2025-09-14 ⏫ high';
      const result = editor.apply(originalLine, oldEvent, newEvent);

      expect(result).toContain('📅 2025-12-25');
      expect(result).toContain('🆔 123');
      expect(result).toContain('⏫ high');
      expect(result).not.toContain('📅 2025-09-14');
    });
  });

  describe('TaskSurgicalEditorRegistry', () => {
    let registry: TaskSurgicalEditorRegistry;
    
    beforeEach(() => {
      registry = new TaskSurgicalEditorRegistry();
    });

    it('should register and find editors', () => {
      const completionEditor = new CompletionSurgicalEditor();
      const titleEditor = new TitleSurgicalEditor();
      
      registry.register(completionEditor);
      registry.register(titleEditor);

      expect(registry.getRegisteredEditorNames()).toEqual([
        'CompletionSurgicalEditor',
        'TitleSurgicalEditor'
      ]);
    });

    it('should find appropriate editor for completion changes', () => {
      const completionEditor = new CompletionSurgicalEditor();
      const titleEditor = new TitleSurgicalEditor();
      
      registry.register(completionEditor);
      registry.register(titleEditor);

      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: DateTime.now().toISO()
      };

      const foundEditor = registry.findEditor(oldEvent, newEvent);
      expect(foundEditor).toBe(completionEditor);
    });

    it('should find appropriate editor for title changes', () => {
      const completionEditor = new CompletionSurgicalEditor();
      const titleEditor = new TitleSurgicalEditor();
      
      registry.register(completionEditor);
      registry.register(titleEditor);

      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old title',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'New title'
      };

      const foundEditor = registry.findEditor(oldEvent, newEvent);
      expect(foundEditor).toBe(titleEditor);
    });

    it('should return null when no editor can handle change', () => {
      const completionEditor = new CompletionSurgicalEditor();
      
      registry.register(completionEditor);

      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old title',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'New title'
      };

      const foundEditor = registry.findEditor(oldEvent, newEvent);
      expect(foundEditor).toBeNull();
    });

    it('should apply surgical edit successfully', () => {
      const completionEditor = new CompletionSurgicalEditor();
      registry.register(completionEditor);

      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Test task',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        completed: DateTime.now().toISO()
      };

      const originalLine = '- [ ] Test task 🆔 123 📅 2025-09-14';
      const result = registry.applySurgicalEdit(originalLine, oldEvent, newEvent);

      expect(result).not.toBeNull();
      expect(result).toContain('- [x] Test task');
      expect(result).toContain('✅');
    });

    it('should return null when no surgical edit is possible', () => {
      const completionEditor = new CompletionSurgicalEditor();
      registry.register(completionEditor);

      const oldEvent: OFCEvent = {
        type: 'single',
        title: 'Old title',
        date: '2025-09-14',
        allDay: true,
        endDate: null,
        completed: false
      };

      const newEvent: OFCEvent = {
        ...oldEvent,
        title: 'New title'
      };

      const originalLine = '- [ ] Old title 🆔 123 📅 2025-09-14';
      const result = registry.applySurgicalEdit(originalLine, oldEvent, newEvent);

      expect(result).toBeNull();
    });
  });

  describe('SOLID Principles Demonstration', () => {
    it('should demonstrate Single Responsibility - each editor handles one type of change', () => {
      const completionEditor = new CompletionSurgicalEditor();
      const titleEditor = new TitleSurgicalEditor();
      const dateEditor = new DateSurgicalEditor();

      // Each editor has a single, clear responsibility
      expect(completionEditor.name).toBe('CompletionSurgicalEditor');
      expect(titleEditor.name).toBe('TitleSurgicalEditor');
      expect(dateEditor.name).toBe('DateSurgicalEditor');
    });

    it('should demonstrate Open/Closed - registry is open for extension, closed for modification', () => {
      const registry = new TaskSurgicalEditorRegistry();
      
      // Can add new editors without modifying registry code
      registry.register(new CompletionSurgicalEditor());
      registry.register(new TitleSurgicalEditor());
      registry.register(new DateSurgicalEditor());

      expect(registry.getRegisteredEditorNames()).toHaveLength(3);
    });

    it('should demonstrate Dependency Inversion - high-level registry depends on abstractions', () => {
      const registry = new TaskSurgicalEditorRegistry();
      
      // Registry works with TaskSurgicalEditor interface, not concrete implementations
      const editor = new CompletionSurgicalEditor();
      registry.register(editor);
      
      // Registry doesn't need to know about specific editor implementations
      expect(registry.getRegisteredEditorNames()).toContain('CompletionSurgicalEditor');
    });
  });
});