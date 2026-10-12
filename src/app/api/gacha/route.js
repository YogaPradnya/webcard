import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getGachaSettings, tenCost, ensureGachaHistory, stockSummary } from '@/lib/gacha';

// GET /api/gacha — info gacha web: cost 1x/10x (diskon 10%), rate, stok, XP, riwayat.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    const db = getDb();
    await ensureGachaHistory();
    const { config, pool } = await getGachaSettings();
    const [xpRes, pityRes, histRes] = await Promise.all([
      db.execute({ sql: 'SELECT xp, username FROM user_stats WHERE user_id = ?', args: [String(session.id)] }),
      db.execute({ sql: 'SELECT total_pulls, pulls_today FROM user_card_pity WHERE user_id = ?', args: [String(session.id)] }),
      db.execute({ sql: 'SELECT char_name, rarity, is_new, created_at FROM web_gacha_history WHERE user_id = ? ORDER BY id DESC LIMIT 10', args: [String(session.id)] }),
    ]);
    const xp = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) || 0 : 0;
    const stocks = await stockSummary(pool, config.stocks);
    return NextResponse.json({
      success: true,
      cost: config.cost,
      cost10: tenCost(config.cost),
      rates: config.rates,
      stocks,
      xp,
      totalPulls: pityRes.rows.length > 0 ? Number(pityRes.rows[0].total_pulls) || 0 : 0,
      pullsToday: pityRes.rows.length > 0 ? Number(pityRes.rows[0].pulls_today) || 0 : 0,
      history: histRes.rows.map((r) => ({
        charName: String(r.char_name),
        rarity: String(r.rarity || 'Common'),
        isNew: Number(r.is_new) === 1,
        createdAt: Number(r.created_at) || 0,
      })),
    });
  } catch (e) {
    console.error('[GACHA INFO]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat gacha.' }, { status: 500 });
  }
}
