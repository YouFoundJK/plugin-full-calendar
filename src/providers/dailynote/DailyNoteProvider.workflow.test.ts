import { moment as obsidianMoment, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import { DailyNoteProvider } from './DailyNoteProvider';
import type { ObsidianInterface } from '../../ObsidianAdapter';
import type FullCalendarPlugin from '../../main';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { OFCEvent } from '../../types';

const moment = obsidianMoment as unknown as typeof import('moment');

jest.mock('obsidian', () => {
  const toIsoDate = (input?: string | Date): string => {
    if (!input) return '1970-01-01';
    if (input instanceof Date) return input.toISOString().slice(0, 10);
    return input.slice(0, 10);
  };

  const moment = (input?: string | Date) => {
    const iso = toIsoDate(input);
    return {
      format: (_pattern?: string) => iso,
      isSameOrAfter: (other: { format: (pattern?: string) => string }) =>
        iso >= other.format('YYYY-MM-DD'),
      isSameOrBefore: (other: { format: (pattern?: string) => string }) =>
        iso <= other.format('YYYY-MM-DD')
    };
  };

  class TFile {
    path = '';
    name = '';
  }

  return {
    moment,
    TFile,
    Notice: class {},
    Modal: class {},
    PluginSettingTab: class {},
    Setting: class {
      setName() {
        return this;
      }
      setDesc() {
        return this;
      }
      addDropdown() {
        return this;
      }
      addToggle() {
        return this;
      }
      addText() {
        return this;
      }
    },
    Plugin: class {},
    App: class {}
  };
});

jest.mock('obsidian-daily-notes-interface', () => ({
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn(),
  getDailyNoteSettings: jest.fn(),
  getDateFromFile: jest.fn()
}));

const makePlugin = (): FullCalendarPlugin =>
  ({
    settings: { ...DEFAULT_SETTINGS }
  }) as unknown as FullCalendarPlugin;

const makeFile = (path: string): TFile => {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() || '';
  return file;
};

describe('DailyNoteProvider workflow', () => {
  const dailyNotesByPath = new Map<string, TFile>();
  const contentsByPath = new Map<string, string>();

  const getAllDailyNotesMock = getAllDailyNotes as jest.MockedFunction<typeof getAllDailyNotes>;
  const getDailyNoteMock = getDailyNote as jest.MockedFunction<typeof getDailyNote>;
  const createDailyNoteMock = createDailyNote as jest.MockedFunction<typeof createDailyNote>;
  const getDailyNoteSettingsMock = getDailyNoteSettings as jest.MockedFunction<
    typeof getDailyNoteSettings
  >;
  const getDateFromFileMock = getDateFromFile as jest.MockedFunction<typeof getDateFromFile>;

  const createMockApp = (): ObsidianInterface => ({
    getAbstractFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
    getFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
    getMetadata: (_file: TFile) => ({ headings: [] }) as CachedMetadata,
    waitForMetadata: (_file: TFile) => Promise.resolve({ headings: [] } as CachedMetadata),
    read: (file: TFile) => Promise.resolve(contentsByPath.get(file.path) ?? ''),
    process: <T>(file: TFile, func: (text: string) => T): Promise<T> =>
      Promise.resolve(func(contentsByPath.get(file.path) ?? '')),
    create: (_path: string, _contents: string) =>
      Promise.reject(new Error('Not used by DailyNoteProvider')),
    rewrite: (async <T>(file: TFile, rewriteFunc: (contents: string) => unknown) => {
      const current = contentsByPath.get(file.path) ?? '';
      const result = await rewriteFunc(current);

      if (Array.isArray(result)) {
        const [page, extra] = result as [string, T];
        contentsByPath.set(file.path, page);
        return extra;
      }

      contentsByPath.set(file.path, result as string);
      return undefined;
    }) as ObsidianInterface['rewrite'],
    rename: (_file: TFile, _newPath: string) =>
      Promise.reject(new Error('Not used by DailyNoteProvider')),
    delete: (_file: TFile) => Promise.reject(new Error('Not used by DailyNoteProvider'))
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dailyNotesByPath.clear();
    contentsByPath.clear();

    getAllDailyNotesMock.mockImplementation(() => {
      return Object.fromEntries(dailyNotesByPath.entries());
    });

    getDailyNoteMock.mockImplementation(m => {
      const path = `Daily/${m.format('YYYY-MM-DD')}.md`;
      let file = dailyNotesByPath.get(path);
      if (!file) {
        file = makeFile(path);
        dailyNotesByPath.set(path, file);
        if (!contentsByPath.has(path)) {
          contentsByPath.set(path, '');
        }
      }
      return file;
    });

    createDailyNoteMock.mockImplementation(m => {
      const path = `Daily/${m.format('YYYY-MM-DD')}.md`;
      const file = makeFile(path);
      dailyNotesByPath.set(path, file);
      contentsByPath.set(path, '');
      return Promise.resolve(file);
    });

    getDailyNoteSettingsMock.mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD' });

    getDateFromFileMock.mockImplementation(file => {
      const m = file.path.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? moment(m[1]) : null;
    });
  });

  it('creates and deletes a daily note event using a handle with file path', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    expect(appHasDailyNotesPluginLoaded).toHaveBeenCalledTimes(1);

    const event: OFCEvent = {
      title: 'Daily workflow event',
      type: 'single',
      allDay: true,
      date: '2026-03-27',
      endDate: null
    };

    const [createdEvent, location] = await provider.createEvent(event);

    expect(location.file.path).toBe('Daily/2026-03-27.md');
    const beforeDelete = contentsByPath.get(location.file.path) || '';
    expect(beforeDelete).toContain('Daily workflow event');

    const handle = provider.getEventHandle(createdEvent);
    expect(handle).not.toBeNull();
    expect(createdEvent.uid).toBe(handle!.persistentId);
    expect(handle!.location?.path).toBe('Daily/2026-03-27.md');

    await provider.deleteEvent(handle!);

    const afterDelete = contentsByPath.get(location.file.path) || '';
    expect(afterDelete).not.toContain('Daily workflow event');
  });

  it('add, rename, move date, and delete workflow stays intact', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const initialEvent: OFCEvent = {
      title: 'Daily lifecycle base',
      type: 'single',
      allDay: true,
      date: '2026-03-27',
      endDate: null
    };

    const [createdEvent, createdLocation] = await provider.createEvent(initialEvent);
    const createdPath = createdLocation.file.path;
    expect(contentsByPath.get(createdPath)).toContain('Daily lifecycle base');

    const renamedEvent: OFCEvent = {
      ...createdEvent,
      title: 'Daily lifecycle renamed'
    };

    const renameHandle = provider.getEventHandle(createdEvent);
    expect(renameHandle?.location?.path).toBe(createdPath);

    const renamedLocation = await provider.updateEvent(renameHandle!, createdEvent, renamedEvent);
    expect(renamedLocation?.file.path).toBe(createdPath);
    expect(contentsByPath.get(createdPath)).toContain('Daily lifecycle renamed');
    expect(contentsByPath.get(createdPath)).not.toContain('Daily lifecycle base');

    const movedEvent = {
      ...renamedEvent,
      date: '2026-03-28'
    } as OFCEvent;

    const moveHandle = provider.getEventHandle(renamedEvent);
    expect(moveHandle?.location?.path).toBe(createdPath);

    const movedLocation = await provider.updateEvent(moveHandle!, renamedEvent, movedEvent);
    expect(movedLocation?.file.path).toBe('Daily/2026-03-28.md');
    expect(contentsByPath.get(createdPath) || '').not.toContain('Daily lifecycle renamed');
    expect(contentsByPath.get('Daily/2026-03-28.md') || '').toContain('Daily lifecycle renamed');

    const deleteHandle = provider.getEventHandle(movedEvent);
    expect(deleteHandle?.location?.path).toBe('Daily/2026-03-28.md');

    await provider.deleteEvent(deleteHandle!);
    expect(contentsByPath.get('Daily/2026-03-28.md') || '').not.toContain(
      'Daily lifecycle renamed'
    );
  });

  it('waits for metadata before parsing a daily note during startup scan', async () => {
    const file = makeFile('Daily/2026-03-29.md');
    dailyNotesByPath.set(file.path, file);
    contentsByPath.set(
      file.path,
      ['# Calendar', '- [ ] Startup sync event [startTime:: 09:00]'].join('\n')
    );
    const sections = [
      {
        position: {
          end: { line: 1, col: 47, offset: 58 }
        }
      }
    ] as NonNullable<CachedMetadata['sections']>;
    const sectionsWithLast = sections as NonNullable<CachedMetadata['sections']> & {
      last: () => NonNullable<CachedMetadata['sections']>[number];
    };
    sectionsWithLast.last = () => sections[sections.length - 1];

    const startupMetadata = {
      headings: [
        {
          heading: 'Calendar',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 10, offset: 10 }
          }
        }
      ],
      listItems: [
        {
          position: {
            start: { line: 1, col: 0, offset: 11 },
            end: { line: 1, col: 47, offset: 58 }
          }
        }
      ],
      sections: sectionsWithLast
    } as CachedMetadata;

    let hasMetadata = false;
    const app: ObsidianInterface = {
      getAbstractFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
      getFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
      getMetadata: (_file: TFile) => (hasMetadata ? startupMetadata : null),
      waitForMetadata: (_file: TFile) => {
        hasMetadata = true;
        return Promise.resolve(startupMetadata);
      },
      read: (target: TFile) => Promise.resolve(contentsByPath.get(target.path) ?? ''),
      process: <T>(target: TFile, func: (text: string) => T): Promise<T> =>
        Promise.resolve(func(contentsByPath.get(target.path) ?? '')),
      create: (_path: string, _contents: string) =>
        Promise.reject(new Error('Not used by DailyNoteProvider')),
      rewrite: (() => Promise.resolve(undefined)) as ObsidianInterface['rewrite'],
      rename: (_file: TFile, _newPath: string) =>
        Promise.reject(new Error('Not used by DailyNoteProvider')),
      delete: (_file: TFile) => Promise.reject(new Error('Not used by DailyNoteProvider'))
    };

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const events = await provider.getEventsInFile(file);

    expect(events).toHaveLength(1);
    expect(events[0][0]).toEqual(
      expect.objectContaining({
        title: 'Startup sync event',
        date: '2026-03-29'
      })
    );
  });

  it('keeps duplicate same-title events by suffixing stored title uniquely', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const firstEvent: OFCEvent = {
      title: 'Wellness - Sleep - Night',
      type: 'single',
      allDay: false,
      date: '2026-04-07',
      startTime: '23:30',
      endTime: '07:30',
      endDate: '2026-04-08',
      timezone: 'Europe/Budapest'
    };

    const secondEvent: OFCEvent = {
      title: 'Wellness - Sleep - Night',
      type: 'single',
      allDay: false,
      date: '2026-04-07',
      startTime: '00:45',
      endTime: '08:00',
      endDate: null,
      timezone: 'Europe/Budapest'
    };

    const [createdFirst] = await provider.createEvent(firstEvent);
    const [createdSecond] = await provider.createEvent(secondEvent);

    const id1 = provider.getEventHandle(createdFirst)?.persistentId;
    const id2 = provider.getEventHandle(createdSecond)?.persistentId;

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(createdFirst.uid).toBe(id1);
    expect(createdSecond.uid).toBe(id2);
    expect(id1).not.toEqual(id2);
    expect(id2).toContain('-_-_-1');

    const content = contentsByPath.get('Daily/2026-04-07.md') || '';
    const eventLines = content
      .split('\n')
      .filter(line => line.trim().startsWith('-') && line.includes('[startTime::'));

    expect(eventLines).toHaveLength(2);
  });

  it('loads legacy unsuffixed duplicate lines as distinct events', async () => {
    const file = makeFile('Daily/2026-04-07.md');
    dailyNotesByPath.set(file.path, file);
    contentsByPath.set(
      file.path,
      [
        '## Calendar',
        '-  Wellness - Sleep - Night [startTime:: 23:30]  [endTime:: 07:30]  [endDate:: 2026-04-08]  [timezone:: Europe/Budapest]',
        '-  Wellness - Sleep - Night [startTime:: 00:45]  [endTime:: 08:00]  [timezone:: Europe/Budapest]'
      ].join('\n')
    );

    const sections = [
      {
        position: {
          end: { line: 2, col: 120, offset: 300 }
        }
      }
    ] as NonNullable<CachedMetadata['sections']>;
    const sectionsWithLast = sections as NonNullable<CachedMetadata['sections']> & {
      last: () => NonNullable<CachedMetadata['sections']>[number];
    };
    sectionsWithLast.last = () => sections[sections.length - 1];

    const metadata = {
      headings: [
        {
          heading: 'Calendar',
          level: 2,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 11, offset: 11 }
          }
        }
      ],
      listItems: [
        {
          position: {
            start: { line: 1, col: 0, offset: 12 },
            end: { line: 1, col: 120, offset: 150 }
          }
        },
        {
          position: {
            start: { line: 2, col: 0, offset: 151 },
            end: { line: 2, col: 120, offset: 260 }
          }
        }
      ],
      sections: sectionsWithLast
    } as CachedMetadata;

    const app: ObsidianInterface = {
      ...createMockApp(),
      getMetadata: (_file: TFile) => metadata,
      waitForMetadata: (_file: TFile) => Promise.resolve(metadata)
    };

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const events = await provider.getEventsInFile(file);
    expect(events).toHaveLength(2);

    const [first, second] = events.map(([event]) => event);
    const firstId = provider.getEventHandle(first)?.persistentId;
    const secondId = provider.getEventHandle(second)?.persistentId;

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toEqual(secondId);
    expect(secondId).toContain('-_-_-1');
    expect(provider.getCanonicalTitle(first)).toBe('Wellness - Sleep - Night');
    expect(provider.getCanonicalTitle(second)).toBe('Wellness - Sleep - Night');
  });
});
