import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { performWebPulls } from '@/lib/gacha';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

function jakartaDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const inflight = new Set();

// POST /api/gacha/pull { count: 1 | 10 } — gacha web (tanpa limit harian).
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const count = Number(body.count) === 10 ? 10 : 1;
  const key = String(session.id);
  if (inflight.has(key)) {
    return NextResponse.json({ success: false, message: 'Masih memproses gacha sebelumnya.' }, { status: 429 });
  }
  inflight.add(key);
  try {
    let username = session.username || '';
    try {
      const r = await getDb().execute({ sql: 'SELECT username FROM user_stats WHERE user_id = ?', args: [key] });
      if (r.rows.length > 0 && r.rows[0].username) username = String(r.rows[0].username);
    } catch { /* fallback */ }
    const result = await performWebPulls(key, username, count, jakartaDateKey());
    if (result.error === 'NO_XP') {
      return NextResponse.json({ success: false, message: `XP kurang (butuh ${result.costTotal}, punya ${result.xp}).`, xp: result.xp, costTotal: result.costTotal }, { status: 400 });
    }
    if (result.error === 'SOLD_OUT') {
      return NextResponse.json({ success: false, message: 'Semua stok kartu habis. Coba lagi nanti.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('[GACHA PULL]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal gacha. Coba lagi.' }, { status: 500 });
  } finally {
    inflight.delete(key);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/gacha/pull/route.js');
