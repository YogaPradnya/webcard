import test from 'node:test';
import assert from 'node:assert/strict';
import { sealSession, unsealSession } from '../../src/lib/session.js';

process.env.SESSION_SECRET = 'test-session-secret-min-16-chars';

test('session - payload terenkripsi bisa dibuka', () => {
  const sealed = sealSession({ id: 'u1', key: 'k', username: 'Tester' });
  const out = unsealSession(sealed);
  assert.equal(out.id, 'u1');
  assert.equal(out.username, 'Tester');
});

test('session - cookie kedaluwarsa ditolak walau Max-Age diabaikan browser', () => {
  const sealed = sealSession({ id: 'u1', username: 'Tester', exp: Date.now() - 1000 });
  assert.equal(unsealSession(sealed), null);
});

test('session - cookie rusak / tanpa exp ditolak', () => {
  assert.equal(unsealSession('bukan-cookie'), null);
  assert.equal(unsealSession(''), null);
});
