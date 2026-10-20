import { claimMission } from '@/lib/missions';
import { getDb } from '@/lib/db';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';

// POST /api/missions/claim { period: 'daily'|'weekly', missionId }
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const period = String(body.period || 'daily') === 'weekly' ? 'weekly' : 'daily';
  try {
    await ensureIdempotencyTable();
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, session.id, 'missions/claim');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    const r = await claimMission(session.id, session.username, period, body.missionId);
    if (!r.ok) return jsonFail(r.error, r.status || 400);
    const payload = {
      xp: r.xp,
      newXp: r.newXp,
      ...(r.alreadyClaimed ? { alreadyClaimed: true, claimedXp: r.claimedXp } : {}),
    };
    if (idemKey) {
      await saveIdempotency(db, idemKey, session.id, 'missions/claim', 200, { success: true, ...payload });
    }
    return jsonOk(payload);
  } catch (e) {
    console.error('[MISSION CLAIM]', e.message);
    return jsonFail('Gagal klaim misi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/missions/claim/route.js' });
