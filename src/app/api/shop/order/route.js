import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import {
  SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, findPack, genMerchantOrderId,
  createSnapTransaction, countUserSlots, ensureShopTables,
} from '@/lib/shop';

// POST /api/shop/order { kind: 'xp', packId } | { kind: 'slot', qty }
// Return { orderId, snapToken } untuk dibuka via Snap.js.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const kind = String(body.kind || '');
  try {
    await ensureShopTables();
    let amountIdr = 0;
    let xpAmount = 0;
    let qty = 1;
    let ref = '';
    let itemName = '';
    if (kind === 'xp') {
      const pack = findPack(body.packId);
      if (!pack) return NextResponse.json({ success: false, message: 'Paket tidak dikenal.' }, { status: 400 });
      amountIdr = pack.priceIdr;
      xpAmount = pack.xp;
      ref = pack.id;
      itemName = `Top-Up ${xpAmount.toLocaleString('id-ID')} XP Animein`;
    } else if (kind === 'slot') {
      qty = Math.min(10, Math.max(1, parseInt(body.qty, 10) || 1));
      const have = await countUserSlots(session.id);
      if (have + qty > MAX_SLOTS_PER_USER) {
        return NextResponse.json({ success: false, message: `Maksimal ${MAX_SLOTS_PER_USER} slot per user (kamu punya ${have}).` }, { status: 400 });
      }
      amountIdr = SLOT_PRICE_IDR * qty;
      ref = 'display-slot';
      itemName = `Slot Kartu Pajangan x${qty} Animein`;
    } else {
      return NextResponse.json({ success: false, message: 'Jenis order tidak dikenal.' }, { status: 400 });
    }
    // order_id Midtrans = order_id kita (dipakai verifikasi webhook).
    const orderId = genMerchantOrderId();
    const { token } = await createSnapTransaction({
      orderId,
      grossAmount: amountIdr,
      itemName,
      username: session.username,
    });
    const now = Date.now();
    await getDb().execute({
      sql: `INSERT INTO shop_orders (order_id, user_id, username, kind, ref, qty, amount_idr, xp_amount, status, snap_token, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      args: [orderId, String(session.id), String(session.username || ''), kind, ref, qty, amountIdr, xpAmount, token, now, now],
    });
    return NextResponse.json({ success: true, orderId, snapToken: token });
  } catch (e) {
    console.error('[SHOP ORDER]', e.message);
    const msg = /MIDTRANS_SERVER_KEY/.test(e.message)
      ? 'Pembayaran belum dikonfigurasi. Hubungi admin.'
      : 'Gagal membuat pembayaran. Coba lagi.';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
