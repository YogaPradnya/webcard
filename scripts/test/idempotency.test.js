import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getIdempotencyKey,
  checkIdempotency,
  saveIdempotency,
  IDEMPOTENCY_TTL_MS,
} from '../../src/lib/idempotency.js';

function mockDb(rows = []) {
  const calls = [];
  return {
    calls,
    async execute(q) {
      calls.push(q);
      if (String(q.sql || q).includes('SELECT')) return { rows };
      return { rows: [] };
    },
  };
}

describe('idempotency', () => {
  it('tanpa header -> tidak proteksi', () => {
    const req = { headers: new Headers() };
    assert.equal(getIdempotencyKey(req), '');
  });
  it('key kotor ditolak', () => {
    const h = new Headers({ 'Idempotency-Key': 'a b;c' });
    assert.equal(getIdempotencyKey({ headers: h }), '');
  });
  it('replay mengembalikan body tersimpan', async () => {
    const body = { success: true, code: '123456' };
    const db = mockDb([{ status: 200, response: JSON.stringify(body), created_at: Date.now() }]);
    const r = await checkIdempotency(db, 'k1', 'u1', 'trade/create');
    assert.equal(r.hit, true);
    assert.deepEqual(r.body, body);
  });
  it('entri kedaluwarsa dianggap miss', async () => {
    const db = mockDb([{ status: 200, response: '{}', created_at: Date.now() - IDEMPOTENCY_TTL_MS - 1 }]);
    const r = await checkIdempotency(db, 'k1', 'u1', 'trade/create');
    assert.equal(r.hit, false);
  });
  it('save lalu check (round-trip memori)', async () => {
    const store = new Map();
    const db = {
      async execute(q) {
        if (String(q.sql || q).includes('SELECT')) {
          const [k, u, rt] = q.args;
          const v = store.get(`${k}|${u}|${rt}`);
          return { rows: v ? [v] : [] };
        }
        if (String(q.sql || q).includes('INSERT')) {
          const [k, u, rt, st, resp, at] = q.args;
          store.set(`${k}|${u}|${rt}`, { status: st, response: resp, created_at: at });
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    await saveIdempotency(db, 'k9', 'u9', 'gacha/pull', 200, { success: true, pulls: [1] });
    const r = await checkIdempotency(db, 'k9', 'u9', 'gacha/pull');
    assert.equal(r.hit, true);
    assert.deepEqual(r.body, { success: true, pulls: [1] });
    // user lain tidak dapat replay milik orang
    const otherDb = { execute: async (q) => (String(q.sql || q).includes('SELECT') ? { rows: [] } : { rows: [] }) };
    const r2 = await checkIdempotency(otherDb, 'k9', 'uLAIN', 'gacha/pull');
    assert.equal(r2.hit, false);
  });
  it('db error -> fail-open', async () => {
    const db = { async execute() { throw new Error('down'); } };
    const r = await checkIdempotency(db, 'k', 'u', 'x');
    assert.equal(r.hit, false);
    await saveIdempotency(db, 'k', 'u', 'x', 200, {}); // tidak throw
  });
});
