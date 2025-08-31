/**
 * @file TasksParser.test.ts
 * @brief Tests for the TasksParser functionality
 */

import { TasksParser } from './TasksParser';
import { TaskParseResult } from './typesTasks';

describe('TasksParser', () => {
  let parser: TasksParser;

  beforeEach(() => {
    parser = new TasksParser();
  });

  describe('parseLine', () => {
    const mockFilePath = 'test.md';
    const mockLineNumber = 1;

    it('should parse a task with due date', () => {
      const line = '- [ ] Complete project 📅 2025-01-15';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Complete project');
        expect(result.task.dueDate).toBe('2025-01-15');
        expect(result.task.completed).toBe(false);
        expect(result.task.filePath).toBe(mockFilePath);
        expect(result.task.lineNumber).toBe(mockLineNumber);
      }
    });

    it('should parse a completed task with completion date', () => {
      const line = '- [x] Finished task ✅ 2025-01-14 📅 2025-01-15';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Finished task');
        expect(result.task.dueDate).toBe('2025-01-15');
        expect(result.task.completed).toBe('2025-01-14');
      }
    });

    it('should parse a task with scheduled date', () => {
      const line = '- [ ] Meeting ⏰ 2025-01-16';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Meeting');
        expect(result.task.dueDate).toBe('2025-01-16');
        expect(result.task.scheduledDate).toBe('2025-01-16');
      }
    });

    it('should parse a task with start date', () => {
      const line = '- [ ] Long project 🛫 2025-01-10';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Long project');
        expect(result.task.dueDate).toBe('2025-01-10');
        expect(result.task.startDate).toBe('2025-01-10');
      }
    });

    it('should parse an undated task', () => {
      const line = '- [ ] Buy groceries';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title).toBe('Buy groceries');
        expect(result.task.completed).toBe(false);
        expect(result.task.filePath).toBe(mockFilePath);
        expect(result.task.lineNumber).toBe(mockLineNumber);
      }
    });

    it('should return none for non-task lines', () => {
      const line = 'This is just regular text';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('none');
    });

    it('should return none for non-checkbox list items', () => {
      const line = '- Regular list item';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('none');
    });

    it('should clean title by removing date emojis', () => {
      const line = '- [ ] Task with multiple dates 📅 2025-01-15 ⏰ 2025-01-16 🛫 2025-01-10';
      const result = parser.parseLine(line, mockFilePath, mockLineNumber);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with multiple dates');
      }
    });
  });

  describe('generateTaskId and parseTaskId', () => {
    it('should generate and parse task IDs correctly', () => {
      const filePath = 'folder/test.md';
      const lineNumber = 42;
      
      const taskId = parser.generateTaskId(filePath, lineNumber);
      expect(taskId).toBe('folder/test.md::42');
      
      const parsed = parser.parseTaskId(taskId);
      expect(parsed).toEqual({ filePath, lineNumber });
    });

    it('should return null for invalid task IDs', () => {
      expect(parser.parseTaskId('invalid')).toBeNull();
      expect(parser.parseTaskId('invalid::notanumber')).toBeNull();
    });
  });

  describe('convertToOFCEvent', () => {
    it('should convert ParsedDatedTask to OFCEvent', () => {
      const parsedTask = {
        title: 'Test task',
        completed: false,
        dueDate: '2025-01-15',
        filePath: 'test.md',
        lineNumber: 1,
        originalLine: '- [ ] Test task 📅 2025-01-15'
      };

      const event = parser.convertToOFCEvent(parsedTask);

      expect(event.title).toBe('Test task');
      expect(event.type).toBe('single');
      expect(event.allDay).toBe(true);
      if (event.type === 'single') {
        expect(event.date).toBe('2025-01-15');
        expect(event.endDate).toBeNull();
        expect(event.completed).toBe(false);
      }
    });

    it('should handle completed tasks correctly', () => {
      const parsedTask = {
        title: 'Completed task',
        completed: '2025-01-14',
        dueDate: '2025-01-15',
        filePath: 'test.md',
        lineNumber: 1,
        originalLine: '- [x] Completed task ✅ 2025-01-14 📅 2025-01-15'
      };

      const event = parser.convertToOFCEvent(parsedTask);

      if (event.type === 'single') {
        expect(event.completed).toBe('2025-01-14');
      }
    });
  });
});