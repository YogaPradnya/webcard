'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { FrameDefs, FrameOverlay } from '@/components/Frames';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import { optImg } from '@/lib/images';
import { fetchJson } from '@/lib/fetchJson';
import { postJson } from '@/lib/postJson';
import { useMe } from '@/hooks/useMe';
import { TIER_COLORS } from '@/lib/tiers';

const REVEAL_MS_BY_RARITY = {
  Common: 400,
  Rare: 600,
  Epic: 900,
  Legendary: 1500,
  Mythic: 2200,
};

function revealMsFor(pull) {
  return REVEAL_MS_BY_RARITY[pull?.rarity] || 900;
}

function RevealCard({ pull, face }) {
  const color = TIER_COLORS[pull.rarity] || '#9ca3af';
  if (face === 'back') {
    return (
      <div className="gacha-card spinning" style={{ borderColor: color, boxShadow: '3px 3px 0 #0a0a0a' }}>
        <div className="gacha-back" style={{ background: color }}>
          <span>?</span>
        </div>
      </div>
    );
  }
  return (
    <div className="gacha-card revealed" style={{ borderColor: color, boxShadow: '3px 3px 0 #0a0a0a' }}>
      {pull.isNew ? <span className="gacha-new">BARU</span> : <span className="gacha-dupe">+1 stack</span>}
      <div className="framed-art">
        {pull.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optImg(pull.imageUrl, 400)} alt={pull.charName} decoding="async" />
        ) : (
          <div className="framed-blank gacha-noart"><span>?</span></div>
        )}
        <FrameOverlay tier={pull.rarity} />
      </div>
      <div className="card-meta">
        <div className="card-name">{pull.charName}</div>
        <div className="card-anime">{pull.anime} • {pull.rarity}</div>
        {pull.downgraded ? <div className="card-anime">turun tier (stok habis)</div> : null}
      </div>
    </div>
  );
}

export default function GachaPage() {
  const { me } = useMe();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pulls, setPulls] = useState([]);
  const [turn, setTurn] = useState(0); // index kartu yang sedang di-reveal
  const [face, setFace] = useState('back'); // 'back' (spin) | 'front' (terbuka)
  const [finished, setFinished] = useState(false);
  const [instant, setInstant] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      return localStorage.getItem('gacha_instant') === '1';
    } catch { return false; }
  });
  const timers = useRef([]);

  function toggleInstant() {
    setInstant((v) => {
      const next = !v;
      try { localStorage.setItem('gacha_instant', next ? '1' : '0'); } catch { /* abaikan */ }
      return next;
    });
  }

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  async function load() {
    setError('');
    try {
      if (!me) return; // useMe menendang ke /login bila belum login
      const { ok, data } = await fetchJson('/api/gacha');
      if (!ok || !data.success) {
        setError(data.message || 'Gagal memuat gacha.');
        return;
      }
      setInfo(data);
    } catch (e) {
      setError(e?.name === 'AbortError' ? 'Server lambat (timeout). Coba lagi.' : 'Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!me) return; // tunggu sesi
    load();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  function schedule(index) {
    // Kartu index: back spin dulu, front mengikuti timing rarity (M makin lama makin deg-degan).
    const ms = revealMsFor(pullsRef.current[index]);
    setTurn(index);
    setFace('back');
    timers.current.push(setTimeout(() => setFace('front'), ms));
    timers.current.push(setTimeout(() => {
      if (index + 1 < pullsRef.current.length) schedule(index + 1);
      else setFinished(true);
    }, ms + 450));
  }

  const pullsRef = useRef([]);
  useEffect(() => { pullsRef.current = pulls; }, [pulls]);

  async function doPull(count) {
    if (pulling) return;
    clearTimers();
    setPulling(true);
    setError('');
    setPulls([]);
    setFinished(false);
    try {
      const { ok, data } = await postJson('/api/gacha/pull', { count });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal gacha.');
        return;
      }
      setPulls(data.pulls || []);
      setInfo((prev) => prev ? { ...prev, xp: data.xpAfter, totalPulls: data.total_pulls, pullsToday: data.pulls_today } : prev);
      if (instant) {
        // Mode langsung: semua terbuka sekaligus, tanpa animasi 1-1.
        setTurn(Math.max(0, (data.pulls || []).length - 1));
        setFace('front');
        setFinished(true);
        return;
      }
      // Mulai reveal dari kartu pertama (next tick agar state pulls ter-commit).
      timers.current.push(setTimeout(() => {
        const firstMs = revealMsFor((data.pulls || [])[0]);
        setTurn(0);
        setFace('back');
        timers.current.push(setTimeout(() => setFace('front'), firstMs));
        timers.current.push(setTimeout(() => {
          if ((data.pulls || []).length > 1) scheduleRef.current(1);
          else setFinished(true);
        }, firstMs + 450));
      }, 50));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setPulling(false);
    }
  }

  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  function skipAll() {
    clearTimers();
    setTurn(Math.max(0, pulls.length - 1));
    setFace('front');
    setFinished(true);
  }

  useEffect(() => () => clearTimers(), []);

  const revealing = pulls.length > 0 && !finished;
  const newCount = pulls.filter((p) => p.isNew).length;

  if (loading) {
    return <PageSkeleton username={me?.username} title="Gacha" />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <FrameDefs />
          <div className="brand"><h1>Gacha</h1></div>
          {error ? (
            <div className="alert-error">
              {error}{' '}
              <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '4px 12px' }} onClick={load}>
                Coba lagi
              </button>
            </div>
          ) : null}

          {info ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>XP kamu: {info.xp.toLocaleString('id-ID')}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total pull: {info.totalPulls} • Tanpa limit harian di web</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn" style={{ flex: 1, minWidth: 140 }} disabled={pulling || revealing} onClick={() => doPull(1)}>
                  Gacha 1x ({info.cost} XP)
                </button>
                <button className="btn" style={{ flex: 1, minWidth: 140 }} disabled={pulling || revealing} onClick={() => doPull(10)}>
                  Gacha 10x ({info.cost10} XP, hemat 10%)
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
                Rate: {Object.entries(info.rates || {}).map(([k, v]) => `${k} ${v}%`).join(' • ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Stok tersisa (unit): {['Mythic', 'Legendary', 'Epic'].map((t) => {
                  const s = info.stocks?.[t];
                  return `${t} ${s ? `${s.left}/${s.total}` : '-'}`;
                }).join(' • ')}
              </div>
              <div className="chip-row" style={{ marginTop: 12, marginBottom: 0 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={instant}
                  className={instant ? 'chip active' : 'chip'}
                  onClick={toggleInstant}
                  title="Buka semua kartu sekaligus tanpa animasi 1-1"
                  suppressHydrationWarning
                >
                  ⚡ {instant ? 'Langsung: ON' : 'Reveal 1-1'}
                </button>
              </div>
            </div>
          ) : null}

          {pulls.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>
                  Hasil ({finished ? pulls.length : Math.min(pulls.length, turn + 1)}/{pulls.length})
                  {!finished ? ' — membuka 1-1...' : ` — ${newCount} baru`}
                </div>
                {revealing ? (
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 14px', marginLeft: 'auto' }} onClick={skipAll}>
                    Lewati
                  </button>
                ) : null}
              </div>
              <div className="gacha-grid">
                {pulls.map((p, i) => {
                  if (finished || i < turn) return <RevealCard key={i} pull={p} face="front" />;
                  if (i === turn) return <RevealCard key={i} pull={p} face={face} />;
                  return (
                    <div key={i} className="gacha-card waiting">
                      <div className="gacha-back dim"><span>{i + 1}</span></div>
                    </div>
                  );
                })}
              </div>
              {finished ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" style={{ flex: 1, minWidth: 140 }} onClick={() => doPull(1)}>
                    Lagi 1x ({info?.cost} XP)
                  </button>
                  <button className="btn" style={{ flex: 1, minWidth: 140 }} onClick={() => doPull(10)}>
                    Lagi 10x ({info?.cost10} XP)
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {info?.history?.length > 0 ? (
            <div className="card">
              <div className="section-title">10 pull terakhir</div>
              {info.history.map((h, i) => (
                <div className="user-row" key={i}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 9999, background: TIER_COLORS[h.rarity] || '#999' }} />
                  <span style={{ fontWeight: 700, marginLeft: 8 }}>{h.charName}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>[{h.rarity}]{h.isNew ? ' BARU' : ''}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
