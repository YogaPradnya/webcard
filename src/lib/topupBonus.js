// Bonus Top-Up Bulanan: 3 bar berdasarkan TOTAL nominal Top-Up XP yang berhasil
// dibayar dalam satu bulan kalender WIB (bukan per paket). 5k + 5k tetap
// dihitung 10k. Sumber tunggal milestone, hitung progres, dan klaim.
//
// Progres TIDAK disimpan: dihitung live dari shop_orders (kind='xp' status='paid')
// per periode 'YYYY-MM', jadi reset bulanan tidak butuh cron. Klaim disimpan di
// topup_bonus_claims dengan PK (user_id, period, milestone_id) sebagai mutex.
import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import {
  jakartaMonthKey,
  jakartaMonthLabel,
  jakartaMonthRange,
  jakartaDayOfMonth,
  jakartaDateLabel,
  prevMonthKey,
  nextMonthKey,
} from './jakartaTime.js';

export const TOPUP_BONUS_MILESTONES = [
  {
    id: 'topup_50k',
    amountIdr: 50000,
    rewardLabel: '1 Epic',
    cards: { Epic: 1 },
  },
  {
    id: 'topup_100k',
    amountIdr: 100000,
    rewardLabel: '1 Legendary',
    cards: { Legendary: 1 },
  },
  {
    id: 'topup_500k',
    amountIdr: 500000,
    rewardLabel: '1 Mythic + 2 Legendary',
    cards: { Mythic: 1, Legendary: 2 },
  },
];

// Masa tenggang klaim milestone bulan lalu: tanggal 1 s/d 3 WIB.
export const CLAIM_GRACE_DAYS = 3;

// Order lama yang bonus otomatisnya sudah diberikan sebelum fitur ini live
// (bonus per paket). Milestone pasangannya dianggap sudah diklaim pada periode
// order tersebut, supaya tidak dobel di bulan pertama.
const LEGACY_BONUS_PACKS = {
  'xp-50k': 'topup_50k',
  'xp-100k': 'topup_100k',
  'xp-500k': 'topup_500k',
};

// Kapan order benar-benar lunas. paid_at diisi saat fulfill; order lama yang
// belum punya paid_at memakai updated_at/created_at sebagai fallback.
const PAID_AT_EXPR = 'COALESCE(NULLIF(paid_at, 0), updated_at, created_at)';

async function ensureTopupBonusTablesOn(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS topup_bonus_claims (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      amount_idr INTEGER NOT NULL DEFAULT 0,
      cards_json TEXT NOT NULL DEFAULT '[]',
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, period, milestone_id)
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_topup_claims_user ON topup_bonus_claims (user_id, period)');
}

export async function ensureTopupBonusTables() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi 012 (0 round-trip).
  await ensureTopupBonusTablesOn(getDb());
}

// Timestamp deploy fitur (dari migrasi 012). Dipakai hanya untuk grandfather
// order bonus per paket. 0 = tidak diketahui -> grandfather dilewati.
// Cache hanya nilai positif agar request yang datang sebelum boot tidak
// menyimpan 0 selamanya.
let _launchAt = 0;
async function getLaunchAt(db) {
  if (_launchAt > 0) return _launchAt;
  try {
    const res = await db.execute({
      sql: 'SELECT applied_at FROM schema_version WHERE version = 12',
      args: [],
    });
    const v = Number(res.rows?.[0]?.applied_at) || 0;
    if (v > 0) _launchAt = v;
    return v;
  } catch {
    return 0;
  }
}

function periodTotal(arg) {
  return Object.values(arg?.cards || {}).reduce(
    (sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)),
    0,
  );
}

async function sumPaidTopup(db, userId, period) {
  const { startMs, endMs } = jakartaMonthRange(period);
  const res = await db.execute({
    sql: `SELECT COALESCE(SUM(amount_idr), 0) AS total
          FROM shop_orders
          WHERE user_id = ? AND kind = 'xp' AND status = 'paid'
            AND ${PAID_AT_EXPR} >= ? AND ${PAID_AT_EXPR} < ?`,
    args: [String(userId), startMs, endMs],
  });
  return Number(res.rows?.[0]?.total) || 0;
}

async function getClaimMap(db, userId, periods) {
  const map = new Map();
  const uniq = [...new Set(periods.filter(Boolean).map(String))];
  if (uniq.length === 0) return map;
  const res = await db.execute({
    sql: `SELECT period, milestone_id, cards_json, claimed_at
          FROM topup_bonus_claims
          WHERE user_id = ? AND period IN (${uniq.map(() => '?').join(', ')})`,
    args: [String(userId), ...uniq],
  });
  for (const r of res.rows || []) {
    const period = String(r.period);
    if (!map.has(period)) map.set(period, new Map());
    let cards = [];
    try {
      const parsed = JSON.parse(String(r.cards_json || '[]'));
      cards = Array.isArray(parsed) ? parsed : [];
    } catch {
      cards = [];
    }
    map.get(period).set(String(r.milestone_id), {
      cards,
      claimedAt: Number(r.claimed_at) || 0,
    });
  }
  return map;
}

async function getClaimRow(db, userId, period, milestoneId) {
  const res = await db.execute({
    sql: `SELECT cards_json, claimed_at FROM topup_bonus_claims
          WHERE user_id = ? AND period = ? AND milestone_id = ?`,
    args: [String(userId), String(period), String(milestoneId)],
  });
  if (!res.rows?.length) return null;
  let cards = [];
  try {
    const parsed = JSON.parse(String(res.rows[0].cards_json || '[]'));
    cards = Array.isArray(parsed) ? parsed : [];
  } catch {
    cards = [];
  }
  return { cards, claimedAt: Number(res.rows[0].claimed_at) || 0 };
}

// Milestone yang sudah didapat dari bonus paket lama (sebelum fitur live),
// dihitung hanya untuk order yang dibayar sebelum timestamp migrasi 012.
async function getLegacyClaimed(db, userId, period, launchAt) {
  const claimed = new Set();
  if (!launchAt) return claimed;
  const refs = Object.keys(LEGACY_BONUS_PACKS);
  const { startMs, endMs } = jakartaMonthRange(period);
  const res = await db.execute({
    sql: `SELECT ref FROM shop_orders
          WHERE user_id = ? AND kind = 'xp' AND status = 'paid'
            AND ref IN (${refs.map(() => '?').join(', ')})
            AND ${PAID_AT_EXPR} >= ? AND ${PAID_AT_EXPR} < ? AND ${PAID_AT_EXPR} < ?`,
    args: [String(userId), ...refs, startMs, endMs, launchAt],
  });
  for (const r of res.rows || []) {
    const id = LEGACY_BONUS_PACKS[String(r.ref)];
    if (id) claimed.add(id);
  }
  return claimed;
}

function buildMilestone(m, { period, totalIdr, claim, legacyClaimed }) {
  const claimed = Boolean(claim) || legacyClaimed;
  const reached = totalIdr >= m.amountIdr;
  return {
    id: m.id,
    period,
    amountIdr: m.amountIdr,
    amountLabel: `Rp${m.amountIdr.toLocaleString('id-ID')}`,
    rewardLabel: m.rewardLabel,
    cards: m.cards,
    totalIdr,
    reached,
    claimed,
    legacyClaimed: Boolean(legacyClaimed && !claim),
    canClaim: reached && !claimed,
    progressPct: m.amountIdr > 0 ? Math.min(100, Math.round((totalIdr / m.amountIdr) * 100)) : 0,
    claimedAt: claim?.claimedAt || 0,
    claimedCards: claim?.cards || [],
  };
}

function buildPeriodState(period, totalIdr, claimMap, legacySet) {
  return {
    period,
    periodLabel: jakartaMonthLabel(period),
    totalIdr,
    milestones: TOPUP_BONUS_MILESTONES.map((m) => buildMilestone(m, {
      period,
      totalIdr,
      claim: claimMap?.get(m.id),
      legacyClaimed: legacySet.has(m.id),
    })),
  };
}

// State bonus untuk ditampilkan di Shop: periode berjalan + (bila masih dalam
// masa tenggang) periode sebelumnya yang masih bisa diklaim.
export async function getTopupBonusState(userId, opts = {}) {
  const db = opts.db || getDb();
  if (opts.ensureTables) await ensureTopupBonusTablesOn(db);
  const now = opts.now instanceof Date ? opts.now : (opts.now ? new Date(opts.now) : new Date());
  const launchAt = opts.launchAt !== undefined ? (Number(opts.launchAt) || 0) : await getLaunchAt(db);

  const current = jakartaMonthKey(now);
  const inGrace = jakartaDayOfMonth(now) <= CLAIM_GRACE_DAYS;
  const previous = inGrace ? prevMonthKey(current) : null;
  const periods = previous ? [current, previous] : [current];

  const [claimMap, currentTotal, previousTotal, currentLegacy, previousLegacy] = await Promise.all([
    getClaimMap(db, userId, periods),
    sumPaidTopup(db, userId, current),
    previous ? sumPaidTopup(db, userId, previous) : Promise.resolve(0),
    getLegacyClaimed(db, userId, current, launchAt),
    previous ? getLegacyClaimed(db, userId, previous, launchAt) : Promise.resolve(new Set()),
  ]);

  const currentState = buildPeriodState(current, currentTotal, claimMap.get(current), currentLegacy);

  let grace = null;
  if (previous) {
    const prevState = buildPeriodState(previous, previousTotal, claimMap.get(previous), previousLegacy);
    const canClaimCount = prevState.milestones.filter((m) => m.canClaim).length;
    if (canClaimCount > 0) {
      const { startMs } = jakartaMonthRange(current);
      const graceEndMs = startMs + CLAIM_GRACE_DAYS * 24 * 60 * 60 * 1000;
      grace = {
        ...prevState,
        canClaimCount,
        untilLabel: jakartaDateLabel(graceEndMs - 1),
      };
    }
  }

  return {
    period: current,
    periodLabel: currentState.periodLabel,
    nextPeriodLabel: jakartaMonthLabel(nextMonthKey(current)),
    totalIdr: currentState.totalIdr,
    milestones: currentState.milestones,
    grace,
  };
}

// Klaim 1 milestone. Idempotent: klaim dobel mengembalikan hasil yang sama.
// opts: { db, now, period, launchAt, ensureTables, grant } — grant dipakai tes.
export async function claimTopupBonus(userId, username, milestoneId, opts = {}) {
  const db = opts.db || getDb();
  if (opts.ensureTables) await ensureTopupBonusTablesOn(db);
  const now = opts.now instanceof Date ? opts.now : (opts.now ? new Date(opts.now) : new Date());

  const m = TOPUP_BONUS_MILESTONES.find((x) => x.id === String(milestoneId || ''));
  if (!m) return { ok: false, error: 'Bonus tidak dikenal.' };

  const current = jakartaMonthKey(now);
  let period = current;
  if (opts.period && String(opts.period) !== current) {
    const previous = prevMonthKey(current);
    if (String(opts.period) !== previous || jakartaDayOfMonth(now) > CLAIM_GRACE_DAYS) {
      return { ok: false, error: 'Masa klaim bonus periode itu sudah berakhir.' };
    }
    period = previous;
  }

  const launchAt = opts.launchAt !== undefined ? (Number(opts.launchAt) || 0) : await getLaunchAt(db);
  const [total, legacySet] = await Promise.all([
    sumPaidTopup(db, userId, period),
    getLegacyClaimed(db, userId, period, launchAt),
  ]);

  if (total < m.amountIdr) return { ok: false, error: 'Bar bonus ini belum penuh.' };
  if (legacySet.has(m.id)) {
    return { ok: true, alreadyClaimed: true, legacy: true, period, milestoneId: m.id, cards: [] };
  }

  // Mutex: PK (user, period, milestone). INSERT dulu; yang kalah balapan
  // membaca baris yang sudah ada dan tidak menggandakan kartu.
  const existing = await getClaimRow(db, userId, period, m.id);
  if (existing) {
    return existing.cards.length > 0
      ? { ok: true, alreadyClaimed: true, period, milestoneId: m.id, cards: existing.cards }
      : { ok: true, alreadyClaimed: true, pending: true, period, milestoneId: m.id, cards: [] };
  }

  try {
    await db.execute({
      sql: `INSERT INTO topup_bonus_claims (user_id, period, milestone_id, amount_idr, cards_json, claimed_at)
            VALUES (?, ?, ?, ?, '[]', ?)`,
      args: [String(userId), period, m.id, m.amountIdr, Date.now()],
    });
  } catch (insertError) {
    const race = await getClaimRow(db, userId, period, m.id).catch(() => null);
    if (race) {
      return race.cards.length > 0
        ? { ok: true, alreadyClaimed: true, period, milestoneId: m.id, cards: race.cards }
        : { ok: true, alreadyClaimed: true, pending: true, period, milestoneId: m.id, cards: [] };
    }
    return { ok: false, error: 'Gagal menyimpan klaim.', status: 500, cause: insertError };
  }

  let granted = [];
  try {
    const grant = opts.grant || (await import('./gacha.js')).grantCardBonus;
    const res = await grant(userId, username, m.cards);
    granted = Array.isArray(res?.granted) ? res.granted : [];
    if (granted.length === 0) throw new Error('stok kartu habis');
    const requested = periodTotal(m);
    if (granted.length < requested) {
      console.warn('[TOPUP BONUS] Kartu tidak lengkap:', userId, m.id, `${granted.length}/${requested}`);
    }
  } catch (grantError) {
    // Belum ada efek samping yang dikonfirmasi: lepas baris klaim agar
    // pengguna bisa mencoba lagi (mis. stok sedang kosong).
    await db.execute({
      sql: 'DELETE FROM topup_bonus_claims WHERE user_id = ? AND period = ? AND milestone_id = ?',
      args: [String(userId), period, m.id],
    }).catch(() => {});
    return { ok: false, error: `Gagal memberi kartu bonus: ${String(grantError?.message || grantError)}`, status: 500 };
  }

  await db.execute({
    sql: 'UPDATE topup_bonus_claims SET cards_json = ? WHERE user_id = ? AND period = ? AND milestone_id = ?',
    args: [JSON.stringify(granted), String(userId), period, m.id],
  }).catch((e) => console.warn('[TOPUP BONUS] Gagal simpan kartu klaim:', e.message));

  return { ok: true, period, milestoneId: m.id, cards: granted };
}
