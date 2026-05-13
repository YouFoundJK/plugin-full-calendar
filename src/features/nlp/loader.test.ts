import type { App } from 'obsidian';
import { getLanguage } from 'obsidian';
import { clearNLPPayloadCacheForTests, loadNLPPayload } from './loader';

function createMockApp(exists = true, readPayload = '{"version":1,"locale":"it","rules":[]}') {
  return {
    vault: {
      configDir: 'mock-config-dir',
      adapter: {
        exists: jest.fn().mockResolvedValue(exists),
        read: jest.fn().mockResolvedValue(readPayload),
        write: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined)
      }
    }
  } as unknown as App;
}

describe('NLP payload loader', () => {
  beforeEach(() => {
    clearNLPPayloadCacheForTests();
  });

  it('returns bundled English payload for en language', async () => {
    (getLanguage as jest.Mock).mockReturnValue('en');
    const payload = await loadNLPPayload(createMockApp(), 'full-calendar-remastered');

    expect(payload.locale).toBe('en');
    expect(payload.rules.length).toBeGreaterThan(0);
  });

  it('loads cached payload file for supported non-English language', async () => {
    (getLanguage as jest.Mock).mockReturnValue('it');
    const payload = await loadNLPPayload(createMockApp(true), 'full-calendar-remastered');

    expect(payload.locale).toBe('it');
  });

  it('falls back to English when payload read fails', async () => {
    (getLanguage as jest.Mock).mockReturnValue('it');
    const app = createMockApp(true) as unknown as {
      vault: { adapter: { read: jest.Mock } };
    } & App;
    app.vault.adapter.read.mockRejectedValue(new Error('read failed'));

    const payload = await loadNLPPayload(app, 'full-calendar-remastered');

    expect(payload.locale).toBe('en');
  });
});
