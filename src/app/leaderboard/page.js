'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RetryAlert from '@/components/RetryAlert';

const TABS = [
  ['pvp', 'PvP'],
  ['collector', 'Kolektor'],
  ['xp', 'Level/XP'],
];

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
      const lbRes = await fetch(`/api/battle/leaderboard?tab=${encodeURIComponent(t)}`);
      const lbData = await lbRes.json().catch(() => ({}));
      if (lbData.success) setLb(lbData.leaderboard || []);
      else setError(lbData.message || 'Gagal memuat leaderboard.');
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

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
              <div style={{ fontSize: 13 }}>{lb.length === 0 ? 'Belum ada data.' : 'Tidak ada yang cocok.'}</div>
            ) : (
              shown.map((u, i) => (
                <div className="user-row" key={`${u.username}-${i}`}>
                  <span style={{ fontWeight: 700, width: 28 }}>{i + 1}.</span>
                  <span style={{ fontWeight: 700 }}>
                    @{u.username}
                    {u.isMe ? ' (kamu)' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--body)', fontSize: 12 }}>
                    {tab === 'pvp' ? `${u.wins}W - ${u.losses}L | WR ${u.winRate}%` : tab === 'collector' ? `${u.owned} kartu` : `Lv ${u.level} • ${u.xp} XP`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
