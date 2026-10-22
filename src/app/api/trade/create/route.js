import { getDb } from '@/lib/db';
import { isDisplayOwned } from '@/lib/display';
import { apiHandler, jsonOk, jsonFail, parseJson, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import {


  ensureTradeTable,
  generateTradeCode,
  getCardOwner,
  getOffer,
  getOfferItems,
  cleanupTradeOffers,
  normalizeBundleItems,
  bundleStats,
  MAX_ACTIVE_TRADES_PER_USER,
  MAX_TRADE_CARDS_PER_SIDE,
  TRADE_TTL_MS,
} from '@/lib/trade';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// POST /api/trade/create { items:[{charName, amount}] } — bundle maks 10 kartu.
// Kompatibel body lama { charName, amount } (1 kartu).
// 1 user boleh punya s/d MAX_ACTIVE_TRADES_PER_USER penawaran aktif, tiap kode TTL 10 menit.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  if (Array.isArray(body.items) && body.items.length > 100) {
    return jsonFail('Daftar kartu terlalu panjang.', 400);
  }
  const rawItems = Array.isArray(body.items) && body.items.length
    ? body.items
    : [{ charName: body.charName, amount: body.amount }];
  const items = normalizeBundleItems(rawItems);
  if (items.length === 0) {
    return jsonFail('Pilih kartumu dulu (maks 10).', 400);
  }
  const stats = bundleStats(items);
  if (stats.count > MAX_TRADE_CARDS_PER_SIDE) {
    return jsonFail(`Maksimal ${MAX_TRADE_CARDS_PER_SIDE} kartu per penawaran.`, 400);
  }

  try {
    await ensureTradeTable();
    await ensureIdempotencyTable();
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, session.id, 'trade/create');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    await cleanupTradeOffers(db);

    // Validasi kepemilikan tiap item.
    const owned = [];
    for (const it of items) {
      const card = await getCardOwner(db, session.id, it.charName);
      if (!card) {
        return jsonFail(`Kamu tidak punya kartu ${it.charName}.`, 400);
      }
      // Kartu pajangan (display-only) tidak bisa di-trade.
      if (await isDisplayOwned(session.id, card.charName)) {
        return jsonFail(`${card.charName} kartu pajangan, tidak bisa di-trade.`, 400);
      }
      if (it.amount > card.quantity) {
        return jsonFail(`Kamu hanya punya ${card.quantity} copy ${card.charName}.`, 400);
      }
      owned.push({ ...it, charName: card.charName, rarity: card.rarity });
    }

    const countRes = await db.execute({
      sql: 'SELECT COUNT(*) AS total FROM trade_offers WHERE owner_id = ? AND expires_at > ?',
      args: [session.id, Date.now()],
    });
    const activeCount = Number(countRes.rows[0]?.total || 0);
    if (activeCount >= MAX_ACTIVE_TRADES_PER_USER) {
      return jsonFail(
        `Batas ${MAX_ACTIVE_TRADES_PER_USER} penawaran aktif. Batalkan salah satu dulu.`,
        400,
      );
    }

    let code = '';
    for (let i = 0; i < 10; i++) {
      const cand = generateTradeCode();
      if (!(await getOffer(db, cand))) {
        code = cand;
        break;
      }
    }
    if (!code) {
      return jsonFail('Gagal buat kode. Coba lagi.', 500);
    }
    const first = owned[0];
    const expiresAt = Date.now() + TRADE_TTL_MS;
    await db.execute({
      sql: 'INSERT INTO trade_offers (code, owner_id, owner_username, char_name, rarity, expires_at, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [code, session.id, session.username || '', first.charName, first.rarity, expiresAt, stats.count],
    });
    for (const it of owned) {
      await db.execute({
        sql: 'INSERT INTO trade_offer_items (code, char_name, rarity, amount) VALUES (?, ?, ?, ?)',
        args: [code, it.charName, it.rarity, it.amount],
      });
    }
    const out = {
      success: true,
      code,
      items: owned,
      totalCards: stats.count,
      totalValue: stats.value,
      expiresAt,
      // Kompatibel klien lama (item pertama).
      charName: first.charName,
      amount: stats.count,
    };
    if (idemKey) await saveIdempotency(db, idemKey, session.id, 'trade/create', 200, out);
    return jsonOk({
      code,
      items: owned,
      totalCards: stats.count,
      totalValue: stats.value,
      expiresAt,
      // Kompatibel klien lama (item pertama).
      charName: first.charName,
      amount: stats.count,
    });
  } catch (e) {
    console.error('[TRADE CREATE]', e.message);
    return jsonFail('Gagal buat kode.', 500);
  }
}

// GET /api/trade/create — penawaran aktif milik sendiri (beserta bundle items).
async function GET_impl(req, _ctx, session) {
  try {
    await ensureTradeTable();
    const res = await getDb().execute({
      sql: 'SELECT code, char_name, rarity, expires_at, amount FROM trade_offers WHERE owner_id = ? AND expires_at > ?',
      args: [session.id, Date.now()],
    });
    const db = getDb();
    const offers = [];
    for (const r of res.rows) {
      const items = await getOfferItems(db, String(r.code));
      const list = items.length ? items : [{
        charName: String(r.char_name),
        rarity: String(r.rarity || 'Common'),
        amount: Math.max(1, Number(r.amount) || 1),
      }];
      const stats = bundleStats(list);
      offers.push({
        code: String(r.code),
        charName: String(r.char_name),
        rarity: String(r.rarity || 'Common'),
        expiresAt: Number(r.expires_at) || 0,
        amount: Math.max(1, Number(r.amount) || 1),
        items: list,
        totalCards: stats.count,
        totalValue: stats.value,
      });
    }
    return jsonOk({ offers });
  } catch (e) {
    console.error('[TRADE MINE]', e.message);
    return jsonFail('Gagal memuat penawaran.', 500);
  }
}

// DELETE /api/trade/create?code=123456 — batalkan penawaran sendiri (+ items).
async function DELETE_impl(req, _ctx, session) {
  const code = new URL(req.url).searchParams.get('code') || '';
  try {
    await ensureTradeTable();
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM trade_offer_items WHERE code = ? AND code IN (SELECT code FROM trade_offers WHERE code = ? AND owner_id = ?)',
      args: [code, code, session.id],
    });
    await db.execute({
      sql: 'DELETE FROM trade_offers WHERE code = ? AND owner_id = ?',
      args: [code, session.id],
    });
    return jsonOk();
  } catch (e) {
    console.error('[TRADE CANCEL]', e.message);
    return jsonFail('Gagal membatalkan.', 500);
  }
}

// Auth + batas hang server via apiHandler (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/trade/create/route.js' });
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/trade/create/route.js' });
export const DELETE = apiHandler(DELETE_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/trade/create/route.js' });
