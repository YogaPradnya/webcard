'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import MissionList from '@/components/MissionList';

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
      // Update optimistik tanpa reload penuh.
      const mark = (list) => (list || []).map((m) => (
        m.id === missionId ? { ...m, claimed: true, canClaim: false, done: true, count: m.target } : m
      ));
      setData((prev) => {
        if (!prev) return prev;
        if (period === 'weekly') return { ...prev, weekly: mark(prev.weekly) };
        return { ...prev, daily: mark(prev.daily) };
      });
      // Sinkron ringan di background.
      try {
        const mRes = await fetch('/api/missions');
        const mData = await mRes.json().catch(() => ({}));
        if (mRes.ok && mData.success) setData(mData);
      } catch { /* abaikan */ }
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setClaiming('');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Misi Mingguan" />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Misi Mingguan</h1></div>
          <ErrorRetry message={error} onRetry={load} />
          {toast ? <div className="trade-fair ok" role="status" style={{ marginBottom: 16 }}>{toast}</div> : null}

          <div className="card">
            <div className="section-title">Mingguan (reset Senin 00:00 WIB)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              Battle vs teman = mode PvP (vs AI tidak dihitung). Misi harian ada di{' '}
              <a href="/profile" style={{ color: 'var(--link)', fontWeight: 800 }}>Profil</a>.
            </div>
            <MissionList items={data?.weekly || []} period="weekly" claiming={claiming} onClaim={onClaim} />
          </div>
        </div>
      </div>
    </div>
  );
}
