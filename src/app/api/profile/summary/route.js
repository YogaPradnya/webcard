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

// Tiap seksi punya batas sendiri. Dulu Promise.allSettled menunggu SEMUA
// query; satu query lambat (card_battle_stats / write misi) menahan seluruh
// request sampai apiHandler membunuhnya di 9 dtk -> 503 "Server sibuk".
// Sekarang seksi non-kritis cukup gagal sendiri, profil tetap tampil.
const SECTION_TIMEOUT_MS = 5000;
const PROFILE_TIMEOUT_MS = 8000;

function settleWithin(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timeout ${ms}ms`);
      err.code = 'SECTION_TIMEOUT';
      reject(err);
    }, ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

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
  // Satu sumber data kartu & display, dipakai bersama oleh profil + section.
  // In-flight dedupe di getBookCards mencegah query koleksi dobel.
  const bookP = getBookCards(session.id);
  const displayP = getDisplayCards(session.id);
  const displaySafeP = displayP.catch(() => ({ cards: [], total: 0 }));

  const [profileR, bookR, displayR, srcR, slotR, missionR, lbR] = await Promise.allSettled([
    settleWithin(buildProfileData(session, { book: bookP, display: displaySafeP }), PROFILE_TIMEOUT_MS, 'profile'),
    settleWithin(bookP, SECTION_TIMEOUT_MS, 'cards'),
    settleWithin(displayP, SECTION_TIMEOUT_MS, 'display'),
    settleWithin(getShowcaseSource(session.id), SECTION_TIMEOUT_MS, 'showcaseSource'),
    settleWithin((async () => { await ensureShopTables(); return listUserSlots(session.id); })(), SECTION_TIMEOUT_MS, 'slots'),
    settleWithin((async () => {
      // Catat login dulu supaya misi "Buka web hari ini" langsung 1/1 pada
      // load pertama. recordEvent dedupe 1x/hari dan menelan error sendiri.
      await recordEvent(session.id, session.username, 'login', 1).catch(() => {});
      return getMissionStatus(session.id);
    })(), SECTION_TIMEOUT_MS, 'missions'),
    settleWithin(pvpLeaderboardTop5(session.id), SECTION_TIMEOUT_MS, 'leaderboard'),
  ]);
  for (const [name, r] of [['profile', profileR], ['cards', bookR], ['display', displayR], ['showcaseSource', srcR], ['slots', slotR], ['missions', missionR], ['leaderboard', lbR]]) {
    if (r.status === 'rejected') console.error('[PROFILE SUMMARY]', name, r.reason?.message || r.reason);
  }
  if (profileR.status === 'rejected') {
    if (profileR.reason?.code === 'SECTION_TIMEOUT') {
      return jsonFail('Server sibuk, coba lagi.', 503);
    }
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
