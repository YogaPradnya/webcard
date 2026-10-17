'use client';

import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { FrameDefs, FrameOverlay } from '@/components/Frames';
import MythicConfetti from '@/components/MythicConfetti';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import { optImg, srcSetImg, IMG_SIZES_CARD } from '@/lib/images';
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

// Pesan bergantian di panggung tunggu (server 10x bisa ~4-5 dtk — biarkan
// terasa "sedang bekerja", bukan hang).
const WAIT_MSGS = [
  'Memanggil kartu',
  'Menyeleksi pool',
  'Membaca keberuntungan',
  'Menghitung pity',
  'Membuka paket',
];

function RevealCard({ pull, face, anticipating, burst }) {
  const color = TIER_COLORS[pull.rarity] || '#9ca3af';
  if (face === 'back') {
    return (
      <div className={'gacha-card spinning' + (anticipating ? ' anticipating' : '')} style={{ borderColor: color, boxShadow: '3px 3px 0 #0a0a0a' }}>
        <div className="gacha-back" style={{ background: color }}>
          <span>?</span>
        </div>
      </div>
    );
  }
  return (
    <div className="gacha-card revealed" style={{ borderColor: color, boxShadow: '3px 3px 0 #0a0a0a' }}>
      {burst ? (
        <span className="gacha-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></span>
      ) : null}
      {pull.isNew ? <span className="gacha-new">BARU</span> : <span className="gacha-dupe">+1 stack</span>}
      <div className="framed-art">
        {pull.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optImg(pull.imageUrl, 400)} srcSet={srcSetImg(pull.imageUrl)} sizes={IMG_SIZES_CARD} alt={pull.charName} decoding="async" fetchpriority="high" />
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
  const [anticipating, setAnticipating] = useState(false); // slow-mo 0,5 dtk khusus Epic+
  const [burst, setBurst] = useState(-1); // index kartu yang meledak (Legendary/Mythic)
  const [shake, setShake] = useState(false); // guncang panggung saat Legendary/Mythic
  const [celebrate, setCelebrate] = useState(false); // confetti layar penuh saat Mythic
  const [finished, setFinished] = useState(false);
  const [waitIdx, setWaitIdx] = useState(0); // pesan bergantian di panggung tunggu
  const [waitCount, setWaitCount] = useState(1); // 1|10 — jumlah kartu di panggung tunggu
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

  const HOT_TIERS = ['Epic', 'Legendary', 'Mythic'];

  function triggerShake() {
    setShake(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setShake(true)));
    timers.current.push(setTimeout(() => setShake(false), 500));
  }

  function schedule(index) {
    // Kartu index: back spin dulu, front mengikuti timing rarity (M makin lama makin deg-degan).
    // Epic+: 0,5 dtk terakhir jadi slow-mo antisipasi; Legendary/Mythic: shake + burst saat terbuka.
    const pull = pullsRef.current[index];
    const ms = revealMsFor(pull);
    const hot = HOT_TIERS.includes(pull?.rarity) && !instant;
    const pre = hot ? Math.min(500, Math.floor(ms / 2)) : 0;
    setTurn(index);
    setFace('back');
    setAnticipating(false);
    setBurst(-1);
    timers.current.push(setTimeout(() => {
      if (hot) setAnticipating(true);
      timers.current.push(setTimeout(() => {
        setFace('front');
        setAnticipating(false);
        if (pull && (pull.rarity === 'Legendary' || pull.rarity === 'Mythic')) {
          setBurst(index);
          triggerShake();
          if (pull.rarity === 'Mythic') setCelebrate(true);
        }
        timers.current.push(setTimeout(() => {
          if (index + 1 < pullsRef.current.length) schedule(index + 1);
          else setFinished(true);
        }, 450));
      }, pre));
    }, Math.max(0, ms - pre)));
  }

  const pullsRef = useRef([]);
  useEffect(() => { pullsRef.current = pulls; }, [pulls]);

  async function doPull(count) {
    if (pulling) return;
    clearTimers();
    setPulling(true);
    setWaitCount(count === 10 ? 10 : 1);
    setWaitIdx(0);
    setError('');
    setPulls([]);
    setFinished(false);
    setAnticipating(false);
    setBurst(-1);
    setShake(false);
    try {
      const { ok, data } = await postJson('/api/gacha/pull', { count });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal gacha.');
        return;
      }
      setPulls(data.pulls || []);
      setInfo((prev) => prev ? {
        ...prev,
        xp: data.xpAfter,
        totalPulls: data.total_pulls,
        pullsToday: data.pulls_today,
        // Riwayat ikut diperbarui tanpa reload: pull terakhir = paling baru,
        // jadi urutkan balik lalu tempel di depan (maks 10 seperti server).
        history: [
          ...(data.pulls || []).slice().reverse().map((p) => ({
            charName: p.charName,
            rarity: p.rarity,
            isNew: !!p.isNew,
            createdAt: Date.now(),
          })),
          ...(prev.history || []),
        ].slice(0, 10),
      } : prev);
      if (instant) {
        // Mode langsung: semua terbuka sekaligus, tanpa animasi 1-1.
        setTurn(Math.max(0, (data.pulls || []).length - 1));
        setFace('front');
        setFinished(true);
        return;
      }
      // Mulai reveal dari kartu pertama (next tick agar state pulls ter-commit).
      timers.current.push(setTimeout(() => scheduleRef.current(0), 50));
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
    setAnticipating(false);
    setBurst(-1);
    setShake(false);
    setFinished(true);
  }

  useEffect(() => () => clearTimers(), []);

  // Panggung tunggu: pesan bergantian selama request pull berjalan.
  useEffect(() => {
    if (!pulling) return;
    setWaitIdx(0);
    const t = setInterval(() => setWaitIdx((i) => (i + 1) % WAIT_MSGS.length), 1100);
    return () => clearInterval(t);
  }, [pulling]);

  const revealing = pulls.length > 0 && !finished;
  const newCount = pulls.filter((p) => p.isNew).length;

  if (loading) {
    return <PageSkeleton username={me?.username} title="Gacha" />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      {celebrate ? <MythicConfetti onDone={() => setCelebrate(false)} /> : null}
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
                  {pulling && waitCount === 1 ? 'Memanggil…' : `Gacha 1x (${info.cost} XP)`}
                </button>
                <button className="btn" style={{ flex: 1, minWidth: 140 }} disabled={pulling || revealing} onClick={() => doPull(10)}>
                  {pulling && waitCount === 10 ? 'Memanggil 10 kartu…' : `Gacha 10x (${info.cost10} XP, hemat 10%)`}
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

          {pulling ? (
            <div className="card gacha-wait" style={{ marginBottom: 16 }} aria-busy="true">
              <div className="gacha-wait-grid" aria-hidden="true">
                {Array.from({ length: waitCount }).map((_, i) => (
                  <div key={i} className="gacha-card wait-card" style={{ animationDelay: `${-(i % 10) * 90}ms` }}>
                    <div className="gacha-back magic"><span>✦</span></div>
                  </div>
                ))}
              </div>
              <div className="gacha-wait-status" role="status" aria-live="polite">
                <span className="gacha-orb" aria-hidden="true" />
                <span>{WAIT_MSGS[waitIdx]}…</span>
              </div>
              <div className="gacha-progress" aria-hidden="true"><i /></div>
              <div className="gacha-wait-hint">
                {waitCount === 10
                  ? '10x diproses kartu satu-satu (anti-bentrok stok) — biasanya 2-5 detik.'
                  : 'Biasanya di bawah 1 detik.'}
              </div>
              <span className="gacha-spark" aria-hidden="true" style={{ left: '10%' }} />
              <span className="gacha-spark" aria-hidden="true" style={{ left: '36%', animationDelay: '.6s' }} />
              <span className="gacha-spark" aria-hidden="true" style={{ left: '64%', animationDelay: '1.2s' }} />
              <span className="gacha-spark" aria-hidden="true" style={{ left: '88%', animationDelay: '1.7s' }} />
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
              <div className={'gacha-grid gacha-stage' + (shake ? ' shake' : '')}>
                {pulls.map((p, i) => {
                  if (finished || i < turn) return <RevealCard key={i} pull={p} face="front" />;
                  if (i === turn) return <RevealCard key={i} pull={p} face={face} anticipating={anticipating} burst={burst === i} />;
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
