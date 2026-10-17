import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import { getBookCards } from '@/lib/cards';
import { getDisplayCards } from '@/lib/display';
import { getShowcaseSource } from '@/lib/profilePrefs';
import { listUserSlots, ensureShopTables } from '@/lib/shop';
import { getMissionStatus, recordEvent } from '@/lib/missions';
import { buildProfileData, profileOwnedCards } from '@/lib/profileData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// Top 5 klasemen PvP untuk kartu mini di halaman Profil.
async function pvpLeaderboardTop5(userId) {
  const res = await getDb().execute({
    sql: 'SELECT user_id, username, wins, losses FROM battle_leaderboard ORDER BY wins DESC, losses ASC LIMIT 5',
    args: [],
  });
  return res.rows.map((r) => ({
    username: String(r.username || ''),
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    isMe: String(r.user_id) === String(userId),
  }));
}

// GET /api/profile/summary — SEMUA data halaman Profil dalam 1 request.
// Dulu halaman memanggil 7 endpoint terpisah (profile, cards, leaderboard,
// display, showcase-source, slots, missions) — tiap request = unseal sesi +
// beberapa round-trip ke Turso Tokyo. Sekarang 1 request, query paralel.
// Seksi non-kritis gagal sendiri-sendiri (flag sections.<x>=false) agar
// halaman tetap tampil walau 1 bagian lambat/error. sections.profile wajib.
async function GET_impl(req, _ctx, session) {
  const [profileR, bookR, displayR, srcR, slotR, missionR, lbR] = await Promise.allSettled([
    buildProfileData(session),
    getBookCards(session.id),
    getDisplayCards(session.id),
    getShowcaseSource(session.id),
    (async () => { await ensureShopTables(); return listUserSlots(session.id); })(),
    (async () => { await recordEvent(session.id, session.username, 'login', 1); return getMissionStatus(session.id); })(),
    pvpLeaderboardTop5(session.id),
  ]);
  for (const [name, r] of [['profile', profileR], ['cards', bookR], ['display', displayR], ['showcaseSource', srcR], ['slots', slotR], ['missions', missionR], ['leaderboard', lbR]]) {
    if (r.status === 'rejected') console.error('[PROFILE SUMMARY]', name, r.reason?.message || r.reason);
  }
  if (profileR.status === 'rejected') {
    return jsonFail('Gagal memuat profil.', 500);
  }
  const missions = missionR.status === 'fulfilled' ? missionR.value : null;
  return jsonOk({
    profile: profileR.value,
    ownedCards: bookR.status === 'fulfilled' ? profileOwnedCards(bookR.value) : [],
    displayCards: displayR.status === 'fulfilled' ? (displayR.value.cards || []) : [],
    showcaseSource: srcR.status === 'fulfilled' ? srcR.value : 'auto',
    slots: slotR.status === 'fulfilled' ? (slotR.value || []) : [],
    daily: missions ? (missions.daily || []) : [],
    weekly: missions ? (missions.weekly || []) : [],
    leaderboard: lbR.status === 'fulfilled' ? lbR.value : [],
    sections: {
      ownedCards: bookR.status === 'fulfilled',
      display: displayR.status === 'fulfilled',
      showcaseSource: srcR.status === 'fulfilled',
      slots: slotR.status === 'fulfilled',
      missions: missionR.status === 'fulfilled',
      leaderboard: lbR.status === 'fulfilled',
    },
  });
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/profile/summary/route.js' });
