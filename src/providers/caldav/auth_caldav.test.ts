/**
 * @jest-environment jsdom
 */
import { createBasicAuthHeader } from './auth_caldav';

describe('createBasicAuthHeader', () => {
  it('returns undefined when username or password is missing', () => {
    expect(createBasicAuthHeader(undefined, 'x')).toBeUndefined();
    expect(createBasicAuthHeader('x', undefined)).toBeUndefined();
    expect(createBasicAuthHeader('', 'x')).toBeUndefined();
    expect(createBasicAuthHeader('x', '')).toBeUndefined();
  });

  it('encodes ASCII credentials as Basic auth', () => {
    expect(createBasicAuthHeader('user', 'pass')).toBe('Basic dXNlcjpwYXNz');
  });

  it('encodes UTF-8 credentials as Basic auth', () => {
    expect(createBasicAuthHeader('usér', 'päss')).toBe('Basic dXPDqXI6cMOkc3M=');
  });

  it('works even when Buffer is unavailable', () => {
    const originalBuffer = (globalThis as unknown as { Buffer?: unknown }).Buffer;

    (globalThis as unknown as { Buffer?: unknown }).Buffer = undefined;
    try {
      expect(createBasicAuthHeader('user', 'pass')).toBe('Basic dXNlcjpwYXNz');
    } finally {
      (globalThis as unknown as { Buffer?: unknown }).Buffer = originalBuffer;
    }
  });
});
