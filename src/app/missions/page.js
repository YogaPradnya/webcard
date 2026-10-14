'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function MissionRow({ m, period, claiming, onClaim }) {
  const pct = Math.min(100, Math.round((m.count / Math.max(1, m.target)) * 100));
  return (
    <div className="user-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700 }}>{m.claimed ? '✅' : m.done ? '🎉' : '📌'} {m.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {m.count}/{m.target} • +{m.xp} XP
        </span>
      </div>
      <div className="progress-bar" style={{ width: '100%' }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {m.canClaim ? (
        <button
          type="button"
          className="btn"
          style={{ width: 'auto', minHeight: 0, padding: '6px 16px', fontSize: 12 }}
          disabled={claiming === `${period}:${m.id}`}
          onClick={() => onClaim(period, m.id)}
        >
          {claiming === `${period}:${m.id}` ? '...' : `Klaim +${m.xp} XP`}
        </button>
      ) : m.claimed ? (
        <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 800 }}>Sudah diklaim ✓</div>
      ) : null}
    </div>
  );
}

export default function MissionsPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.success) {
        router.push('/login');
        return;
      }
      setMe(meData);
      const res = await fetch('/api/missions');
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setError(d.message || 'Gagal memuat misi.');
        return;
      }
      setData(d);
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onClaim(period, missionId) {
    setClaiming(`${period}:${missionId}`);
    setError('');
    setToast('');
    try {
      const res = await fetch('/api/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, missionId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        setError(d.message || 'Gagal klaim.');
        return;
      }
      setToast(`+${d.xp} XP masuk! 🎉`);
      await load();
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setClaiming('');
    }
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">
              <div className="skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton-line" style={{ width: '80%' }} />
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
          <div className="brand"><h1>Misi</h1></div>
          {error ? <div className="alert-error">{error}</div> : null}
          {toast ? <div className="trade-fair ok" role="status" style={{ marginBottom: 16 }}>{toast}</div> : null}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Harian (reset 00:00 WIB)</div>
            {(data?.daily || []).map((m) => (
              <MissionRow key={m.id} m={m} period="daily" claiming={claiming} onClaim={onClaim} />
            ))}
          </div>

          <div className="card">
            <div className="section-title">Mingguan (reset Senin 00:00 WIB)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              Battle vs teman = mode PvP (vs AI tidak dihitung).
            </div>
            {(data?.weekly || []).map((m) => (
              <MissionRow key={m.id} m={m} period="weekly" claiming={claiming} onClaim={onClaim} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
