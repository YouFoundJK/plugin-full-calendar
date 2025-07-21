import { join } from 'path';
import { TFile } from 'obsidian';

import { ObsidianInterface } from '../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../test_helpers/AppBuilder';
import { FileBuilder } from '../../test_helpers/FileBuilder';
import { OFCEvent } from '../types';
import FullNoteCalendar from './FullNoteCalendar';
import { parseEvent } from '../types/schema';
import { DEFAULT_SETTINGS } from '../ui/settings';

async function assertFailed(func: () => Promise<any>, message: RegExp) {
  try {
    await func();
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(message);
    return;
  }
  expect(false).toBeTruthy();
}

const makeApp = (app: MockApp): ObsidianInterface => ({
  getAbstractFileByPath: path => app.vault.getAbstractFileByPath(path),
  getFileByPath(path: string): TFile | null {
    return app.vault.getFileByPath(path);
  },
  getMetadata: file => app.metadataCache.getFileCache(file),
  waitForMetadata: file => new Promise(resolve => resolve(app.metadataCache.getFileCache(file)!)),
  read: file => app.vault.read(file),
  create: jest.fn(),
  rewrite: jest.fn(),
  rename: jest.fn(),
  delete: jest.fn(),
  process: jest.fn()
});

const dirName = 'events';
const color = '#BADA55';

describe('FullNoteCalendar Tests', () => {
  it.each([
    [
      'One event with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Test Event',
            category: 'Work',
            allDay: true,
            date: '2022-01-01'
          }
        }
      ]
    ],
    [
      'Two events, one with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Test Event',
            category: 'Work',
            allDay: true,
            date: '2022-01-01'
          }
        },
        {
          filename: '2022-01-02 Another Test Event.md',
          frontmatter: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          },
          expected: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          }
        }
      ]
    ]
  ])(
    '%p',
    async (
      _,
      inputs: { filename: string; frontmatter: Partial<OFCEvent>; expected: Partial<OFCEvent> }[]
    ) => {
      const obsidian = makeApp(
        MockAppBuilder.make()
          .folder(
            inputs.reduce(
              (builder, { filename, frontmatter }) =>
                builder.file(filename, new FileBuilder().frontmatter(frontmatter)),
              new MockAppBuilder(dirName)
            )
          )
          .done()
      );
      const calendar = new FullNoteCalendar(obsidian, color, dirName, DEFAULT_SETTINGS);
      const res = await calendar.getEvents();
      expect(res.length).toBe(inputs.length);

      const receivedEvents = res.map(e => e[0]);

      for (const { expected } of inputs) {
        // The parsed event should be structurally similar to our expected event.
        // We use expect.objectContaining because the parser adds default fields.
        expect(receivedEvents).toContainEqual(expect.objectContaining(expected));
      }
    }
  );

  it('creates an event with a category', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteCalendar(obsidian, color, dirName, DEFAULT_SETTINGS);
    const event = {
      title: 'Test Event',
      category: 'Work',
      date: '2022-01-01',
      allDay: false,
      startTime: '11:00',
      endTime: '12:30'
    };

    (obsidian.create as jest.Mock).mockReturnValue({
      path: join(dirName, '2022-01-01 Work - Test Event.md')
    });
    await calendar.createEvent(parseEvent(event));
    expect(obsidian.create).toHaveBeenCalledTimes(1);
    const [path, content] = (obsidian.create as jest.Mock).mock.calls[0];

    expect(path).toBe('events/2022-01-01 Work - Test Event.md');
    // The created frontmatter should have the FULL title.
    expect(content).toContain('title: Work - Test Event');
    // It should NOT have a separate category field.
    expect(content).not.toContain('category: Work');
  });

  it('modify an existing event to add a category', async () => {
    const initialEvent = {
      title: 'Test Event',
      allDay: false,
      date: '2022-01-01',
      startTime: '11:00',
      endTime: '12:30'
    };
    const filename = '2022-01-01 Test Event.md';
    const obsidian = makeApp(
      MockAppBuilder.make()
        .folder(
          new MockAppBuilder('events').file(filename, new FileBuilder().frontmatter(initialEvent))
        )
        .done()
    );
    const calendar = new FullNoteCalendar(obsidian, color, dirName, DEFAULT_SETTINGS);

    const firstFile = obsidian.getAbstractFileByPath(join('events', filename)) as TFile;

    const contents = await obsidian.read(firstFile);

    const mockFn = jest.fn();

    // The event we pass to modifyEvent is the *structured* event with separate properties.
    const newEvent = parseEvent({
      ...initialEvent,
      category: 'Work' // Add the category
    });

    await calendar.modifyEvent(
      { path: join('events', filename), lineNumber: undefined },
      newEvent,
      mockFn
    );

    expect(obsidian.rewrite).toHaveBeenCalledTimes(1);
    const [file, rewriteCallback] = (obsidian.rewrite as jest.Mock).mock.calls[0];
    const newContent = rewriteCallback(contents);

    // The rewritten content should have the new, full title.
    expect(newContent).toContain('title: Work - Test Event');
    // It should not have a separate category field.
    expect(newContent).not.toContain('category: Work');
  });
});
