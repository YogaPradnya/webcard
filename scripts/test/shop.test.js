import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  findPack, editsLeft, verifyWebhookSignature,
} from '../../src/lib/shop.js';

describe('shop katalog', () => {
  it('4 paket XP sesuai spek (5rb/6k, 10rb/11500, 50rb/55k, 100rb/125k)', () => {
    assert.deepEqual(
      XP_PACKS.map((p) => [p.priceIdr, p.xp]),
      [[5000, 6000], [10000, 11500], [50000, 55000], [100000, 125000]],
    );
    assert.equal(findPack('xp-5k')?.xp, 6000);
    assert.equal(findPack('xp-100k')?.xp, 125000);
    assert.equal(findPack('ngaco'), null);
  });
  it('aturan slot: Rp10rb, maks 50/user, 3 jatah ubah', () => {
    assert.equal(SLOT_PRICE_IDR, 10000);
    assert.equal(MAX_SLOTS_PER_USER, 50);
    assert.equal(MAX_EDITS_PER_SLOT, 3);
    assert.equal(editsLeft({ edits_used: 0 }), 3);
    assert.equal(editsLeft({ edits_used: 2 }), 1);
    assert.equal(editsLeft({ edits_used: 3 }), 0);
    assert.equal(editsLeft({ edits_used: 9 }), 0);
  });
});

describe('shop webhook signature', () => {
  it('sha512(order+status+gross+key) valid vs palsu', () => {
    const serverKey = 'SB-test-key-123';
    const payload = { orderId: 'ANIMEIN-1', statusCode: '200', grossAmount: '5000' };
    const sig = createHash('sha512')
      .update(`${payload.orderId}${payload.statusCode}${payload.grossAmount}${serverKey}`)
      .digest('hex');
    process.env.MIDTRANS_SERVER_KEY = serverKey;
    assert.equal(verifyWebhookSignature({ ...payload, signature: sig }), true);
    assert.equal(verifyWebhookSignature({ ...payload, signature: sig.toUpperCase() }), true);
    assert.equal(verifyWebhookSignature({ ...payload, signature: 'palsu' }), false);
    assert.equal(verifyWebhookSignature({ ...payload, grossAmount: '10000', signature: sig }), false);
    delete process.env.MIDTRANS_SERVER_KEY;
  });
});
