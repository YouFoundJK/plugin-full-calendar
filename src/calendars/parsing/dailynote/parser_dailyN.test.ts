/**
 * @file parser_dailyN.test.ts
 * @brief Comprehensive tests for daily note parser functionality
 */

import { CachedMetadata, HeadingCache, ListItemCache, Loc, Pos } from 'obsidian';
import {
  getAllInlineEventsFromFile,
  serializeEvent,
  addToHeading,
  getListsUnderHeading,
  fieldRegex,
  listRegex,
  getInlineEventFromLine
} from './parser_dailyN';
import { OFCEvent } from '../../../types';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../../types/settings';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    TFile: class {},
    CachedMetadata: class {},
    HeadingCache: class {},
    ListItemCache: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
  }),
  { virtual: true }
);

jest.mock('../../../types', () => ({
  validateEvent: jest.fn(event => event)
}));

jest.mock('../categoryParser', () => ({
  parseTitle: jest.fn((title, settings) => ({ title: title, category: null })),
  constructTitle: jest.fn((category, title) => title)
}));

import { parseTitle, constructTitle } from '../categoryParser';
import { validateEvent } from '../../../types';

const mockParseTitle = parseTitle as jest.MockedFunction<typeof parseTitle>;
const mockConstructTitle = constructTitle as jest.MockedFunction<typeof constructTitle>;
const mockValidateEvent = validateEvent as jest.MockedFunction<typeof validateEvent>;

describe('Daily Note Parser', () => {
  let settings: FullCalendarSettings;

  beforeEach(() => {
    settings = {
      ...DEFAULT_SETTINGS,
      dailynote: {
        enabled: true,
        format: 'YYYY-MM-DD',
        folder: 'Daily Notes',
        tag: 'daily',
        header: 'Events'
      }
    };

    // Reset mocks
    jest.clearAllMocks();
    mockParseTitle.mockImplementation((title) => ({ title, category: null }));
    mockConstructTitle.mockImplementation((_, title) => title);
    mockValidateEvent.mockImplementation(event => event);
  });

  describe('getAllInlineEventsFromFile', () => {
    it('should parse simple task events', () => {
      const content = `# Events
- [ ] Meeting with team [startTime:: 09:00] [endTime:: 10:00]
- [x] Doctor appointment [startTime:: 14:00] [endTime:: 15:00] [completed:: 2024-01-15T15:00:00.000Z]`;

      const mockListItems: ListItemCache[] = [
        {
          position: {
            start: { line: 1, col: 0, offset: 9 },
            end: { line: 1, col: 70, offset: 79 }
          },
          parent: -1,
          task: ' '
        } as ListItemCache,
        {
          position: {
            start: { line: 2, col: 0, offset: 80 },
            end: { line: 2, col: 95, offset: 175 }
          },
          parent: -1,
          task: 'x'
        } as ListItemCache
      ];

      const events = getAllInlineEventsFromFile(content, mockListItems, { date: '2024-01-15' });

      expect(events).toHaveLength(2);
      
      expect(events[0].event).toMatchObject({
        type: 'single',
        title: 'Meeting with team',
        date: '2024-01-15',
        allDay: false,
        startTime: '09:00',
        endTime: '10:00',
        isTask: true,
        completed: false
      });

      expect(events[1].event).toMatchObject({
        type: 'single',
        title: 'Doctor appointment',
        date: '2024-01-15',
        allDay: false,
        startTime: '14:00',
        endTime: '15:00',
        isTask: true,
        completed: '2024-01-15T15:00:00.000Z'
      });
    });

    it('should parse all-day events', () => {
      const content = `# Events
- Conference [allDay:: true]
- Holiday [allDay:: true] [endDate:: 2024-01-17]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 25, offset: 34 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 35 },
              end: { line: 2, col: 45, offset: 80 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 2, col: 45, offset: 80 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(2);
      
      expect(events[0][0]).toMatchObject({
        type: 'single',
        title: 'Conference',
        date: '2024-01-15',
        allDay: true
      });

      expect(events[1][0]).toMatchObject({
        type: 'single',
        title: 'Holiday',
        date: '2024-01-15',
        endDate: '2024-01-17',
        allDay: true
      });
    });

    it('should parse recurring events', () => {
      const content = `# Events
- Daily standup [daysOfWeek:: M,T,W,T,F] [startTime:: 09:00] [endTime:: 09:15]
- Weekly review [daysOfWeek:: F] [startTime:: 16:00] [endTime:: 17:00]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 75, offset: 84 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 85 },
              end: { line: 2, col: 70, offset: 155 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 2, col: 70, offset: 155 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(2);
      
      expect(events[0][0]).toMatchObject({
        type: 'recurring',
        title: 'Daily standup',
        daysOfWeek: ['M', 'T', 'W', 'T', 'F'],
        allDay: false,
        startTime: '09:00',
        endTime: '09:15'
      });

      expect(events[1][0]).toMatchObject({
        type: 'recurring',
        title: 'Weekly review',
        daysOfWeek: ['F'],
        allDay: false,
        startTime: '16:00',
        endTime: '17:00'
      });
    });

    it('should handle events with categories', () => {
      const content = `# Events
- Work - Team meeting [startTime:: 10:00] [endTime:: 11:00]
- Personal - Gym session [startTime:: 18:00] [endTime:: 19:00]`;

      mockParseTitle.mockImplementation((title) => {
        if (title === 'Work - Team meeting') {
          return { title: 'Team meeting', category: 'Work' };
        }
        if (title === 'Personal - Gym session') {
          return { title: 'Gym session', category: 'Personal' };
        }
        return { title, category: null };
      });

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 55, offset: 64 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 65 },
              end: { line: 2, col: 60, offset: 125 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 2, col: 60, offset: 125 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(2);
      expect(mockParseTitle).toHaveBeenCalledWith('Work - Team meeting', settings);
      expect(mockParseTitle).toHaveBeenCalledWith('Personal - Gym session', settings);
    });

    it('should handle events under different headings', () => {
      const content = `# Meetings
- Team sync [startTime:: 09:00] [endTime:: 10:00]

# Personal
- Lunch with friend [startTime:: 12:00] [endTime:: 13:00]`;

      settings.dailynote.header = 'Meetings';

      const mockMetadata: CachedMetadata = {
        headings: [
          {
            heading: 'Meetings',
            level: 1,
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 10, offset: 10 }
            }
          } as HeadingCache,
          {
            heading: 'Personal',
            level: 1,
            position: {
              start: { line: 2, col: 0, offset: 60 },
              end: { line: 2, col: 10, offset: 70 }
            }
          } as HeadingCache
        ],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 11 },
              end: { line: 1, col: 45, offset: 56 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 3, col: 0, offset: 71 },
              end: { line: 3, col: 50, offset: 121 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 3, col: 50, offset: 121 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      // Should only parse events under the specified heading
      expect(events).toHaveLength(1);
      expect(events[0][0].title).toBe('Team sync');
    });

    it('should handle events with RRule syntax', () => {
      const content = `# Events
- Daily meditation [rrule:: FREQ=DAILY;INTERVAL=1] [startTime:: 06:00] [endTime:: 06:30]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [{
          position: {
            start: { line: 1, col: 0, offset: 9 },
            end: { line: 1, col: 85, offset: 94 }
          },
          parent: -1
        } as ListItemCache],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 1, col: 85, offset: 94 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(1);
      expect(events[0][0]).toMatchObject({
        type: 'rrule',
        title: 'Daily meditation',
        rrule: 'FREQ=DAILY;INTERVAL=1',
        allDay: false,
        startTime: '06:00',
        endTime: '06:30'
      });
    });

    it('should handle empty content gracefully', () => {
      const content = '';
      const mockMetadata: CachedMetadata = {};

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(0);
    });

    it('should handle missing heading gracefully', () => {
      const content = `# Other Heading
- Some item [startTime:: 10:00]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Other Heading',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 15, offset: 15 }
          }
        } as HeadingCache],
        listItems: [{
          position: {
            start: { line: 1, col: 0, offset: 16 },
            end: { line: 1, col: 30, offset: 46 }
          },
          parent: -1
        } as ListItemCache],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 1, col: 30, offset: 46 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(0);
    });

    it('should skip invalid list items', () => {
      const content = `# Events
- Valid event [startTime:: 10:00] [endTime:: 11:00]
- Invalid event [startTime:: invalid-time]
- Another valid event [allDay:: true]`;

      mockValidateEvent.mockImplementation((event) => {
        if (event.startTime === 'invalid-time') {
          throw new Error('Invalid time');
        }
        return event;
      });

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 50, offset: 59 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 60 },
              end: { line: 2, col: 40, offset: 100 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 3, col: 0, offset: 101 },
              end: { line: 3, col: 35, offset: 136 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 3, col: 35, offset: 136 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(2); // Should skip the invalid event
      expect(events[0][0].title).toBe('Valid event');
      expect(events[1][0].title).toBe('Another valid event');
    });
  });

  describe('serializeEvent', () => {
    it('should serialize simple task event', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Team meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00',
        isTask: true,
        completed: false
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- [ ] Team meeting [startTime:: 10:00] [endTime:: 11:00]');
    });

    it('should serialize completed task event', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Submit report',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '15:00',
        isTask: true,
        completed: '2024-01-15T15:00:00.000Z'
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- [x] Submit report [startTime:: 14:00] [endTime:: 15:00] [completed:: 2024-01-15T15:00:00.000Z]');
    });

    it('should serialize all-day event', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Conference',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- Conference [allDay:: true]');
    });

    it('should serialize multi-day event', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Vacation',
        date: '2024-01-15',
        endDate: '2024-01-18',
        allDay: true
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- Vacation [allDay:: true] [endDate:: 2024-01-18]');
    });

    it('should serialize recurring event', () => {
      const event: OFCEvent = {
        type: 'recurring',
        title: 'Weekly standup',
        daysOfWeek: ['M', 'W', 'F'],
        allDay: false,
        startTime: '09:00',
        endTime: '09:30'
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- Weekly standup [daysOfWeek:: M,W,F] [startTime:: 09:00] [endTime:: 09:30]');
    });

    it('should serialize RRule event', () => {
      const event: OFCEvent = {
        type: 'rrule',
        title: 'Monthly review',
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        allDay: false,
        startTime: '15:00',
        endTime: '16:00'
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- Monthly review [rrule:: FREQ=MONTHLY;BYMONTHDAY=1] [startTime:: 15:00] [endTime:: 16:00]');
    });

    it('should serialize event with category', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Team meeting',
        date: '2024-01-15',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '11:00'
      };

      mockConstructTitle.mockReturnValue('Work - Team meeting');

      const result = serializeEvent(event, settings, 'Work');

      expect(result).toBe('- Work - Team meeting [startTime:: 10:00] [endTime:: 11:00]');
      expect(mockConstructTitle).toHaveBeenCalledWith('Work', 'Team meeting');
    });

    it('should handle custom task marker', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Important task',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        isTask: true,
        completed: '!'
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- [!] Important task [allDay:: true] [completed:: !]');
    });

    it('should handle boolean fields correctly', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Event',
        date: '2024-01-15',
        endDate: null,
        allDay: true,
        isTask: false
      };

      const result = serializeEvent(event, settings);

      expect(result).toBe('- Event [allDay:: true] [isTask:: false]');
    });
  });

  describe('addToHeading', () => {
    it('should add event to existing heading', () => {
      const content = `# Events
- Existing event

# Other Section
- Other content`;

      const event: OFCEvent = {
        type: 'single',
        title: 'New event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const heading: HeadingCache = {
        heading: 'Events',
        level: 1,
        position: {
          start: { line: 0, col: 0, offset: 0 },
          end: { line: 0, col: 8, offset: 8 }
        }
      };

      const result = addToHeading({
        heading,
        item: event,
        headingText: 'Events'
      }, content, settings);

      expect(result.content).toContain('- New event [allDay:: true]');
      expect(result.lineNumber).toBeGreaterThan(0);
    });

    it('should create heading if it does not exist', () => {
      const content = `# Other Section
- Other content`;

      const event: OFCEvent = {
        type: 'single',
        title: 'New event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const result = addToHeading({
        heading: undefined,
        item: event,
        headingText: 'Events'
      }, content, settings);

      expect(result.content).toContain('# Events');
      expect(result.content).toContain('- New event [allDay:: true]');
    });

    it('should handle empty content', () => {
      const content = '';

      const event: OFCEvent = {
        type: 'single',
        title: 'First event',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      const result = addToHeading({
        heading: undefined,
        item: event,
        headingText: 'Events'
      }, content, settings);

      expect(result.content).toBe('# Events\n- First event [allDay:: true]\n');
    });
  });

  describe('getListsUnderHeading', () => {
    it('should return lists under specified heading', () => {
      const mockMetadata: CachedMetadata = {
        headings: [
          {
            heading: 'Events',
            level: 1,
            position: {
              start: { line: 0, col: 0, offset: 0 },
              end: { line: 0, col: 8, offset: 8 }
            }
          } as HeadingCache,
          {
            heading: 'Other',
            level: 1,
            position: {
              start: { line: 3, col: 0, offset: 50 },
              end: { line: 3, col: 7, offset: 57 }
            }
          } as HeadingCache
        ],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 20, offset: 29 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 30 },
              end: { line: 2, col: 25, offset: 55 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 4, col: 0, offset: 58 },
              end: { line: 4, col: 15, offset: 73 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 4, col: 15, offset: 73 }
          }
        }]
      };

      const lists = getListsUnderHeading('Events', mockMetadata);

      expect(lists).toHaveLength(2);
      expect(lists[0].position.start.line).toBe(1);
      expect(lists[1].position.start.line).toBe(2);
    });

    it('should return empty array for non-existent heading', () => {
      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Other',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 7, offset: 7 }
          }
        } as HeadingCache],
        listItems: [{
          position: {
            start: { line: 1, col: 0, offset: 8 },
            end: { line: 1, col: 20, offset: 28 }
          },
          parent: -1
        } as ListItemCache],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 1, col: 20, offset: 28 }
          }
        }]
      };

      const lists = getListsUnderHeading('Events', mockMetadata);

      expect(lists).toHaveLength(0);
    });

    it('should return empty array when no list items exist', () => {
      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        }]
      };

      const lists = getListsUnderHeading('Events', mockMetadata);

      expect(lists).toHaveLength(0);
    });
  });

  describe('regex patterns', () => {
    describe('fieldRegex', () => {
      it('should match inline field patterns', () => {
        const text = 'Meeting [startTime:: 10:00] [endTime:: 11:00]';
        const matches = text.match(fieldRegex);

        expect(matches).toHaveLength(2);
        expect(matches![0]).toBe(' [startTime:: 10:00]');
        expect(matches![1]).toBe(' [endTime:: 11:00]');
      });

      it('should handle fields with spaces', () => {
        const text = 'Event [field with spaces:: value]';
        const matches = text.match(fieldRegex);

        expect(matches).toHaveLength(1);
        expect(matches![0]).toBe(' [field with spaces:: value]');
      });
    });

    describe('listRegex', () => {
      it('should match list items with tasks', () => {
        const testCases = [
          '- [ ] Task item',
          '  - [x] Completed task',
          '\t- [!] Priority task',
          '- Regular item'
        ];

        testCases.forEach(test => {
          const match = test.match(listRegex);
          expect(match).toBeTruthy();
        });
      });

      it('should capture indentation and task markers', () => {
        const text = '  - [x] Completed task';
        const match = text.match(listRegex);

        expect(match![1]).toBe('  '); // Indentation
        expect(match![3]).toBe('x'); // Task marker
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed inline fields gracefully', () => {
      const content = `# Events
- Event [startTime:: 10:00 [endTime:: 11:00]`; // Malformed

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [{
          position: {
            start: { line: 1, col: 0, offset: 9 },
            end: { line: 1, col: 45, offset: 54 }
          },
          parent: -1
        } as ListItemCache],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 1, col: 45, offset: 54 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      // Should parse what it can
      expect(events).toHaveLength(1);
    });

    it('should handle nested list items', () => {
      const content = `# Events
- Main event [startTime:: 10:00]
  - Sub item [startTime:: 11:00]
- Another event [startTime:: 14:00]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 35, offset: 44 }
            },
            parent: -1
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 2, offset: 47 },
              end: { line: 2, col: 32, offset: 77 }
            },
            parent: 0
          } as ListItemCache,
          {
            position: {
              start: { line: 3, col: 0, offset: 78 },
              end: { line: 3, col: 35, offset: 113 }
            },
            parent: -1
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 3, col: 35, offset: 113 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      // Should parse all items, including nested ones
      expect(events).toHaveLength(3);
    });

    it('should handle mixed checkbox states', () => {
      const content = `# Events
- [x] Completed [startTime:: 09:00]
- [ ] Pending [startTime:: 10:00]
- [!] Priority [startTime:: 11:00]
- [?] Question [startTime:: 12:00]`;

      const mockMetadata: CachedMetadata = {
        headings: [{
          heading: 'Events',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 8, offset: 8 }
          }
        } as HeadingCache],
        listItems: [
          {
            position: {
              start: { line: 1, col: 0, offset: 9 },
              end: { line: 1, col: 30, offset: 39 }
            },
            parent: -1,
            task: 'x'
          } as ListItemCache,
          {
            position: {
              start: { line: 2, col: 0, offset: 40 },
              end: { line: 2, col: 30, offset: 70 }
            },
            parent: -1,
            task: ' '
          } as ListItemCache,
          {
            position: {
              start: { line: 3, col: 0, offset: 71 },
              end: { line: 3, col: 30, offset: 101 }
            },
            parent: -1,
            task: '!'
          } as ListItemCache,
          {
            position: {
              start: { line: 4, col: 0, offset: 102 },
              end: { line: 4, col: 30, offset: 132 }
            },
            parent: -1,
            task: '?'
          } as ListItemCache
        ],
        sections: [{
          type: 'heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 4, col: 30, offset: 132 }
          }
        }]
      };

      const events = parseEvents(content, '2024-01-15', mockMetadata, settings);

      expect(events).toHaveLength(4);
      expect(events[0][0].completed).toBe('x');
      expect(events[1][0].completed).toBe(false);
      expect(events[2][0].completed).toBe('!');
      expect(events[3][0].completed).toBe('?');
    });
  });
});