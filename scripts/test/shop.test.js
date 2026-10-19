import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  findPack, editsLeft, verifyTokopayCallbackSignature, mapTokopayStatus,
  createTokopayTransaction, fetchTokopayStatus, genMerchantOrderId,
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

describe('shop webhook signature (Tokopay)', () => {
  it('md5(merchant_id:secret:reff_id) valid vs palsu', () => {
    const merchantId = 'M-test-123';
    const secret = 'secret-xyz';
    const refId = 'ANIMEIN-1';
    const sig = createHash('md5')
      .update(`${merchantId}:${secret}:${refId}`)
      .digest('hex');
    process.env.TOKOPAY_MERCHANT_ID = merchantId;
    process.env.TOKOPAY_SECRET = secret;
    try {
      assert.equal(verifyTokopayCallbackSignature({ merchantId, refId, signature: sig }), true);
      assert.equal(verifyTokopayCallbackSignature({ merchantId, refId, signature: sig.toUpperCase() }), true);
      assert.equal(verifyTokopayCallbackSignature({ merchantId, refId, signature: 'palsu' }), false);
      assert.equal(verifyTokopayCallbackSignature({ merchantId: 'M-lain', refId, signature: sig }), false);
      assert.equal(verifyTokopayCallbackSignature({ merchantId, refId: 'ANIMEIN-2', signature: sig }), false);
      assert.equal(verifyTokopayCallbackSignature({ merchantId, refId: '', signature: sig }), false);
    } finally {
      delete process.env.TOKOPAY_MERCHANT_ID;
      delete process.env.TOKOPAY_SECRET;
    }
    assert.equal(verifyTokopayCallbackSignature({ merchantId, refId, signature: sig }), false);
  });
  it('mapping status Tokopay -> status internal', () => {
    assert.equal(mapTokopayStatus('Success'), 'paid');
    assert.equal(mapTokopayStatus('Completed'), 'paid');
    assert.equal(mapTokopayStatus('Unpaid'), 'pending');
    assert.equal(mapTokopayStatus('Proses Callback'), 'pending');
    assert.equal(mapTokopayStatus('Failed'), 'failed');
    assert.equal(mapTokopayStatus('status aneh'), 'unknown');
    assert.equal(mapTokopayStatus(''), 'unknown');
  });
  it('order id merchant unik dan pendek', () => {
    for (let i = 0; i < 20; i++) {
      const id = genMerchantOrderId();
      assert.ok(id.length <= 32, `order id terlalu panjang: ${id}`);
    }
  });
});

describe('Tokopay HTTP (mock fetch)', () => {
  function setEnv() {
    process.env.TOKOPAY_MERCHANT_ID = 'M-123';
    process.env.TOKOPAY_SECRET = 's3cret';
    process.env.TOKOPAY_CHANNEL = 'QRIS';
  }

  function clearEnv() {
    delete process.env.TOKOPAY_MERCHANT_ID;
    delete process.env.TOKOPAY_SECRET;
    delete process.env.TOKOPAY_CHANNEL;
  }

  it('create order kirim parameter simple order dan memetakan QR', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    let captured = null;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(String(url));
      captured = { url: u.origin + u.pathname, method: opts.method, params: Object.fromEntries(u.searchParams) };
      return new Response(JSON.stringify({
        status: 'Success',
        data: {
          trx_id: 'TP-1',
          qr_link: 'https://assets.tokopay.id/qr.png',
          qr_string: '000201010212',
          pay_url: 'https://pay.tokopay.id/?token=abc',
          total_bayar: 5000,
          total_diterima: 4925,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const tx = await createTokopayTransaction({
        orderId: 'ANIMEIN-1',
        amount: 5000,
        customerName: 'Tester',
        customerEmail: 'noreply+1@kartu.yogaa.web.id',
        customerPhone: '081234567890',
      });
      assert.equal(captured.url, 'https://api.tokopay.id/v1/order');
      assert.equal(captured.method, 'GET');
      assert.equal(captured.params.merchant, 'M-123');
      assert.equal(captured.params.secret, 's3cret');
      assert.equal(captured.params.ref_id, 'ANIMEIN-1');
      assert.equal(captured.params.nominal, '5000');
      assert.equal(captured.params.metode, 'QRIS');
      assert.equal(tx.payId, 'TP-1');
      assert.equal(tx.qrUrl, 'https://assets.tokopay.id/qr.png');
      assert.equal(tx.qrContent, '000201010212');
      assert.equal(tx.checkoutUrl, 'https://pay.tokopay.id/?token=abc');
      assert.equal(tx.channelName, 'QRIS');
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });

  it('cek status memanggil /v1/check-order dengan merchant, secret, ref_id', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    let capturedUrl = '';
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({
        status: 1,
        data: {
          reff_id: 'ANIMEIN-1',
          status: 'Success',
          jumlah_bayar: 5000,
          nama_payment_channel: 'QRIS',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const st = await fetchTokopayStatus('ANIMEIN-1');
      const u = new URL(capturedUrl);
      assert.equal(u.origin + u.pathname, 'https://api.tokopay.id/v1/check-order');
      assert.equal(u.searchParams.get('merchant_id'), 'M-123');
      assert.equal(u.searchParams.get('secret'), 's3cret');
      assert.equal(u.searchParams.get('ref_id'), 'ANIMEIN-1');
      assert.equal(st.found, true);
      assert.equal(mapTokopayStatus(st.data.status), 'paid');
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });

  it('transaksi tidak ditemukan bukan error keras', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: 0,
      rc: 500,
      error_msg: 'Data Not Found',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      const st = await fetchTokopayStatus('ANIMEIN-1');
      assert.equal(st.found, false);
      assert.match(st.reason, /not found/i);
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });
});
