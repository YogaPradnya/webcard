import { getDb } from '@/lib/db';
import { ensureDisplayTable } from '@/lib/display';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/display/showcase { name, showcase: boolean } — pajang kartu display dari web (slot terpisah).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const name = String(body.name || '').trim();
  const showcase = body.showcase !== undefined ? Boolean(body.showcase) : true;
  if (!name) return jsonFail('Nama kartu wajib diisi.', 400);
  try {
    await ensureDisplayTable();
    const db = getDb();
    const check = await db.execute({
      sql: 'SELECT id FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      args: [String(session.id), name],
    });
    if (check.rows.length === 0) {
      return jsonFail('Kamu tidak punya kartu pajangan itu.', 400);
    }
    if (showcase) {
      await db.execute({
        sql: 'UPDATE user_display_cards SET is_showcase = 0 WHERE user_id = ?',
        args: [String(session.id)],
      });
    }
    await db.execute({
      sql: 'UPDATE user_display_cards SET is_showcase = ? WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      args: [showcase ? 1 : 0, String(session.id), name],
    });
    return jsonOk({ name, showcase });
  } catch (e) {
    console.error('[DISPLAY SHOWCASE]', e.message);
    return jsonFail('Gagal atur pajangan.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/display/showcase/route.js' });
