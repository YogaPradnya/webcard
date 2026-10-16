import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import { ensureTradeTable, bundleStats } from '@/lib/trade';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




const PAGE_SIZE = 10;

// GET /api/trade/offers?q=&page= — list global penawaran aktif (10/page).
// Search cocok ke username pemilik, nama kartu, dan kode.
async function GET_impl(req, _ctx, session) {
  const params = new URL(req.url).searchParams;
  const q = String(params.get('q') || '').trim().slice(0, 50);
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    await ensureTradeTable();
    const db = getDb();
    const now = Date.now();

    const like = `%${q}%`;
    const where = q
      ? 'WHERE expires_at > ? AND (owner_username LIKE ? OR char_name LIKE ? OR code LIKE ?)'
      : 'WHERE expires_at > ?';
    const args = q ? [now, like, like, like] : [now];

    // Cleanup + COUNT + SELECT dalam 1 round-trip (dulu 4 sequential ke Tokyo).
    const [, , countRes, res] = await db.batch([
      { sql: 'DELETE FROM trade_offer_items WHERE code NOT IN (SELECT code FROM trade_offers WHERE expires_at > ?)', args: [now] },
      { sql: 'DELETE FROM trade_offers WHERE expires_at <= ?', args: [now] },
      { sql: `SELECT COUNT(*) AS total FROM trade_offers ${where}`, args },
      {
        sql: `SELECT code, owner_id, owner_username, char_name, rarity, expires_at, amount
            FROM trade_offers ${where}
            ORDER BY rowid DESC LIMIT ? OFFSET ?`,
        args: [...args, PAGE_SIZE, offset],
      },
    ]);
    const total = Number(countRes.rows[0]?.total || 0);
    const codes = res.rows.map((r) => String(r.code));
    const itemsByCode = {};
    if (codes.length) {
      const placeholders = codes.map(() => '?').join(',');
      const itemRes = await db.execute({
        sql: `SELECT code, char_name, rarity, amount FROM trade_offer_items WHERE code IN (${placeholders})`,
        args: codes,
      });
      for (const it of itemRes.rows) {
        const c = String(it.code);
        (itemsByCode[c] = itemsByCode[c] || []).push({
          charName: String(it.char_name),
          rarity: String(it.rarity || 'Common'),
          amount: Math.max(1, Number(it.amount) || 1),
        });
      }
    }
    const offers = res.rows.map((r) => {
      const code = String(r.code);
      const list = itemsByCode[code] && itemsByCode[code].length ? itemsByCode[code] : [{
        charName: String(r.char_name),
        rarity: String(r.rarity || 'Common'),
        amount: Math.max(1, Number(r.amount) || 1),
      }];
      const stats = bundleStats(list);
      return {
        code,
        ownerUsername: String(r.owner_username || ''),
        charName: String(r.char_name),
        rarity: String(r.rarity || 'Common'),
        expiresAt: Number(r.expires_at) || 0,
        amount: Math.max(1, Number(r.amount) || 1),
        isMine: String(r.owner_id) === String(session.id),
        items: list,
        totalCards: stats.count,
        totalValue: stats.value,
      };
    });
    return jsonOk({
      offers,
      pagination: { page, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      q,
    });
  } catch (e) {
    console.error('[TRADE OFFERS]', e.message);
    return jsonFail('Gagal memuat trade ready.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/trade/offers/route.js' });
