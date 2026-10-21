import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetch DB sqld', () => {
  it('selalu no-store agar Next.js tidak membekukan hasil query', async () => {
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return new Response('{}', { status: 200 });
    };

    const { fetchWithTimeout } = await import('../../src/lib/db.js');
    const originalSignal = new AbortController();
    await fetchWithTimeout('https://db.test/v2/pipeline', {
      method: 'POST',
      body: '{}',
      signal: originalSignal.signal,
    });

    assert.ok(seen);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.cache, 'no-store');
    assert.ok(seen.init.signal instanceof AbortSignal);
  });
});
