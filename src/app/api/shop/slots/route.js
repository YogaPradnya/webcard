import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { listUserSlots, MAX_SLOTS_PER_USER, ensureShopTables } from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/shop/slots — slot kartu pajangan milik user.
async function GET_impl(req, _ctx, session) {
  try {
    await ensureShopTables();
    const slots = await listUserSlots(session.id);
    return jsonOk({ slots, maxSlots: MAX_SLOTS_PER_USER });
  } catch (e) {
    console.error('[SHOP SLOTS]', e.message);
    return jsonFail('Gagal memuat slot.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/shop/slots/route.js' });
