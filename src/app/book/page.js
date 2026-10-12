'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ConfirmModal from '@/components/ConfirmModal';
import RetryAlert from '@/components/RetryAlert';

const TIERS = ['All', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];
const PAGE_SIZE = 24;

const TIER_COLORS = {
  Mythic: '#ef4444',
  Legendary: '#eab308',
  Epic: '#a855f7',
  Rare: '#3b82f6',
  Common: '#9ca3af',
};

const DISPLAY_BORDER_FALLBACK = {
  gold: '#eab308',
  rainbow: '#a855f7',
  neon: '#22d3ee',
  sakura: '#f9a8d4',
  shadow: '#111827',
  classic: '#9ca3af',
};

const DISPLAY_RAINBOW_GRADIENT = 'linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6,#a855f7)';

function displayBorderColor(c) {
  if (!c) return '#9ca3af';
  if (c.borderType === 'custom' && c.borderColor) return c.borderColor;
  return DISPLAY_BORDER_FALLBACK[c.borderType] || '#9ca3af';
}

function displayCardStyle(c) {
  const isRainbow = c && c.borderType === 'rainbow';
  if (isRainbow) {
    return {
      border: '3px solid transparent',
      background: `linear-gradient(var(--surface), var(--surface)) padding-box, ${DISPLAY_RAINBOW_GRADIENT} border-box`,
      boxShadow: '0 2px 14px #a855f755',
    };
  }
  const color = displayBorderColor(c);
  return {
    borderColor: color,
    boxShadow: `0 2px 14px ${color}55`,
  };
}

function shortName(name) {
  const s = String(name || '');
  return s.length > 20 ? s.slice(0, 20) + '...' : s;
}

const EFFECT_LABELS = {
  none: '-',
  heavy: 'Heavy',
  crit: 'Crit',
  burn: 'Burn',
  double: 'Double',
  shield: 'Shield',
  slam: 'Stun',
  bulwark: 'Shield+',
  heal: 'Heal',
  regen: 'Regen',
  energize: 'Heal+Cons',
  surge: 'Cons+',
  weaken: 'Weaken',
  focus: 'Fokus',
};

const SORTS = [
  ['tier', 'Tier'],
  ['name', 'Nama A-Z'],
  ['power', 'Power tertinggi'],
  ['level', 'Level tertinggi'],
];

export default function BookPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [ownedCount, setOwnedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tier, setTier] = useState('All');
  const [query, setQuery] = useState('');
  const [ownedFilter, setOwnedFilter] = useState('all');
  const [animeFilter, setAnimeFilter] = useState('All');
  const [sort, setSort] = useState('tier');
  const [page, setPage] = useState(1);
  const [flipped, setFlipped] = useState(null);
  const [showcaseBusy, setShowcaseBusy] = useState('');
  const [evoTarget, setEvoTarget] = useState(null);
  const [tab, setTab] = useState('book');
  const [displayCards, setDisplayCards] = useState([]);
  const [displayFlipped, setDisplayFlipped] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.success) {
        router.push('/login');
        return;
      }
      setMe(meData);

      const cardsRes = await fetch('/api/cards');
      const cardsData = await cardsRes.json().catch(() => ({}));
      if (!cardsRes.ok || !cardsData.success) {
        if (cardsRes.status === 401) {
          router.push('/login');
          return;
        }
        setError(cardsData.message || 'Gagal memuat kartu.');
        return;
      }
      setCards(cardsData.cards || []);
      setTotal(cardsData.total || 0);
      setOwnedCount(cardsData.ownedCount || 0);

      // Kartu pajangan (display-only): koleksi terpisah, tidak masuk book gacha.
      try {
        const dispRes = await fetch('/api/display');
        const dispData = await dispRes.json().catch(() => ({}));
        if (dispRes.ok && dispData.success) setDisplayCards(dispData.cards || []);
      } catch {
        // non-kritis: book gacha tetap tampil
      }
    } catch {
      setError('Tidak bisa menghubungi server. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tier, query, ownedFilter, animeFilter, sort]);

  const animeList = useMemo(() => {
    const s = new Set(cards.map((c) => c.anime).filter(Boolean));
    return ['All', ...[...s].sort()];
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = cards.filter((c) => {
      if (tier !== 'All' && c.tier !== tier) return false;
      if (animeFilter !== 'All' && c.anime !== animeFilter) return false;
      if (ownedFilter === 'owned' && !c.owned) return false;
      if (ownedFilter === 'missing' && c.owned) return false;
      if (q && !`${c.name} ${c.anime}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      tier: (a, b) => {
        const order = { Mythic: 4, Legendary: 3, Epic: 2, Rare: 1, Common: 0 };
        return (order[b.tier] ?? 0) - (order[a.tier] ?? 0) || a.name.localeCompare(b.name);
      },
      name: (a, b) => a.name.localeCompare(b.name),
      power: (a, b) => (b.power || 0) - (a.power || 0),
      level: (a, b) => (b.level || 0) - (a.level || 0),
    }[sort] || ((a, b) => 0);
    return [...out].sort(by);
  }, [cards, tier, query, ownedFilter, animeFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function evolveCard(c) {
    if (!c.owned || showcaseBusy) return;
    setShowcaseBusy(`evo:${c.name}`);
    setError('');
    try {
      const res = await fetch('/api/cards/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charName: c.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal evolusi.');
        return;
      }
      setCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, level: data.level, power: data.power, quantity: data.quantity }
        : x));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
      setEvoTarget(null);
    }
  }

  async function toggleShowcase(c) {
    if (!c.owned || showcaseBusy) return;
    setShowcaseBusy(c.name);
    setError('');
    try {
      const res = await fetch('/api/cards/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charName: c.name, showcase: !c.showcase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal atur pajangan.');
        return;
      }
      setCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, showcase: !c.showcase }
        : (!c.showcase ? { ...x, showcase: false } : x)));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
    }
  }

  async function toggleDisplayShowcase(c) {
    if (showcaseBusy) return;
    setShowcaseBusy(`display:${c.name}`);
    setError('');
    try {
      const res = await fetch('/api/display/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.name, showcase: !c.showcase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal atur pajangan.');
        return;
      }
      setDisplayCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, showcase: !c.showcase }
        : (!c.showcase ? { ...x, showcase: false } : x)));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
    }
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="brand"><h1>Book Kartu</h1></div>
            <div className="card">
              <div className="skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton-line" style={{ width: '90%' }} />
              <div className="book-grid" style={{ marginTop: 16 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton-card" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Book Kartu</h1>
          </div>

          {error ? (
            <RetryAlert message={error} onRetry={load} />
          ) : null}

          <div className="chip-row" role="tablist" aria-label="Tab koleksi">
            <button
              className={tab === 'book' ? 'chip active' : 'chip'}
              onClick={() => setTab('book')}
              aria-pressed={tab === 'book'}
            >
              Gacha ({ownedCount}/{total})
            </button>
            <button
              className={tab === 'display' ? 'chip active' : 'chip'}
              onClick={() => setTab('display')}
              aria-pressed={tab === 'display'}
            >
              Pajangan 🎁 ({displayCards.length})
            </button>
          </div>

          {tab === 'display' ? (
            <div>
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {displayCards.length} kartu pajangan (display-only, gift admin)
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Tidak bisa battle/trade/gacha/convert. Ketuk kartu untuk balik (deskripsi).
                </div>
              </div>
              {displayCards.length === 0 ? (
                <div className="card" style={{ marginTop: 16 }}>
                  Belum ada kartu pajangan. Kartu spesial hanya bisa di-gift admin dari dashboard.
                </div>
              ) : (
                <div className="book-grid" style={{ marginTop: 16 }}>
                  {displayCards.map((c) => (
                    <div
                      key={c.id || c.name}
                      className={displayFlipped === c.name ? 'card-item owned flipped' : 'card-item owned'}
                      style={displayCardStyle(c)}
                      title={`${c.name} (ketuk untuk flip)`}
                      onClick={() => setDisplayFlipped((f) => (f === c.name ? null : c.name))}
                    >
                      <div className="flip-inner">
                        <div className="flip-front">
                          {c.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" decoding="async" />
                          ) : (
                            <div className="card-art" />
                          )}
                          <div className="card-meta">
                            <div className="card-name">{shortName(c.name)}</div>
                            <div className="card-anime">🎁 {c.grade}</div>
                            <div className="card-stats">
                              {c.showcase ? <span className="stat-tag showcase">Pajangan</span> : null}
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                              disabled={showcaseBusy === `display:${c.name}`}
                              onClick={(e) => { e.stopPropagation(); toggleDisplayShowcase(c); }}
                            >
                              {showcaseBusy === `display:${c.name}` ? '...' : c.showcase ? 'Lepas Pajangan' : 'Jadikan Pajangan'}
                            </button>
                          </div>
                        </div>
                        <div className="flip-back" style={{ borderTop: `3px solid ${displayBorderColor(c)}` }}>
                          <span className="flip-role">{c.grade}</span>
                          <div className="flip-stat" style={{ whiteSpace: 'pre-wrap' }}>
                            {c.description}
                          </div>
                          <div className="flip-stat" style={{ color: 'var(--muted)' }}>
                            Display-only
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <>
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {ownedCount}/{total} kartu terkumpul
        </div>
        <div className="progress-wrap">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: total ? `${Math.round((ownedCount / total) * 100)}%` : '0%' }}
            />
          </div>
        </div>

        <div className="book-toolbar">
          <input
            className="input"
            placeholder="Cari kartu / anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari kartu"
          />
        </div>
        <div className="book-filters">
          <select className="select" value={animeFilter} onChange={(e) => setAnimeFilter(e.target.value)} aria-label="Filter anime" style={{ maxWidth: 220 }}>
            {animeList.map((a) => (
              <option key={a} value={a}>{a === 'All' ? 'Semua anime' : a}</option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan" style={{ maxWidth: 200 }}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="chip-row" role="tablist" aria-label="Filter tier">
          {TIERS.map((t) => (
            <button
              key={t}
              className={tier === t ? 'chip active' : 'chip'}
              onClick={() => setTier(t)}
              aria-pressed={tier === t}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {[
            ['all', 'Semua'],
            ['owned', 'Punya'],
            ['missing', 'Belum punya'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={ownedFilter === value ? 'chip active' : 'chip'}
              onClick={() => setOwnedFilter(value)}
              aria-pressed={ownedFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          {filtered.length} hasil • hal {page}/{totalPages}
        </div>
      </div>

      <div className="book-grid" style={{ marginTop: 16 }}>
        {pageItems.map((c) => (
          <div
            key={c.name}
            className={
              c.owned
                ? flipped === c.name
                  ? 'card-item owned flipped'
                  : 'card-item owned'
                : 'card-item locked'
            }
            style={
              c.owned
                ? {
                    borderColor: TIER_COLORS[c.tier],
                    boxShadow: `0 2px 14px ${TIER_COLORS[c.tier]}55`,
                  }
                : undefined
            }
            title={c.owned ? `${c.name} (ketuk untuk stat)` : c.name}
            onClick={() => {
              if (!c.owned) return;
              setFlipped((f) => (f === c.name ? null : c.name));
            }}
          >
            <div className="flip-inner">
              <div className="flip-front">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" decoding="async" />
                ) : (
                  <div className="card-art" />
                )}
                <div className="card-meta">
                  <div className="card-name">{shortName(c.name)}</div>
                  <div className="card-anime">{c.anime} • {c.tier}</div>
                  {c.owned ? (
                    <div className="card-stats">
                      <span className="stat-tag">★{c.level}</span>
                      <span className="stat-tag power">PWR {c.power}</span>
                      {c.quantity > 1 ? <span className="stat-tag power">x{c.quantity}</span> : null}
                      {c.showcase ? <span className="stat-tag showcase">Pajangan</span> : null}
                    </div>
                  ) : null}
                  {c.owned && (c.level >= 4 ? c.quantity >= 5 : c.quantity >= 3) && c.level < 5 && c.tier !== 'Legendary' && c.tier !== 'Mythic' ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                      disabled={showcaseBusy === `evo:${c.name}`}
                      onClick={(e) => { e.stopPropagation(); setEvoTarget(c); }}
                    >
                      {showcaseBusy === `evo:${c.name}` ? '...' : `Evolusi ★${c.level + 1} (${c.level >= 4 ? '5' : '3'}→1)`}
                    </button>
                  ) : null}
                  {c.owned ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                      disabled={showcaseBusy === c.name}
                      onClick={(e) => { e.stopPropagation(); toggleShowcase(c); }}
                    >
                      {showcaseBusy === c.name ? '...' : c.showcase ? 'Lepas Pajangan' : 'Jadikan Pajangan'}
                    </button>
                  ) : null}
                </div>
              </div>
              {c.owned && c.stats ? (
                <div className="flip-back" style={{ borderTop: `3px solid ${TIER_COLORS[c.tier]}` }}>
                  <span className="flip-role">{c.stats.role}</span>
                  <div className="flip-stat">
                    HP <b>{c.stats.hp}</b>
                  </div>
                  <div className="flip-stat">
                    ATK <b>{c.stats.basic}</b>
                  </div>
                  <div className="flip-stat">{c.stats.skillName}</div>
                  <div className="flip-stat">
                    Skill <b>{c.stats.skill}</b> / Cons <b>{c.stats.cons}</b>
                  </div>
                  <div className="flip-stat">
                    Efek <b>{EFFECT_LABELS[c.stats.effect] || c.stats.effect}</b>
                  </div>
                  {c.stats.skill2Name ? (
                    <>
                      <div className="flip-stat">{c.stats.skill2Name} ★5</div>
                      <div className="flip-stat">
                        Skill2 <b>{c.stats.skill2}</b> / Cons <b>{c.stats.cons2}</b>
                      </div>
                      <div className="flip-stat">
                        Efek <b>{EFFECT_LABELS[c.stats.effect2] || c.stats.effect2}</b>
                      </div>
                    </>
                  ) : null}
                  <div className="flip-stat" style={{ color: 'var(--muted)' }}>
                    {c.tier}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'center' }}>
          <button className="btn btn-ghost" style={{ width: 'auto' }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Sebelumnya
          </button>
          <span style={{ fontSize: 12 }}>{page}/{totalPages}</span>
          <button className="btn btn-ghost" style={{ width: 'auto' }} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Berikutnya
          </button>
        </div>
      ) : null}

      {filtered.length === 0 && !error ? (
        <div className="card" style={{ marginTop: 20 }}>
          Tidak ada kartu yang cocok.
        </div>
      ) : null}
          {evoTarget ? (
            <ConfirmModal
              title="Evolusi kartu?"
              message={`${evoTarget.name} ★${evoTarget.level} → ★${evoTarget.level + 1}. ${evoTarget.level >= 4 ? 4 : 2} copy dipakai (sisa ${evoTarget.quantity - (evoTarget.level >= 4 ? 4 : 2)}).${evoTarget.level + 1 >= 5 ? ' Skill ke-2 terbuka!' : ''}`}
              confirmLabel="Evolusi"
              busy={showcaseBusy === `evo:${evoTarget.name}`}
              onCancel={() => setEvoTarget(null)}
              onConfirm={() => evolveCard(evoTarget)}
            />
          ) : null}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
