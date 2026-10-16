import { getDb } from '@/lib/db';
import { getBookCards } from '@/lib/cards';
import { computeTitles, ensureWebTitleColumn } from '@/lib/titles';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/profile/title { title } — pasang gelar WEB yang sudah didapat (atau "" untuk lepas).
// Disimpan di user_stats.web_title agar custom_title (gelar costume bot) tidak tersentuh.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const title = String(body.title || '').trim().slice(0, 40);
  try {
    const db = getDb();
    await ensureWebTitleColumn();
    if (!title) {
      await db.execute({ sql: 'UPDATE user_stats SET web_title = NULL WHERE user_id = ?', args: [String(session.id)] });
      return jsonOk({ title: null });
    }
    const book = await getBookCards(session.id);
    const ownedMap = {};
    for (const c of book.cards) if (c.owned) ownedMap[String(c.name).toLowerCase()] = true;
    const computed = computeTitles(book.cards.map((c) => ({ name: c.name, tier: c.tier })), ownedMap);
    const found = computed.earned.find((t) => t.title === title);
    if (!found) {
      return jsonFail('Gelar belum didapat.', 400);
    }
    await db.execute({ sql: 'UPDATE user_stats SET web_title = ? WHERE user_id = ?', args: [title, String(session.id)] });
    return jsonOk({ title });
  } catch (e) {
    console.error('[PROFILE TITLE]', e.message);
    return jsonFail('Gagal pasang gelar.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/profile/title/route.js' });
