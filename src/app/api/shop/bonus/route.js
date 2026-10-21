import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { ensureTopupBonusTables, getTopupBonusState } from '@/lib/topupBonus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/shop/bonus — progres Bonus Top-Up Bulanan milik user.
async function GET_impl(_req, _ctx, session) {
  try {
    await ensureTopupBonusTables();
    const bonus = await getTopupBonusState(session.id);
    return jsonOk({ bonus });
  } catch (e) {
    console.error('[SHOP BONUS]', e.message);
    return jsonFail('Gagal memuat bonus top-up.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/shop/bonus/route.js' });
