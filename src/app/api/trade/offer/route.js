import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { isDisplayOwned } from '@/lib/display';
import { ensureTradeTable, executeTrade, getCardOwner, getOffer, normalizeTradeCode, checkTradeTierRule } from '@/lib/trade';
import { checkRateCount } from '@/lib/rateLimit';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/trade/offer?code=123456[&my=Nama&myQty=N] — intip penawaran sebelum tukar.
// Balik juga alreadyOwned dan penawaran milik sendiri.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const code = normalizeTradeCode(params.get('code'));
  const myCharName = String(params.get('my') || '').trim();
  const myQty = Math.max(1, parseInt(params.get('myQty'), 10) || 1);
  if (!code) return NextResponse.json({ success: false, message: 'Kode wajib angka.' }, { status: 400 });
  const attempt = await checkRateCount(`tradeview:${session.id}`, 30, 60 * 1000);
  if (!attempt.ok) {
    return NextResponse.json({ success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar.' }, { status: 429 });
  }

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
      const same = mine && mine.charName.toLowerCase() === offer.charName.toLowerCase();
      const rule = mine && !same
        ? checkTradeTierRule(offer.rarity, offer.amount, mine.rarity, myQty)
        : { ok: true };
      mineOk = {
        owned: Boolean(mine),
        quantity: mine ? mine.quantity : 0,
        enough: mine ? mine.quantity >= myQty : false,
        same: Boolean(same),
        ruleOk: Boolean(rule.ok),
        ruleMessage: rule.ok ? null : rule.message,
        ok: Boolean(mine) && mine.quantity >= myQty && !same && !isMine && Boolean(rule.ok),
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

// POST /api/trade/offer { code, myCharName, myAmount } — tukar copy kartumu dengan penawar.
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
  const myCharName = String(body.myCharName || '').trim();
  const myAmount = Math.max(1, Math.floor(Number(body.myAmount) || 1));
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
    // Kartu pajangan (display-only) tidak bisa di-trade.
    if (await isDisplayOwned(session.id, myCharName)) {
      return NextResponse.json({ success: false, message: 'Kartu pajangan tidak bisa di-trade.' }, { status: 400 });
    }
    if (await isDisplayOwned(offer.ownerId, offer.charName)) {
      return NextResponse.json({ success: false, message: 'Kartu itu kartu pajangan, tidak bisa di-trade.' }, { status: 400 });
    }
    const result = await executeTrade(db, offer, session.id, session.username, myCharName, myAmount);
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
