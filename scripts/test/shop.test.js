import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  findPack, editsLeft, verifyPaydisiniCallbackSignature, genMerchantOrderId,
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

describe('shop webhook signature (PayDisini)', () => {
  it('md5(key+unique_code+CallbackStatus) valid vs palsu', () => {
    const apiKey = 'PD-test-key-123';
    const uniqueCode = 'ANIMEIN-1';
    const sig = createHash('md5')
      .update(`${apiKey}${uniqueCode}CallbackStatus`)
      .digest('hex');
    process.env.PAYDISINI_API_KEY = apiKey;
    assert.equal(verifyPaydisiniCallbackSignature({ key: apiKey, uniqueCode, signature: sig }), true);
    assert.equal(verifyPaydisiniCallbackSignature({ key: apiKey, uniqueCode, signature: sig.toUpperCase() }), true);
    assert.equal(verifyPaydisiniCallbackSignature({ key: apiKey, uniqueCode, signature: 'palsu' }), false);
    assert.equal(verifyPaydisiniCallbackSignature({ key: 'key-lain', uniqueCode, signature: sig }), false);
    assert.equal(verifyPaydisiniCallbackSignature({ key: apiKey, uniqueCode: 'ANIMEIN-2', signature: sig }), false);
    delete process.env.PAYDISINI_API_KEY;
    assert.equal(verifyPaydisiniCallbackSignature({ key: apiKey, uniqueCode, signature: sig }), false);
  });
  it('order id merchant muat di unique_code PayDisini (maks 32 char)', () => {
    for (let i = 0; i < 20; i++) {
      const id = genMerchantOrderId();
      assert.ok(id.length <= 32, `order id terlalu panjang: ${id}`);
    }
  });
});
