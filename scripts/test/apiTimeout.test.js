import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '../../src/lib/apiTimeout.js';

describe('apiTimeout', () => {
  it('batas default benar', () => {
    assert.equal(READ_TIMEOUT_MS, 9000);
    assert.equal(WRITE_TIMEOUT_MS, 10000);
  });
  it('handler cepat lolos apa adanya', async () => {
    const h = withTimeout(async () => ({ ok: 1 }), 1000, 'T');
    assert.deepEqual(await h({}), { ok: 1 });
  });
  it('handler gantung -> 503 JSON, bukan gantung', async () => {
    const h = withTimeout(() => new Promise(() => {}), 50, 'T');
    const t0 = Date.now();
    const res = await h({});
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
  });
  it('error biasa diteruskan (bukan ditelan)', async () => {
    const boom = new Error('MELEDAK');
    const h = withTimeout(async () => { throw boom; }, 1000, 'T');
    await assert.rejects(() => h({}), /MELEDAK/);
  });
});
