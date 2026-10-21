import { NextResponse } from 'next/server';
import { claimTopupBonus, ensureTopupBonusTables } from '@/lib/topupBonus';
import { getDb } from '@/lib/db';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';

// POST /api/shop/bonus/claim { milestoneId, period? }
// period diisi hanya untuk klaim masa tenggang bulan lalu; default bulan berjalan.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  try {
    await Promise.all([ensureTopupBonusTables(), ensureIdempotencyTable()]);
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, session.id, 'shop/bonus/claim');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    const r = await claimTopupBonus(session.id, session.username, body.milestoneId, {
      period: body.period,
    });
    if (!r.ok) return jsonFail(r.error, r.status || 400);
    const payload = {
      period: r.period || null,
      milestoneId: r.milestoneId || null,
      cards: r.cards || [],
      ...(r.alreadyClaimed ? { alreadyClaimed: true } : {}),
      ...(r.legacy ? { legacy: true } : {}),
      ...(r.pending ? { pending: true } : {}),
    };
    if (idemKey) {
      await saveIdempotency(db, idemKey, session.id, 'shop/bonus/claim', 200, { success: true, ...payload });
    }
    return jsonOk(payload);
  } catch (e) {
    console.error('[SHOP BONUS CLAIM]', e.message);
    return jsonFail('Gagal klaim bonus.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/bonus/claim/route.js' });
