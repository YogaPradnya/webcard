'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

// Leaderboard khusus PvP (vs teman). Vs AI tidak tercatat.
export default function LeaderboardPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [lb, setLb] = useState([]);
  const [loading, setLoading] = useState(true);

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
        const lbRes = await fetch('/api/battle/leaderboard');
        const lbData = await lbRes.json().catch(() => ({}));
        if (lbData.success) setLb(lbData.leaderboard || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Leaderboard Battle</h1>
          </div>
          <div className="card">
            <div className="section-title">PvP vs teman (menang - kalah)</div>
            {loading ? (
              <div style={{ fontSize: 13 }}>Memuat...</div>
            ) : lb.length === 0 ? (
              <div style={{ fontSize: 13 }}>Belum ada battle PvP.</div>
            ) : (
              lb.map((u, i) => (
                <div className="user-row" key={u.username}>
                  <span style={{ fontWeight: 700, width: 28 }}>{i + 1}.</span>
                  <span style={{ fontWeight: 700 }}>
                    @{u.username}
                    {u.isMe ? ' (kamu)' : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--body)', fontSize: 12 }}>
                    {u.wins}M - {u.losses}K ({u.winRate}%)
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
