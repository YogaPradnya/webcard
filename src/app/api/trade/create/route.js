import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import {
  ensureTradeTable,
  generateTradeCode,
  getCardOwner,
  getOffer,
  TRADE_TTL_MS,
} from '@/lib/trade';

// POST /api/trade/create { charName } — buat kode angka untuk 1 kartu milik sendiri.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const charName = String(body.charName || '').trim();
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

    // 1 user 1 penawaran aktif (buat baru menggantikan yang lama).
    await db.execute({ sql: 'DELETE FROM trade_offers WHERE owner_id = ?', args: [session.id] });

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
      sql: 'INSERT INTO trade_offers (code, owner_id, owner_username, char_name, rarity, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [code, session.id, session.username || '', owned.charName, owned.rarity, expiresAt],
    });
    return NextResponse.json({ success: true, code, charName: owned.charName, expiresAt });
  } catch (e) {
    console.error('[TRADE CREATE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal buat kode.' }, { status: 500 });
  }
}

// GET /api/trade/create — penawaran aktif milik sendiri.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureTradeTable();
    const res = await getDb().execute({
      sql: 'SELECT code, char_name, rarity, expires_at FROM trade_offers WHERE owner_id = ? AND expires_at > ?',
      args: [session.id, Date.now()],
    });
    const offers = res.rows.map((r) => ({
      code: String(r.code),
      charName: String(r.char_name),
      rarity: String(r.rarity || 'Common'),
      expiresAt: Number(r.expires_at) || 0,
    }));
    return NextResponse.json({ success: true, offers });
  } catch (e) {
    console.error('[TRADE MINE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat penawaran.' }, { status: 500 });
  }
}

// DELETE /api/trade/create?code=123456 — batalkan penawaran sendiri.
export async function DELETE(req) {
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
