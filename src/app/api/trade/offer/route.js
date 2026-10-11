import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureTradeTable, executeTrade, getCardOwner, getOffer, normalizeTradeCode } from '@/lib/trade';

// GET /api/trade/offer?code=123456[&my=Nama] — intip penawaran sebelum tukar.
// Balik juga alreadyOwned (sudah punya kartu ini) dan penawaran milik sendiri.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const code = normalizeTradeCode(params.get('code'));
  const myCharName = String(params.get('my') || '').trim();
  if (!code) return NextResponse.json({ success: false, message: 'Kode wajib angka.' }, { status: 400 });

  try {
    await ensureTradeTable();
    const db = getDb();
    await db.execute('DELETE FROM trade_offers WHERE expires_at <= ?', [Date.now()]);
    const offer = await getOffer(db, code);
    if (!offer) {
      return NextResponse.json({ success: false, message: 'Kode tidak ditemukan / kedaluwarsa.' }, { status: 404 });
    }
    const card = await getCardOwner(db, offer.ownerId, offer.charName);
    const isMine = String(offer.ownerId) === String(session.id);
    const alreadyOwned = isMine ? false : Boolean(await getCardOwner(db, session.id, offer.charName));
    let mineOk = null;
    if (myCharName) {
      const mine = await getCardOwner(db, session.id, myCharName);
      const offererHas = await getCardOwner(db, offer.ownerId, myCharName);
      const same = mine && mine.charName.toLowerCase() === offer.charName.toLowerCase();
      mineOk = {
        owned: Boolean(mine),
        offererHas: Boolean(offererHas),
        same: Boolean(same),
        ok: Boolean(mine) && !offererHas && !same && !isMine && !alreadyOwned,
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

// POST /api/trade/offer { code, myCharName } — tukar kartumu dengan kartu penawar.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const code = normalizeTradeCode(body.code);
  const myCharName = String(body.myCharName || '').trim();
  if (!code || !myCharName) {
    return NextResponse.json({ success: false, message: 'Kode dan kartumu wajib diisi.' }, { status: 400 });
  }

  try {
    await ensureTradeTable();
    const db = getDb();
    await db.execute('DELETE FROM trade_offers WHERE expires_at <= ?', [Date.now()]);
    const offer = await getOffer(db, code);
    if (!offer) {
      return NextResponse.json({ success: false, message: 'Kode tidak ditemukan / kedaluwarsa.' }, { status: 404 });
    }
    const result = await executeTrade(db, offer, session.id, session.username, myCharName);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    return NextResponse.json({ success: true, received: result.received, given: result.given });
  } catch (e) {
    console.error('[TRADE ACCEPT]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal tukar kartu.' }, { status: 500 });
  }
}
