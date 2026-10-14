'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { optImg } from '@/lib/images';

const RATES = { Common: 50, Rare: 150, Epic: 400, Legendary: 1000, Mythic: 2500 };

export default function ConvertPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pick, setPick] = useState({}); // lowerName -> qty
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState('');

  async function load() {
    setError('');
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.success) {
        router.push('/login');
        return;
      }
      setMe(meData);
      const [cardsRes, gachaRes] = await Promise.all([
        fetch('/api/cards?owned=1'),
        fetch('/api/gacha'),
      ]);
      const cardsData = await cardsRes.json().catch(() => ({}));
      if (cardsData.success) setCards((cardsData.cards || []).filter((c) => c.owned));
      const gachaData = await gachaRes.json().catch(() => ({}));
      if (gachaData.success) setXp(gachaData.xp || 0);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => `${c.name} ${c.tier}`.toLowerCase().includes(q));
  }, [cards, query]);

  function setQty(c, qty) {
    const key = c.name.toLowerCase();
    const clamped = Math.max(0, Math.min(c.quantity, qty));
    setPick((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[key];
      else next[key] = clamped;
      return next;
    });
  }

  const lines = useMemo(() => {
    const out = [];
    for (const c of cards) {
      const q = pick[c.name.toLowerCase()] || 0;
      if (q > 0) out.push({ charName: c.name, rarity: c.tier, qty: q, xp: (RATES[c.tier] || 0) * q, isLast: q >= c.quantity });
    }
    return out;
  }, [cards, pick]);

  const totalXp = lines.reduce((a, l) => a + l.xp, 0);
  const hasLast = lines.some((l) => l.isLast);

  async function doConvert() {
    if (lines.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: lines.map((l) => ({ charName: l.charName, qty: l.qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal konversi.');
        return;
      }
      setResult(data);
      setPick({});
      setConfirming(false);
      load();
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setBusy(false);
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
          <div className="brand"><h1>Konversi ke EXP</h1></div>
          {error ? <div className="alert-error">{error}</div> : null}
          {result ? (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--success)' }}>
              <div className="section-title">Konversi berhasil +{result.totalXp} XP</div>
              <div style={{ fontSize: 13 }}>
                {result.converted.map((c) => `${c.charName} x${c.qty}`).join(', ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                XP {result.xpBefore} → {result.xpAfter} (Lv {result.level})
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>XP kamu: {xp.toLocaleString('id-ID')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Rate: Common 50 • Rare 150 • Epic 400 • Legendary 1000 • Mythic 2500 XP per copy
            </div>
            <div className="book-toolbar">
              <input
                className="input"
                placeholder="Cari kartumu..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Cari kartu"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {filtered.map((c) => {
                const q = pick[c.name.toLowerCase()] || 0;
                return (
                  <div className="user-row" key={c.name}>
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={optImg(c.imageUrl, 100)} alt={c.name} width={36} height={48} style={{ objectFit: 'cover', borderRadius: 6 }} loading="lazy" />
                    ) : null}
                    <span style={{ flex: 1 }}>
                      <b>{c.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>[{c.tier}] x{c.quantity} • {RATES[c.tier] || 0} XP</span>
                      {c.showcase ? <span className="stat-tag showcase" style={{ marginLeft: 6 }}>Pajangan</span> : null}
                    </span>
                    <span className="stepper">
                      <button type="button" className="btn btn-ghost" style={{ width: 36, minHeight: 36 }} disabled={q <= 0} onClick={() => setQty(c, q - 1)} aria-label="Kurangi">-</button>
                      <span className="stepper-val" style={{ minWidth: 48 }}>{q}/{c.quantity}</span>
                      <button type="button" className="btn btn-ghost" style={{ width: 36, minHeight: 36 }} disabled={q >= c.quantity} onClick={() => setQty(c, q + 1)} aria-label="Tambah">+</button>
                    </span>
                  </div>
                );
              })}
            </div>
            {filtered.length === 0 ? <div style={{ fontSize: 13 }}>Tidak ada kartu cocok.</div> : null}
          </div>

          <div style={{ height: 90 }} />
          <div className="floating-bar">
            {!confirming ? (
              <button className="btn" disabled={lines.length === 0} onClick={() => setConfirming(true)}>
                {lines.length === 0 ? 'Pilih kartu dulu' : `Konversi ${lines.length} jenis → +${totalXp} XP`}
              </button>
            ) : (
              <div style={{ maxWidth: 1060, margin: '0 auto', background: 'var(--surface)' }}>
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  Yakin konversi {lines.map((l) => `${l.charName} x${l.qty}`).join(', ')} (+{totalXp} XP)?
                  {hasLast ? <b> Termasuk copy terakhir!</b> : null}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setConfirming(false)}>
                    Batal
                  </button>
                  <button className="btn" style={{ flex: 2 }} disabled={busy} onClick={doConvert}>
                    {busy ? 'Memproses...' : `Ya, Konversi +${totalXp} XP`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
