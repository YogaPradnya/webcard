'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const TIERS = ['All', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];

const TIER_COLORS = {
  Mythic: '#ef4444',
  Legendary: '#eab308',
  Epic: '#a855f7',
  Rare: '#3b82f6',
  Common: '#9ca3af',
};

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
  const [flipped, setFlipped] = useState(null);

  useEffect(() => {
    (async () => {
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
      } catch {
        setError('Tidak bisa menghubungi server. Coba lagi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (tier !== 'All' && c.tier !== tier) return false;
      if (ownedFilter === 'owned' && !c.owned) return false;
      if (ownedFilter === 'missing' && c.owned) return false;
      if (q && !`${c.name} ${c.anime}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, tier, query, ownedFilter]);

  const grouped = useMemo(() => {
    const order = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];
    return order
      .map((t) => ({ tier: t, items: filtered.filter((c) => c.tier === t) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">Memuat book...</div>
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

          {error ? <div className="alert-error">{error}</div> : null}

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
          />
        </div>
        <div className="chip-row">
          {TIERS.map((t) => (
            <button
              key={t}
              className={tier === t ? 'chip active' : 'chip'}
              onClick={() => setTier(t)}
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
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {grouped.map((g) => (
        <div key={g.tier}>
          <div className="tier-title">
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: TIER_COLORS[g.tier],
              }}
            />
            {g.tier}
            <span className="tier-count">
              {g.items.filter((c) => c.owned).length}/{g.items.length}
            </span>
          </div>
          <div className="book-grid">
            {g.items.map((c) => (
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
                      <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" />
                    ) : (
                      <div className="card-art" />
                    )}
                    <div className="card-meta">
                      <div className="card-name">{shortName(c.name)}</div>
                      <div className="card-anime">{c.anime}</div>
                      {c.owned ? (
                        <div className="card-stats">
                          <span className="stat-tag">★{c.level}</span>
                          <span className="stat-tag power">PWR {c.power}</span>
                          {c.showcase ? <span className="stat-tag showcase">Pajangan</span> : null}
                        </div>
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
                      <div className="flip-stat" style={{ color: 'var(--muted)' }}>
                        {c.tier}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !error ? (
        <div className="card" style={{ marginTop: 20 }}>
          Tidak ada kartu yang cocok.
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
