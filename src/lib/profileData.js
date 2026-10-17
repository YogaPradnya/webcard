import { getDb } from './db';
import { getBookCards } from './cards';
import { getDisplayCards } from './display';
import { computeTitles, ensureWebTitleColumn, allWebTitles } from './titles';
import { calcLevel } from './level';

// Satu implementasi ringkasan profil — dipakai /api/profile (profil saja)
// dan /api/profile/summary (profil + data halaman dalam 1 request).

function xpForLevel(lv) {
  return Math.floor(20 * Math.pow(lv, 3));
}

export async function buildProfileData(session) {
  const db = getDb();
  await ensureWebTitleColumn();
  const [book, statsRes, lbRes, displayData] = await Promise.all([
    getBookCards(session.id),
    db.execute({ sql: 'SELECT username, xp, level, custom_title, web_title FROM user_stats WHERE user_id = ?', args: [String(session.id)] }),
    db.execute({ sql: 'SELECT wins, losses FROM battle_leaderboard WHERE user_id = ?', args: [String(session.id)] }),
    getDisplayCards(session.id).catch(() => ({ cards: [], total: 0 })),
  ]);
  const row = statsRes.rows[0] || {};
  // Migrasi satu kali: bila custom_title berisi gelar WEB (dari versi lama),
  // pindahkan ke web_title dan kosongkan custom_title agar .profil bot bersih.
  let webTitle = row.web_title ? String(row.web_title) : null;
  if (!webTitle && row.custom_title && allWebTitles().includes(String(row.custom_title))) {
    webTitle = String(row.custom_title);
    try {
      await db.execute({ sql: 'UPDATE user_stats SET web_title = ?, custom_title = NULL WHERE user_id = ?', args: [webTitle, String(session.id)] });
    } catch { /* non-kritis */ }
  }
  const username = String(row.username || session.username || '');
  const xp = Number(row.xp) || 0;
  const level = Number(row.level) || calcLevel(xp);
  const nextNeed = xpForLevel(level);
  const prevNeed = level > 1 ? xpForLevel(level - 1) : 0;
  const intoLevel = Math.max(0, xp - prevNeed);
  const span = Math.max(1, nextNeed - prevNeed);
  const sisa = Math.max(0, nextNeed - xp);

  const ownedMap = {};
  for (const c of book.cards) if (c.owned) ownedMap[String(c.name).toLowerCase()] = true;
  const pool = book.cards.map((c) => ({ name: c.name, tier: c.tier }));
  const titles = computeTitles(pool, ownedMap);

  const showcase = book.cards.find((c) => c.showcase && c.owned) || null;
  const displayShowcase = (displayData.cards || []).find((c) => c.showcase) || null;
  const wins = lbRes.rows.length > 0 ? Number(lbRes.rows[0].wins) || 0 : 0;
  const losses = lbRes.rows.length > 0 ? Number(lbRes.rows[0].losses) || 0 : 0;
  const battles = wins + losses;

  const perTier = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'].map((t) => ({
    tier: t,
    owned: (titles.ownedByTier[t] || 0),
    total: (titles.totalByTier[t] || 0),
  }));

  return {
    id: String(session.id),
    username,
    title: webTitle,
    xp,
    level,
    xpInto: intoLevel,
    xpSpan: span,
    xpSisa: sisa,
    xpNext: nextNeed,
    owned: book.ownedCount,
    total: book.total,
    perTier,
    wins,
    losses,
    battles,
    winRate: battles > 0 ? Math.round((wins / battles) * 100) : 0,
    showcase: showcase ? { name: showcase.name, anime: showcase.anime, tier: showcase.tier, imageUrl: showcase.imageUrl, level: showcase.level, power: showcase.power } : null,
    displayShowcase: displayShowcase ? {
      name: displayShowcase.name,
      grade: displayShowcase.grade,
      borderType: displayShowcase.borderType,
      borderColor: displayShowcase.borderColor,
      imageUrl: displayShowcase.imageUrl,
      description: displayShowcase.description,
    } : null,
    displayCount: displayData.total || 0,
    titles,
  };
}

// Kartu milik user untuk picker pajangan (nama/tier/level saja, payload ringkas).
export function profileOwnedCards(book) {
  return book.cards.filter((c) => c.owned).map((c) => ({ name: c.name, tier: c.tier, level: c.level }));
}
