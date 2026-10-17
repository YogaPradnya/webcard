import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import { ensureBattleRooms } from '@/lib/rooms';
import { parseExcludedUsernames, excludedUsernamesClause } from '@/lib/exclusions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/battle/leaderboard?tab=pvp|collector|xp — klasemen PvP, kolektor, XP.
// Klasemen Kolektor (jumlah kartu) menyembunyikan akun exclude
// (STOCK_EXCLUDE_USERNAMES — pasti punya semua kartu). PvP & XP apa adanya.
// Publik & sama untuk semua user -> cache memori 60 dtk (0 query saat hit).
const _lbCache = new Map(); // tab -> { at, payload }
const LB_TTL_MS = 60 * 1000;

async function GET_impl(req, _ctx, session) {
  const tab = String(new URL(req.url).searchParams.get('tab') || 'pvp');
  const hit = _lbCache.get(tab);
  if (hit && Date.now() - hit.at < LB_TTL_MS) {
    const rows = hit.payload.map((r) => {
      const { user_id, ...pub } = r;
      return { ...pub, isMe: String(user_id) === String(session.id) };
    });
    return jsonOk({ tab: hit.tab, leaderboard: rows });
  }

  try {
    await ensureBattleRooms();
    const db = getDb();
    // Kolektor: sembunyikan akun exclude (pasti punya semua kartu) dari
    // hitungan jumlah kartu. PvP & XP tetap menampilkan mereka.
    const exStats = excludedUsernamesClause(parseExcludedUsernames(), 's.username');
    if (tab === 'collector') {
      const res = await db.execute({
        sql: `SELECT s.user_id, s.username, COUNT(c.char_name) AS owned
              FROM user_stats s LEFT JOIN user_cards c ON c.user_id = s.user_id${exStats.sql}
              GROUP BY s.user_id, s.username ORDER BY owned DESC LIMIT 20`,
        args: exStats.args,
      });
      const rows = res.rows.map((r) => ({
        user_id: String(r.user_id),
        username: String(r.username || ''),
        owned: Number(r.owned) || 0,
      }));
      _lbCache.set('collector', { at: Date.now(), tab: 'collector', payload: rows });
      return jsonOk({ tab, leaderboard: rows.map((r) => { const { user_id, ...pub } = r; return { ...pub, isMe: user_id === String(session.id) }; }) });
    }
    if (tab === 'xp') {
      const res = await db.execute({
        sql: 'SELECT user_id, username, xp, level FROM user_stats ORDER BY xp DESC LIMIT 20',
        args: [],
      });
      const rows = res.rows.map((r) => ({
        user_id: String(r.user_id),
        username: String(r.username || ''),
        xp: Number(r.xp) || 0,
        level: Number(r.level) || 1,
      }));
      _lbCache.set('xp', { at: Date.now(), tab: 'xp', payload: rows });
      return jsonOk({ tab, leaderboard: rows.map((r) => { const { user_id, ...pub } = r; return { ...pub, isMe: user_id === String(session.id) }; }) });
    }
    const res = await db.execute({
      sql: 'SELECT user_id, username, wins, losses, updated_at FROM battle_leaderboard ORDER BY wins DESC, losses ASC LIMIT 20',
      args: [],
    });
    const rows = res.rows.map((r) => {
      const wins = Number(r.wins) || 0;
      const losses = Number(r.losses) || 0;
      const total = wins + losses;
      return {
        user_id: String(r.user_id),
        username: String(r.username || ''),
        wins,
        losses,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      };
    });
    _lbCache.set('pvp', { at: Date.now(), tab: 'pvp', payload: rows });
    return jsonOk({ tab: 'pvp', leaderboard: rows.map((r) => { const { user_id, ...pub } = r; return { ...pub, isMe: user_id === String(session.id) }; }) });
  } catch (e) {
    console.error('[BATTLE LB]', e.message);
    return jsonFail('Gagal memuat leaderboard.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/leaderboard/route.js' });
