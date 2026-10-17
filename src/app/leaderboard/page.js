'use client';

import { useEffect, useState } from 'react';
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

export default function LeaderboardPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('pvp');
  const [lb, setLb] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const shown = q.trim()
    ? lb.filter((u) => String(u.username || '').toLowerCase().includes(q.trim().toLowerCase()))
    : lb;

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
        await load('pvp');
      } finally {
        // loading diatur di load()
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (me) load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
              shown.map((u, i) => (
                <div className={`user-row${i < 3 ? ` lb-${i + 1}` : ''}`} key={`${u.username}-${i}`}>
                  {i < 3 ? (
                    <span className={`lb-medal m${i + 1}`} aria-hidden="true">{i + 1}</span>
                  ) : (
                    <span style={{ fontWeight: 700, width: 28 }}>{i + 1}.</span>
                  )}
                  <span style={{ fontWeight: 700 }}>
                    @{u.username}
                    {u.isMe ? ' (kamu)' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--body)', fontSize: 12 }}>
                    {tab === 'pvp' ? `${u.wins}W - ${u.losses}L | WR ${u.winRate}%` : tab === 'collector' ? `${u.owned} kartu` : `Lv ${u.level} • ${u.xp} XP`}
                  </span>
                  {i === 0 && !q.trim() ? (
                    <span className="lb-confetti" aria-hidden="true">
                      {Array.from({ length: 8 }).map((_, ci) => (
                        <i
                          key={ci}
                          style={{
                            left: `${6 + ci * 12}%`,
                            background: LB_CONFETTI[ci % LB_CONFETTI.length],
                            animationDelay: `${ci * 130}ms`,
                          }}
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
