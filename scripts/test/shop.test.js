import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  findPack, editsLeft, verifyTripayCallbackSignature, mapTripayStatus,
  createTripayTransaction, fetchTripayTransaction, tripayCreateSignature,
  genMerchantOrderId, isTripayConfigured, tripayMode, tripayApiBase,
} from '../../src/lib/shop.js';

describe('shop katalog', () => {
  it('5 paket XP sesuai spek (bonus kartu lewat bar bulanan, bukan per paket)', () => {
    assert.deepEqual(
      XP_PACKS.map((p) => [p.priceIdr, p.xp]),
      [[5000, 6000], [10000, 11500], [50000, 55000], [100000, 125000], [500000, 650000]],
    );
    assert.equal(findPack('xp-5k')?.xp, 6000);
    assert.equal(findPack('xp-100k')?.xp, 125000);
    assert.equal(findPack('xp-500k')?.xp, 650000);
    assert.equal('bonusCards' in findPack('xp-50k'), false);
    assert.equal('bonusCards' in findPack('xp-100k'), false);
    assert.equal('bonusCards' in findPack('xp-500k'), false);
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

describe('shop webhook signature (Tripay)', () => {
  it('signature create sesuai vektor dokumentasi Tripay', () => {
    const sig = tripayCreateSignature({
      merchantCode: 'T0001',
      merchantRef: 'INV55567',
      amount: 1500000,
      privateKey: 'ytf6ooi2gmlNPfpchd94jDOk8hRWOu',
    });
    assert.equal(sig, '9f167eba844d1fcb369404e2bda53702e2f78f7aa12e91da6715414e65b8c86a');
  });

  it('HMAC-SHA256(raw body, private key) valid vs palsu', () => {
    const privateKey = 'private-key-xyz';
    const rawBody = JSON.stringify({
      merchant_ref: 'ANIMEIN-1',
      reference: 'T-1',
      status: 'PAID',
      total_amount: 5000,
    });
    const sig = createHmac('sha256', privateKey).update(rawBody).digest('hex');
    process.env.TRIPAY_PRIVATE_KEY = privateKey;
    try {
      assert.equal(verifyTripayCallbackSignature({ rawBody, signature: sig }), true);
      assert.equal(verifyTripayCallbackSignature({ rawBody, signature: sig.toUpperCase() }), true);
      assert.equal(verifyTripayCallbackSignature({ rawBody, signature: 'palsu' }), false);
      assert.equal(verifyTripayCallbackSignature({ rawBody: `${rawBody} `, signature: sig }), false);
      assert.equal(verifyTripayCallbackSignature({ rawBody, signature: '' }), false);
    } finally {
      delete process.env.TRIPAY_PRIVATE_KEY;
    }
    assert.equal(verifyTripayCallbackSignature({ rawBody, signature: sig }), false);
  });

  it('mapping status Tripay -> status internal', () => {
    assert.equal(mapTripayStatus('PAID'), 'paid');
    assert.equal(mapTripayStatus('paid'), 'paid');
    assert.equal(mapTripayStatus('UNPAID'), 'pending');
    assert.equal(mapTripayStatus('PENDING'), 'pending');
    assert.equal(mapTripayStatus('FAILED'), 'failed');
    assert.equal(mapTripayStatus('EXPIRED'), 'expired');
    assert.equal(mapTripayStatus('REFUND'), 'refund');
    assert.equal(mapTripayStatus('status aneh'), 'unknown');
    assert.equal(mapTripayStatus(''), 'unknown');
  });

  it('order id merchant unik dan pendek', () => {
    for (let i = 0; i < 20; i++) {
      const id = genMerchantOrderId();
      assert.ok(id.length <= 32, `order id terlalu panjang: ${id}`);
    }
  });
});

describe('Tripay HTTP (mock fetch)', () => {
  const ENV_KEYS = [
    'TRIPAY_MODE', 'TRIPAY_MERCHANT_CODE', 'TRIPAY_API_KEY', 'TRIPAY_PRIVATE_KEY',
    'TRIPAY_CHANNEL', 'TRIPAY_CALLBACK_URL', 'TRIPAY_RETURN_URL',
  ];

  function setEnv(overrides = {}) {
    process.env.TRIPAY_MODE = 'production';
    process.env.TRIPAY_MERCHANT_CODE = 'T-123';
    process.env.TRIPAY_API_KEY = 'api-key';
    process.env.TRIPAY_PRIVATE_KEY = 'private-key';
    process.env.TRIPAY_CHANNEL = 'QRIS';
    process.env.TRIPAY_CALLBACK_URL = 'https://kartu.yogaa.web.id/api/shop/webhook';
    process.env.TRIPAY_RETURN_URL = 'https://kartu.yogaa.web.id/shop';
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  }

  function clearEnv() {
    for (const key of ENV_KEYS) delete process.env[key];
  }

  it('konfigurasi Tripay dan mode API', () => {
    clearEnv();
    assert.equal(isTripayConfigured(), false);
    setEnv();
    try {
      assert.equal(isTripayConfigured(), true);
      assert.equal(tripayMode(), 'production');
      assert.equal(tripayApiBase(), 'https://tripay.co.id/api/');
      process.env.TRIPAY_MODE = 'sandbox';
      assert.equal(tripayMode(), 'sandbox');
      assert.equal(tripayApiBase(), 'https://tripay.co.id/api-sandbox/');
    } finally {
      clearEnv();
    }
  });

  it('create order mengirim form Tripay dan memetakan QR', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    let captured = null;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(String(url));
      captured = {
        url: u.origin + u.pathname,
        method: opts.method,
        headers: opts.headers,
        params: Object.fromEntries(new URLSearchParams(String(opts.body))),
      };
      return new Response(JSON.stringify({
        success: true,
        message: '',
        data: {
          reference: 'T-1',
          merchant_ref: 'ANIMEIN-1',
          payment_name: 'QRIS',
          qr_string: '000201010212',
          qr_url: 'https://tripay.co.id/qr/T-1.png',
          checkout_url: 'https://tripay.co.id/checkout/T-1',
          status: 'UNPAID',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const tx = await createTripayTransaction({
        orderId: 'ANIMEIN-1',
        amount: 5000,
        customerName: 'Tester',
        customerEmail: 'noreply+1@kartu.yogaa.web.id',
        customerPhone: '081234567890',
        itemName: 'Top-Up 6.000 XP Animein',
      });
      assert.equal(captured.url, 'https://tripay.co.id/api/transaction/create');
      assert.equal(captured.method, 'POST');
      assert.equal(captured.headers.Authorization, 'Bearer api-key');
      assert.equal(captured.params.method, 'QRIS');
      assert.equal(captured.params.merchant_ref, 'ANIMEIN-1');
      assert.equal(captured.params.amount, '5000');
      assert.equal(captured.params.customer_name, 'Tester');
      assert.equal(captured.params.customer_email, 'noreply+1@kartu.yogaa.web.id');
      assert.equal(captured.params['order_items[0][name]'], 'Top-Up 6.000 XP Animein');
      assert.equal(captured.params['order_items[0][price]'], '5000');
      assert.equal(captured.params['order_items[0][quantity]'], '1');
      assert.equal(captured.params.callback_url, 'https://kartu.yogaa.web.id/api/shop/webhook');
      assert.equal(captured.params.return_url, 'https://kartu.yogaa.web.id/shop');
      assert.ok(Number(captured.params.expired_time) > Math.floor(Date.now() / 1000));
      assert.equal(captured.params.signature, tripayCreateSignature({
        merchantCode: 'T-123',
        merchantRef: 'ANIMEIN-1',
        amount: 5000,
        privateKey: 'private-key',
      }));
      assert.equal(tx.payId, 'T-1');
      assert.equal(tx.qrUrl, 'https://tripay.co.id/qr/T-1.png');
      assert.equal(tx.qrContent, '000201010212');
      assert.equal(tx.checkoutUrl, 'https://tripay.co.id/checkout/T-1');
      assert.equal(tx.channelName, 'QRIS');
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });

  it('mode sandbox memakai base API sandbox', async () => {
    const originalFetch = globalThis.fetch;
    setEnv({ TRIPAY_MODE: 'sandbox' });
    let capturedUrl = '';
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({
        success: true,
        data: {
          reference: 'T-SBX',
          payment_name: 'QRIS',
          qr_url: 'https://tripay.co.id/qr/sbx.png',
          status: 'UNPAID',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      await createTripayTransaction({
        orderId: 'ANIMEIN-SBX',
        amount: 5000,
        customerName: 'Tester',
        customerEmail: 'noreply@example.com',
        itemName: 'Tes',
      });
      assert.equal(capturedUrl, 'https://tripay.co.id/api-sandbox/transaction/create');
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });

  it('cek status memanggil /transaction/detail dengan reference', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    let captured = null;
    globalThis.fetch = async (url, opts) => {
      const u = new URL(String(url));
      captured = { url: u.origin + u.pathname, ref: u.searchParams.get('reference'), headers: opts.headers };
      return new Response(JSON.stringify({
        success: true,
        data: {
          reference: 'T-1',
          merchant_ref: 'ANIMEIN-1',
          status: 'PAID',
          payment_name: 'QRIS',
          total_amount: 5000,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const st = await fetchTripayTransaction('T-1');
      assert.equal(captured.url, 'https://tripay.co.id/api/transaction/detail');
      assert.equal(captured.ref, 'T-1');
      assert.equal(captured.headers.Authorization, 'Bearer api-key');
      assert.equal(st.found, true);
      assert.equal(mapTripayStatus(st.data.status), 'paid');
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });

  it('transaksi tidak ditemukan bukan error keras', async () => {
    const originalFetch = globalThis.fetch;
    setEnv();
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: false,
      message: 'Transaction not found',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    try {
      const st = await fetchTripayTransaction('T-TIDAK-ADA');
      assert.equal(st.found, false);
      assert.match(st.reason, /not found/i);
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  });
});
