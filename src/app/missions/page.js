'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import MissionList from '@/components/MissionList';
import { fetchJson, fetchLenient } from '@/lib/fetchJson';
import { postJson } from '@/lib/postJson';
import { useMe } from '@/hooks/useMe';

export default function MissionsPage() {
  const { me, loading: meLoading } = useMe();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    try {
      const { ok, data: d } = await fetchJson('/api/missions');
      if (!ok || !d.success) {
        setError(d.message || 'Gagal memuat misi.');
        return;
      }
      setData(d);
    } catch (e) {
      setError(e?.name === 'AbortError' ? 'Server lambat (timeout). Coba lagi.' : 'Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (meLoading) return;
    if (!me) return; // useMe sudah tendang ke /login
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading]);

  // Sinkronkan state saat tab aktif lagi, supaya tombol klaim tidak basi.
  useEffect(() => {
    if (!me) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function onClaim(period, missionId) {
    setClaiming(`${period}:${missionId}`);
    setError('');
    setToast('');
    const mark = (list) => (list || []).map((m) => (
      m.id === missionId ? { ...m, claimed: true, canClaim: false, done: true, count: m.target } : m
    ));
    try {
      const { ok, data: d } = await postJson('/api/missions/claim', { period, missionId });
      const alreadyClaimed = Boolean(d?.alreadyClaimed)
        || (!ok && /sudah diklaim/i.test(String(d?.message || '')));
      if (!ok || !d.success) {
        if (alreadyClaimed) {
          setData((prev) => {
            if (!prev) return prev;
            if (period === 'weekly') return { ...prev, weekly: mark(prev.weekly) };
            return { ...prev, daily: mark(prev.daily) };
          });
          setToast('Misi ini sudah diklaim. XP-nya sudah masuk sebelumnya.');
          await load();
          return;
        }
        setError(d.message || 'Gagal klaim.');
        await load();
        return;
      }
      setToast(d.alreadyClaimed
        ? 'Misi ini sudah diklaim. XP-nya sudah masuk sebelumnya.'
        : `+${d.xp} XP masuk! 🎉`);
      // Update optimistik tanpa reload penuh.
      setData((prev) => {
        if (!prev) return prev;
        if (period === 'weekly') return { ...prev, weekly: mark(prev.weekly) };
        return { ...prev, daily: mark(prev.daily) };
      });
      // Sinkron ringan di background.
      try {
        const mData = await fetchLenient('/api/missions');
        if (mData.success) setData(mData);
      } catch { /* abaikan */ }
    } catch {
      setError('Tidak bisa menghubungi server.');
      await load();
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
