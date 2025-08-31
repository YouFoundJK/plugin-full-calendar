/**
 * @file TasksParser.test.ts
 * @brief Tests for TasksParser
 */

import { TasksParser } from './TasksParser';

describe('TasksParser', () => {
  let parser: TasksParser;

  beforeEach(() => {
    parser = new TasksParser();
  });

  describe('parseLine', () => {
    it('should identify non-task lines', () => {
      const result = parser.parseLine('# This is a heading', 'test.md', 0);
      expect(result.type).toBe('none');
    });

    it('should parse undated task', () => {
      const result = parser.parseLine('- [ ] Regular todo item', 'test.md', 1);
      expect(result.type).toBe('undated');
      
      if (result.type === 'undated') {
        expect(result.task.content).toBe('Regular todo item');
        expect(result.task.completed).toBe(false);
        expect(result.task.filePath).toBe('test.md');
        expect(result.task.lineNumber).toBe(1);
      }
    });

    it('should parse dated task with due date', () => {
      const result = parser.parseLine('- [ ] Task with due date 📅 2025-01-15', 'test.md', 2);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.content).toBe('Task with due date 📅 2025-01-15');
        expect(result.task.date).toBe('2025-01-15');
        expect(result.task.time).toBeUndefined();
        expect(result.task.completed).toBe(false);
      }
    });

    it('should parse dated task with start date', () => {
      const result = parser.parseLine('- [ ] Task with start date 🛫 2025-01-15', 'test.md', 2);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.content).toBe('Task with start date 🛫 2025-01-15');
        expect(result.task.date).toBe('2025-01-15');
        expect(result.task.time).toBeUndefined();
        expect(result.task.completed).toBe(false);
      }
    });

    it('should parse dated task with scheduled date', () => {
      const result = parser.parseLine('- [ ] Task with scheduled date ⏰ 2025-01-15', 'test.md', 2);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.content).toBe('Task with scheduled date ⏰ 2025-01-15');
        expect(result.task.date).toBe('2025-01-15');
        expect(result.task.time).toBeUndefined();
        expect(result.task.completed).toBe(false);
      }
    });

    it('should prioritize due date over start date', () => {
      const result = parser.parseLine('- [ ] Task with multiple dates 🛫 2025-01-14 📅 2025-01-15', 'test.md', 2);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.date).toBe('2025-01-15'); // Due date should win
      }
    });

    it('should parse timed task', () => {
      const result = parser.parseLine('- [ ] Timed task 📅 2025-01-16 14:30', 'test.md', 3);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.content).toBe('Timed task 📅 2025-01-16 14:30');
        expect(result.task.date).toBe('2025-01-16');
        expect(result.task.time).toBe('14:30');
        expect(result.task.completed).toBe(false);
      }
    });

    it('should parse completed task', () => {
      const result = parser.parseLine('- [x] Completed task 📅 2025-01-14', 'test.md', 4);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.completed).toBe(true);
      }
    });

    it('should parse cancelled task', () => {
      const result = parser.parseLine('- [-] Cancelled task', 'test.md', 5);
      expect(result.type).toBe('undated');
      
      if (result.type === 'undated') {
        expect(result.task.completed).toBe('cancelled');
      }
    });

    it('should handle invalid dates as undated', () => {
      const result = parser.parseLine('- [ ] Invalid date task 📅 2025-13-32', 'test.md', 6);
      expect(result.type).toBe('undated');
    });

    it('should handle indented tasks', () => {
      const result = parser.parseLine('  - [ ] Indented task 📅 2025-01-15', 'test.md', 7);
      expect(result.type).toBe('dated');
      
      if (result.type === 'dated') {
        expect(result.task.content).toBe('Indented task 📅 2025-01-15');
        expect(result.task.date).toBe('2025-01-15');
      }
    });
  });

  describe('getTaskContentWithoutDate', () => {
    it('should remove due date from content', () => {
      const content = 'Task with due date 📅 2025-01-15';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Task with due date');
    });

    it('should remove start date from content', () => {
      const content = 'Task with start date 🛫 2025-01-15';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Task with start date');
    });

    it('should remove scheduled date from content', () => {
      const content = 'Task with scheduled date ⏰2025-01-15';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Task with scheduled date');
    });

    it('should remove timed due date from content', () => {
      const content = 'Timed task 📅 2025-01-16 14:30';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Timed task');
    });

    it('should remove multiple date emojis from content', () => {
      const content = 'Complex task 🛫 2025-01-14 📅 2025-01-15 ⏰ 2025-01-16';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Complex task');
    });

    it('should remove priority emojis', () => {
      const content = 'High priority task 🔺 📅 2025-01-15';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('High priority task');
    });

    it('should handle content with multiple emojis and clean spaces', () => {
      const content = 'test   🛫   2025-09-02   🔺  ';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('test');
    });

    it('should return content unchanged if no date', () => {
      const content = 'Regular task without date';
      const cleaned = parser.getTaskContentWithoutDate(content);
      expect(cleaned).toBe('Regular task without date');
    });
  });
});