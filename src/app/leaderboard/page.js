'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RetryAlert from '@/components/RetryAlert';
import Rara from '@/components/Rara';
import { fetchJson } from '@/lib/fetchJson';

const TABS = [
  ['pvp', 'PvP'],
  ['collector', 'Kolektor'],
  ['xp', 'Level/XP'],
];

const LB_CONFETTI = ['#a3e636', '#ffd94a', '#ffb7d5', '#7fb0ec'];

function initials(name) {
  const clean = String(name || '?').trim().replace(/^@/, '');
  return Array.from(clean).slice(0, 2).join('').toUpperCase() || '?';
}

function podiumMain(u, tab) {
  if (tab === 'pvp') return `WR ${Number(u.winRate) || 0}%`;
  if (tab === 'collector') return `${Number(u.owned) || 0} kartu`;
  return `Lv ${Number(u.level) || 1}`;
}

function podiumSub(u, tab) {
  if (tab === 'pvp') return `${Number(u.wins) || 0}W · ${Number(u.losses) || 0}L`;
  if (tab === 'collector') return 'total koleksi';
  return `${Number(u.xp) || 0} XP`;
}

function rowScore(u, tab) {
  if (tab === 'pvp') return `${u.wins}W - ${u.losses}L | WR ${u.winRate}%`;
  if (tab === 'collector') return `${u.owned} kartu`;
  return `Lv ${u.level} • ${u.xp} XP`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('pvp');
  const [lb, setLb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const celebratedTabsRef = useRef(new Set());

  const isSearching = Boolean(q.trim());
  const shown = isSearching
    ? lb.filter((u) => String(u.username || '').toLowerCase().includes(q.trim().toLowerCase()))
    : lb;
  const podium = isSearching ? [] : shown.slice(0, 3);
  const rest = isSearching ? shown : shown.slice(3);

  async function load(t = tab) {
    setLoading(true);
    setError('');
    try {
      const { data: lbData } = await fetchJson(`/api/battle/leaderboard?tab=${encodeURIComponent(t)}`);
      if (lbData.success) setLb(lbData.leaderboard || []);
      else setError(lbData.message || 'Gagal memuat leaderboard.');
    } catch (e) {
      setError(e?.name === 'AbortError' ? 'Server lambat (timeout). Coba lagi.' : 'Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const { ok: meOk, data: meData } = await fetchJson('/api/auth/me');
        if (!meOk || !meData.success) {
          router.push('/login');
          return;
        }
        setMe(meData);
      } finally {
        // loading akan dimulai oleh effect tab setelah sesi siap.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (me) load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me]);

  // Sparkle podium sekali per tab. Sengaja kecil dan tidak menghalangi UI.
  useEffect(() => {
    if (loading || !shown.length || isSearching) return;
    if (celebratedTabsRef.current.has(tab)) return;
    celebratedTabsRef.current.add(tab);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    import('canvas-confetti')
      .then(({ default: fireConfetti }) => {
        if (cancelled) return;
        fireConfetti({
          particleCount: 46,
          spread: 95,
          startVelocity: 28,
          origin: { x: 0.5, y: 0.24 },
          colors: LB_CONFETTI,
          scalar: 0.9,
          ticks: 150,
          zIndex: 40,
        });
      })
      .catch(() => { /* dekorasi opsional */ });
    return () => { cancelled = true; };
  }, [loading, shown.length, isSearching, tab]);

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Leaderboard</h1>
          </div>
          {error ? (
            <RetryAlert message={error} onRetry={() => load()} />
          ) : null}
          <div className="card">
            <div className="chip-row" style={{ marginBottom: 16 }} role="tablist" aria-label="Tab leaderboard">
              {TABS.map(([v, l]) => (
                <button
                  key={v}
                  className={tab === v ? 'chip active' : 'chip'}
                  onClick={() => setTab(v)}
                  aria-pressed={tab === v}
                  role="tab"
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="section-title">
              {tab === 'pvp' ? 'PvP vs teman (menang - kalah)' : tab === 'collector' ? 'Kolektor terbanyak' : 'Level / XP tertinggi'}
            </div>
            <div className="book-toolbar">
              <input
                className="input"
                placeholder="Cari username..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Cari username"
              />
            </div>
            {loading ? (
              <div>
                <div className="skeleton-line" style={{ width: '70%' }} />
                <div className="skeleton-line" style={{ width: '55%' }} />
                <div className="skeleton-line" style={{ width: '65%' }} />
              </div>
            ) : shown.length === 0 ? (
              <div className="empty-state">
                {lb.length === 0 ? (
                  <>
                    <Rara size={96} className="rara-bob" />
                    <div style={{ fontSize: 13 }}>Belum ada data.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 13 }}>Tidak ada yang cocok.</div>
                )}
              </div>
            ) : (
              <>
                {!isSearching ? (
                  <div className="podium-stage" role="list" aria-label="Podium tiga besar">
                    {[2, 1, 3].map((place) => {
                      const u = podium[place - 1];
                      if (!u) return <div key={`empty-${place}`} className="podium-entry is-empty" aria-hidden="true" />;
                      return (
                        <div
                          key={`${u.username}-${place}`}
                          className={`podium-entry place-${place}${u.isMe ? ' is-me' : ''}`}
                          role="listitem"
                          title={`Peringkat ${place}: @${u.username}`}
                        >
                          <div className="podium-person">
                            {place === 1 ? <span className="podium-crown" aria-hidden="true">👑</span> : null}
                            <span className="podium-avatar" aria-hidden="true">{initials(u.username)}</span>
                            <span className="podium-name">@{u.username}</span>
                            {u.isMe ? <span className="podium-me">KAMU</span> : null}
                            <span className="podium-score">{podiumMain(u, tab)}</span>
                            <span className="podium-sub">{podiumSub(u, tab)}</span>
                          </div>
                          <div className="podium-base" aria-hidden="true"><span>{place}</span></div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {rest.length > 0 ? (
                  <div className="lb-list">
                    {rest.map((u, i) => {
                      const rank = isSearching ? i + 1 : i + 4;
                      return (
                        <div className={`lb-row${u.isMe ? ' is-me' : ''}`} key={`${u.username}-${rank}`}>
                          <span className="lb-rank">{rank}</span>
                          <span className="lb-name">
                            @{u.username}
                            {u.isMe ? ' (kamu)' : ''}
                          </span>
                          <span className="lb-score">{rowScore(u, tab)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
