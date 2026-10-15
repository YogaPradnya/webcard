import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { isDisplayOwned } from '@/lib/display';
import { ensureTradeTable, executeBundleTrade, getCardOwner, getOffer, normalizeTradeCode, normalizeBundleItems, checkBundleRule, bundleStats, cleanupTradeOffers } from '@/lib/trade';
import { checkRateCount } from '@/lib/rateLimit';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/trade/offer?code=123456[&my=Nama&myQty=N | &myItems=[{charName,amount}]] — intip penawaran.
// Balik juga alreadyOwned dan penawaran milik sendiri. mineOk menilai bundle penuh.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const code = normalizeTradeCode(params.get('code'));
  const myCharName = String(params.get('my') || '').trim();
  const myQty = Math.max(1, parseInt(params.get('myQty'), 10) || 1);
  let myItemsRaw = [];
  const myItemsParam = String(params.get('myItems') || '').trim();
  if (myItemsParam) {
    try {
      const parsed = JSON.parse(myItemsParam);
      if (Array.isArray(parsed)) myItemsRaw = parsed;
    } catch { /* abaikan, fallback legacy */ }
  }
  if (!myItemsRaw.length && myCharName) myItemsRaw = [{ charName: myCharName, amount: myQty }];
  if (!code) return NextResponse.json({ success: false, message: 'Kode wajib angka.' }, { status: 400 });
  const attempt = await checkRateCount(`tradeview:${session.id}`, 30, 60 * 1000);
  if (!attempt.ok) {
    return NextResponse.json({ success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar.' }, { status: 429 });
  }

  try {
    await ensureTradeTable();
    const db = getDb();
    await cleanupTradeOffers(db);
    const offer = await getOffer(db, code);
    if (!offer) {
      return NextResponse.json({ success: false, message: 'Kode tidak ditemukan / kedaluwarsa.' }, { status: 404 });
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
    return NextResponse.json({
      success: true,
      offer: { ...offer, isMine },
      card,
      alreadyOwned,
      mineOk,
    });
  } catch (e) {
    console.error('[TRADE OFFER]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat penawaran.' }, { status: 500 });
  }
}

// POST /api/trade/offer { code, myItems:[{charName, amount}] } — tukar bundle.
// Kompatibel body lama { code, myCharName, myAmount } (1 kartu).
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const code = normalizeTradeCode(body.code);
  const rawItems = Array.isArray(body.myItems) && body.myItems.length
    ? body.myItems
    : [{ charName: body.myCharName, amount: body.myAmount }];
  const takerItems = normalizeBundleItems(rawItems);
  if (!code || !takerItems.length) {
    return NextResponse.json({ success: false, message: 'Kode dan kartumu wajib diisi.' }, { status: 400 });
  }

  try {
    await ensureTradeTable();
    const db = getDb();
    await cleanupTradeOffers(db);
    const offer = await getOffer(db, code);
    if (!offer) {
      return NextResponse.json({ success: false, message: 'Kode tidak ditemukan / kedaluwarsa.' }, { status: 404 });
    }
    // Kartu pajangan (display-only) tidak bisa di-trade — cek semua sisi.
    for (const it of takerItems) {
      if (await isDisplayOwned(session.id, it.charName)) {
        return NextResponse.json({ success: false, message: `${it.charName} kartu pajangan, tidak bisa di-trade.` }, { status: 400 });
      }
    }
    for (const it of offer.items) {
      if (await isDisplayOwned(offer.ownerId, it.charName)) {
        return NextResponse.json({ success: false, message: 'Ada kartu pajangan di penawaran, tidak bisa di-trade.' }, { status: 400 });
      }
    }
    const result = await executeBundleTrade(db, offer, session.id, session.username, takerItems);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    return NextResponse.json({ success: true, received: result.received, given: result.given });
  } catch (e) {
    console.error('[TRADE ACCEPT]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal tukar kartu.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/trade/offer/route.js');
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/trade/offer/route.js');
