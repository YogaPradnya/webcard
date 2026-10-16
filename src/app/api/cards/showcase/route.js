import { getDb } from '@/lib/db';
import { getEffectiveArt } from '@/lib/cards';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/cards/showcase { charName, showcase: boolean } — atur kartu pajangan dari web.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const charName = String(body.charName || '').trim();
  const showcase = Boolean(body.showcase);
  if (!charName) return jsonFail('Nama kartu wajib diisi.', 400);
  try {
    const db = getDb();
    const check = await db.execute({
      sql: 'SELECT char_name, image_url FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(session.id), charName],
    });
    if (check.rows.length === 0) {
      return jsonFail('Kamu tidak punya kartu itu.', 400);
    }
    if (showcase) {
      // Satu pajangan aktif: matikan yang lain dulu (maks 1 showcase seperti bot).
      await db.execute({
        sql: 'UPDATE user_cards SET is_showcase = 0 WHERE user_id = ?',
        args: [String(session.id)],
      });
      // Backfill image_url bila kosong: bot (.profil) hanya menampilkan pajangan
      // yang punya image_url di DB, sementara web selama ini pakai art fallback lokal.
      if (!check.rows[0].image_url) {
        try {
          const art = await getEffectiveArt(String(check.rows[0].char_name || charName));
          if (art) {
            await db.execute({
              sql: 'UPDATE user_cards SET image_url = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
              args: [art, String(session.id), charName],
            });
          }
        } catch { /* non-kritis: pajangan tetap tersimpan */ }
      }
    }
    await db.execute({
      sql: 'UPDATE user_cards SET is_showcase = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [showcase ? 1 : 0, String(session.id), charName],
    });
    return jsonOk({ charName, showcase });
  } catch (e) {
    console.error('[SHOWCASE]', e.message);
    return jsonFail('Gagal atur pajangan.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/cards/showcase/route.js' });
