/**
 * @file TasksParser.test.ts
 * @brief Unit tests for TasksParser functionality.
 *
 * @license See LICENSE.md
 */

import { TasksParser } from './TasksParser';

describe('TasksParser', () => {
  let parser: TasksParser;

  beforeEach(() => {
    parser = new TasksParser();
  });

  describe('parseLine', () => {
    it('should parse a simple task with due date', () => {
      const line = '- [ ] Complete the report 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Complete the report');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.isDone).toBe(false);
        expect(result.task.location.path).toBe('test.md');
        expect(result.task.location.lineNumber).toBe(1);
      }
    });

    // New tests for enhanced parsing
    it('should parse a task with start date only', () => {
      const line = '- [ ] Task with start date 🛫 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with start date');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate).toBeUndefined();
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Legacy compatibility
      }
    });

    it('should parse a task with scheduled date only', () => {
      const line = '- [ ] Task with scheduled date ⏳ 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with scheduled date');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate).toBeUndefined();
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Legacy compatibility
      }
    });

    it('should parse a multi-day task with start and due dates', () => {
      const line = '- [ ] Multi-day project 🛫 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Multi-day project');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Primary date is start date
      }
    });

    it('should parse a task with scheduled and due dates', () => {
      const line = '- [ ] Task with schedule and due ⏳ 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with schedule and due');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Primary date is start date
      }
    });

    it('should prefer start date over scheduled date when both present', () => {
      const line =
        '- [ ] Task with both start and scheduled 🛫 2024-01-10 ⏳ 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with both start and scheduled');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-10'); // Start has precedence
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-10');
      }
    });

    it('should recognize completed tasks with done emoji', () => {
      const line = '- [x] Completed task ✅ 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Completed task');
        expect(result.task.isDone).toBe(true);
      }
    });

    it('should recognize cancelled tasks', () => {
      const line = '- [ ] Cancelled task ❌ 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Cancelled task');
        expect(result.task.isDone).toBe(true); // Cancelled is treated as done
      }
    });

    it('should clean title by removing all task emojis', () => {
      const line = '- [ ] Complex task 🛫 2024-01-15 📅 2024-01-18 ✅ #tag @person';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Complex task #tag @person'); // Should preserve non-date metadata
      }
    });

    it('should parse a completed task', () => {
      const line = '- [x] Buy groceries 📅 2024-01-10';
      const result = parser.parseLine(line, 'test.md', 5);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Buy groceries');
        expect(result.task.isDone).toBe(true);
        expect(result.task.location.lineNumber).toBe(5);
      }
    });

    it('should return none for non-checklist items', () => {
      const line = 'Just a regular line of text 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('none');
    });

    it('should return undated for tasks without due dates', () => {
      const line = '- [ ] Task without date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title).toBe('Task without date');
        expect(result.task.isDone).toBe(false);
        expect(result.task.location.path).toBe('test.md');
        expect(result.task.location.lineNumber).toBe(1);
      }
    });

    it('should handle different date formats', () => {
      const testCases = [
        '- [ ] Task 1 📅 2024-01-15',
        '- [ ] Task 2 📅 2024/01/15',
        '- [ ] Task 3 📅 15-01-2024',
        '- [ ] Task 4 📅 15/01/2024',
        '- [ ] Task 5 📅 15.01.2024'
      ];

      testCases.forEach((line, index) => {
        const result = parser.parseLine(line, 'test.md', index + 1);
        expect(result.type).toBe('dated');
        if (result.type === 'dated') {
          expect(result.task.title).toBe(`Task ${index + 1}`);
          // All should parse to the same date (January 15, 2024)
          expect(result.task.date.month).toBe(1);
          expect(result.task.date.day).toBe(15);
          expect(result.task.date.year).toBe(2024);
        }
      });
    });

    it('should return undated for invalid dates', () => {
      const line = '- [ ] Task with bad date 📅 invalid-date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title.trim()).toBe('Task with bad date'); // Invalid date gets removed but title preserved
        expect(result.task.isDone).toBe(false);
      }
    });

    it('should handle tasks with extra content after date', () => {
      const line = '- [ ] Meeting 📅 2024-01-15 #important @john';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Meeting #important @john'); // Should preserve tags and mentions
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
      }
    });

    it('should clean task titles by removing emoji', () => {
      const line = '- [ ] Important task ⭐ 📅 2024-01-15 🔥';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Important task ⭐ 🔥'); // Should preserve non-date emojis
      }
    });

    it('should handle completed undated tasks', () => {
      const line = '- [x] Completed task without date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title).toBe('Completed task without date');
        expect(result.task.isDone).toBe(true);
      }
    });
  });

  describe('parseFileContent', () => {
    it('should parse multiple tasks from file content', () => {
      const content = `# My Tasks

- [ ] First task 📅 2024-01-15
- [x] Second task 📅 2024-01-10
- [ ] Regular task without date
- Third line is not a task

## More tasks
- [ ] Another task 📅 2024-02-01`;

      const results = parser.parseFileContent(content, 'tasks.md');

      expect(results).toHaveLength(3);

      expect(results[0].title).toBe('First task');
      expect(results[0].isDone).toBe(false);
      expect(results[0].location.lineNumber).toBe(3);

      expect(results[1].title).toBe('Second task');
      expect(results[1].isDone).toBe(true);
      expect(results[1].location.lineNumber).toBe(4);

      expect(results[2].title).toBe('Another task');
      expect(results[2].date.toFormat('yyyy-MM-dd')).toBe('2024-02-01');
      expect(results[2].location.lineNumber).toBe(9);
    });

    it('should return empty array for content without tasks', () => {
      const content = `# No Tasks Here

Just some regular content.
No checkboxes or due dates.`;

      const results = parser.parseFileContent(content, 'notes.md');

      expect(results).toHaveLength(0);
    });
  });
});
