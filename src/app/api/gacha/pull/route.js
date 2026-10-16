import { getDb } from '@/lib/db';
import { performWebPulls } from '@/lib/gacha';
import { jakartaDateKey } from '@/lib/jakartaTime';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';

const inflight = new Set();

// POST /api/gacha/pull { count: 1 | 10 } — gacha web (tanpa limit harian).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const count = Number(body.count) === 10 ? 10 : 1;
  const key = String(session.id);
  if (inflight.has(key)) {
    return jsonFail('Masih memproses gacha sebelumnya.', 429);
  }
  inflight.add(key);
  try {
    await ensureIdempotencyTable();
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, key, 'gacha/pull');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    let username = session.username || '';
    try {
      const r = await db.execute({ sql: 'SELECT username FROM user_stats WHERE user_id = ?', args: [key] });
      if (r.rows.length > 0 && r.rows[0].username) username = String(r.rows[0].username);
    } catch { /* fallback */ }
    const result = await performWebPulls(key, username, count, jakartaDateKey());
    if (result.error === 'NO_XP') {
      return jsonFail(`XP kurang (butuh ${result.costTotal}, punya ${result.xp}).`, 400);
    }
    if (result.error === 'SOLD_OUT') {
      return jsonFail('Semua stok kartu habis. Coba lagi nanti.', 400);
    }
    const out = { success: true, ...result };
    if (idemKey) await saveIdempotency(db, idemKey, key, 'gacha/pull', 200, out);
    return jsonOk({ ...result });
  } catch (e) {
    console.error('[GACHA PULL]', e.message);
    return jsonFail('Gagal gacha. Coba lagi.', 500);
  } finally {
    inflight.delete(key);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/gacha/pull/route.js' });
