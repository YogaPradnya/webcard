import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { isDisplayOwned } from '@/lib/display';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';
import {
  ensureTradeTable,
  generateTradeCode,
  getCardOwner,
  getOffer,
  MAX_ACTIVE_TRADES_PER_USER,
  TRADE_TTL_MS,
} from '@/lib/trade';

// POST /api/trade/create { charName, amount } — buat kode angka untuk N copy kartu milik sendiri.
// 1 user boleh punya s/d MAX_ACTIVE_TRADES_PER_USER penawaran aktif, tiap kode TTL 10 menit.
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const charName = String(body.charName || '').trim();
  const amount = Math.max(1, Math.floor(Number(body.amount) || 1));
  if (!charName) {
    return NextResponse.json({ success: false, message: 'Pilih kartu dulu.' }, { status: 400 });
  }

  try {
    await ensureTradeTable();
    const db = getDb();
    await db.execute('DELETE FROM trade_offers WHERE expires_at <= ?', [Date.now()]);

    const owned = await getCardOwner(db, session.id, charName);
    if (!owned) {
      return NextResponse.json({ success: false, message: 'Kamu tidak punya kartu itu.' }, { status: 400 });
    }
    // Kartu pajangan (display-only) tidak bisa di-trade.
    if (await isDisplayOwned(session.id, owned.charName)) {
      return NextResponse.json({ success: false, message: 'Kartu pajangan tidak bisa di-trade.' }, { status: 400 });
    }
    if (amount > owned.quantity) {
      return NextResponse.json({ success: false, message: `Kamu hanya punya ${owned.quantity} copy.` }, { status: 400 });
    }

    const countRes = await db.execute({
      sql: 'SELECT COUNT(*) AS total FROM trade_offers WHERE owner_id = ? AND expires_at > ?',
      args: [session.id, Date.now()],
    });
    const activeCount = Number(countRes.rows[0]?.total || 0);
    if (activeCount >= MAX_ACTIVE_TRADES_PER_USER) {
      return NextResponse.json(
        { success: false, message: `Batas ${MAX_ACTIVE_TRADES_PER_USER} penawaran aktif. Batalkan salah satu dulu.` },
        { status: 400 },
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
      return NextResponse.json({ success: false, message: 'Gagal buat kode. Coba lagi.' }, { status: 500 });
    }
    const expiresAt = Date.now() + TRADE_TTL_MS;
    await db.execute({
      sql: 'INSERT INTO trade_offers (code, owner_id, owner_username, char_name, rarity, expires_at, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [code, session.id, session.username || '', owned.charName, owned.rarity, expiresAt, amount],
    });
    return NextResponse.json({ success: true, code, charName: owned.charName, amount, expiresAt });
  } catch (e) {
    console.error('[TRADE CREATE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal buat kode.' }, { status: 500 });
  }
}

// GET /api/trade/create — penawaran aktif milik sendiri.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureTradeTable();
    const res = await getDb().execute({
      sql: 'SELECT code, char_name, rarity, expires_at, amount FROM trade_offers WHERE owner_id = ? AND expires_at > ?',
      args: [session.id, Date.now()],
    });
    const offers = res.rows.map((r) => ({
      code: String(r.code),
      charName: String(r.char_name),
      rarity: String(r.rarity || 'Common'),
      expiresAt: Number(r.expires_at) || 0,
      amount: Math.max(1, Number(r.amount) || 1),
    }));
    return NextResponse.json({ success: true, offers });
  } catch (e) {
    console.error('[TRADE MINE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat penawaran.' }, { status: 500 });
  }
}

// DELETE /api/trade/create?code=123456 — batalkan penawaran sendiri.
async function DELETE_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') || '';
  try {
    await ensureTradeTable();
    await getDb().execute({
      sql: 'DELETE FROM trade_offers WHERE code = ? AND owner_id = ?',
      args: [code, session.id],
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[TRADE CANCEL]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal membatalkan.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/trade/create/route.js');
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/trade/create/route.js');
export const DELETE = withTimeout(DELETE_impl, READ_TIMEOUT_MS, 'src/app/api/trade/create/route.js');
