import { getDb } from '@/lib/db';
import { isDisplayOwned } from '@/lib/display';
import { ensureTradeTable, executeBundleTrade, getCardOwner, getOffer, normalizeTradeCode, normalizeBundleItems, checkBundleRule, bundleStats, cleanupTradeOffers } from '@/lib/trade';
import { checkRateCount } from '@/lib/rateLimit';
import { apiHandler, jsonOk, jsonFail, parseJson, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/trade/offer?code=123456[&my=Nama&myQty=N | &myItems=[{charName,amount}]] — intip penawaran.
// Balik juga alreadyOwned dan penawaran milik sendiri. mineOk menilai bundle penuh.
async function GET_impl(req, _ctx, session) {
  const params = new URL(req.url).searchParams;
  const code = normalizeTradeCode(params.get('code'));
  const myCharName = String(params.get('my') || '').trim();
  const myQty = Math.max(1, parseInt(params.get('myQty'), 10) || 1);
  let myItemsRaw = [];
  const myItemsParam = String(params.get('myItems') || '').trim();
  if (myItemsParam.length > 5000) return jsonFail('Daftar kartu terlalu panjang.', 400);
  if (myItemsParam) {
    try {
      const parsed = JSON.parse(myItemsParam);
      if (Array.isArray(parsed)) myItemsRaw = parsed.slice(0, 100);
    } catch { /* abaikan, fallback legacy */ }
  }
  if (!myItemsRaw.length && myCharName) myItemsRaw = [{ charName: myCharName, amount: myQty }];
  if (!code) return jsonFail('Kode wajib angka.', 400);
  const attempt = await checkRateCount(`tradeview:${session.id}`, 30, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu banyak percobaan. Tunggu sebentar.', 429);
  }

  try {
    await ensureTradeTable();
    const db = getDb();
    await cleanupTradeOffers(db);
    const offer = await getOffer(db, code);
    if (!offer) {
      return jsonFail('Kode tidak ditemukan / kedaluwarsa.', 404);
    }
    const card = await getCardOwner(db, offer.ownerId, offer.charName);
    const isMine = String(offer.ownerId) === String(session.id);
    const alreadyOwned = isMine ? false : Boolean(await getCardOwner(db, session.id, offer.charName));
    let mineOk = null;
    const takerReq = normalizeBundleItems(myItemsRaw);
    if (takerReq.length) {
      // Nilai dengan rarity live milik penukar.
      const takerLive = [];
      const perItem = [];
      for (const it of takerReq) {
        const mine = await getCardOwner(db, session.id, it.charName);
        perItem.push({
          charName: it.charName,
          owned: Boolean(mine),
          quantity: mine ? mine.quantity : 0,
          enough: mine ? mine.quantity >= it.amount : false,
          amount: it.amount,
        });
        if (mine) takerLive.push({ charName: mine.charName, rarity: mine.rarity, amount: it.amount });
      }
      const overlap = takerLive.some((t) =>
        offer.items.some((g) => g.charName.toLowerCase() === t.charName.toLowerCase()));
      const rule = overlap
        ? { ok: false, message: 'Ada kartu yang sama di kedua sisi, tidak perlu tukar.' }
        : checkBundleRule(offer.items, takerLive);
      const allEnough = perItem.length > 0 && perItem.every((p) => p.owned && p.enough);
      mineOk = {
        items: perItem,
        owned: allEnough,
        quantity: perItem.reduce((n, p) => n + p.quantity, 0),
        enough: allEnough,
        same: overlap,
        ruleOk: Boolean(rule.ok),
        ruleMessage: rule.ok ? null : rule.message,
        giveValue: rule.giveValue ?? bundleStats(offer.items).value,
        takeValue: rule.takeValue ?? bundleStats(takerLive).value,
        ok: allEnough && !overlap && !isMine && Boolean(rule.ok),
      };
    }
    return jsonOk({
      offer: { ...offer, isMine },
      card,
      alreadyOwned,
      mineOk,
    });
  } catch (e) {
    console.error('[TRADE OFFER]', e.message);
    return jsonFail('Gagal memuat penawaran.', 500);
  }
}

// POST /api/trade/offer { code, myItems:[{charName, amount}] } — tukar bundle.
// Kompatibel body lama { code, myCharName, myAmount } (1 kartu).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const code = normalizeTradeCode(body.code);
  if (Array.isArray(body.myItems) && body.myItems.length > 100) {
    return jsonFail('Daftar kartu terlalu panjang.', 400);
  }
  const rawItems = Array.isArray(body.myItems) && body.myItems.length
    ? body.myItems
    : [{ charName: body.myCharName, amount: body.myAmount }];
  const takerItems = normalizeBundleItems(rawItems);
  if (!code || !takerItems.length) {
    return jsonFail('Kode dan kartumu wajib diisi.', 400);
  }

  try {
    await ensureTradeTable();
    await ensureIdempotencyTable();
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, session.id, 'trade/offer');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    await cleanupTradeOffers(db);
    const offer = await getOffer(db, code);
    if (!offer) {
      return jsonFail('Kode tidak ditemukan / kedaluwarsa.', 404);
    }
    // Kartu pajangan (display-only) tidak bisa di-trade — cek semua sisi.
    for (const it of takerItems) {
      if (await isDisplayOwned(session.id, it.charName)) {
        return jsonFail(`${it.charName} kartu pajangan, tidak bisa di-trade.`, 400);
      }
    }
    for (const it of offer.items) {
      if (await isDisplayOwned(offer.ownerId, it.charName)) {
        return jsonFail('Ada kartu pajangan di penawaran, tidak bisa di-trade.', 400);
      }
    }
    const result = await executeBundleTrade(db, offer, session.id, session.username, takerItems);
    if (!result.ok) return jsonFail(result.message, 400);
    const out = { success: true, received: result.received, given: result.given };
    if (idemKey) await saveIdempotency(db, idemKey, session.id, 'trade/offer', 200, out);
    return jsonOk({ received: result.received, given: result.given });
  } catch (e) {
    console.error('[TRADE ACCEPT]', e.message);
    return jsonFail('Gagal tukar kartu.', 500);
  }
}

// Auth + batas hang server via apiHandler (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/trade/offer/route.js' });
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/trade/offer/route.js' });
