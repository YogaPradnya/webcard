'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function formatSisa(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d} hari lagi`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h} jam lagi`;
  const m = Math.floor(s / 60);
  if (m >= 1) return `${m} mnt lagi`;
  return `${s} dtk lagi`;
}

const TIER_SCORE = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };

function fairLabel(aTier, aAmount, bTier, bAmount) {
  const a = TIER_SCORE[aTier] ?? 0;
  const b = TIER_SCORE[bTier] ?? 0;
  const d = Math.abs(a - b);
  if (d === 0) return { text: 'Seimbang (tier sama)', ok: true };
  if (d === 1) {
    return aAmount === 1 && bAmount === 1
      ? { text: 'Cukup adil (selisih 1 tier, 1 lawan 1)', ok: true }
      : { text: `Selisih 1 tier (${aTier} ↔ ${bTier}) hanya bisa 1 lawan 1`, ok: false };
  }
  if (d === 2) {
    const hi = a > b ? aTier : bTier;
    const lo = a > b ? bTier : aTier;
    const hiAmt = a > b ? aAmount : bAmount;
    const loAmt = a > b ? bAmount : aAmount;
    return hiAmt === 1 && loAmt === 3
      ? { text: `Adil (3 ${lo} untuk 1 ${hi})`, ok: true }
      : { text: `Butuh 3 ${lo} untuk 1 ${hi}`, ok: false };
  }
  return { text: `Tidak bisa trade ${aTier} dengan ${bTier} (maksimal selisih 2 tier)`, ok: false };
}

export default function TradePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('create');
  const [myCards, setMyCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const [pickCard, setPickCard] = useState('');
  const [pickAmount, setPickAmount] = useState(1);
  const [pickQ, setPickQ] = useState('');
  const [created, setCreated] = useState(null);
  const [myOffers, setMyOffers] = useState([]);

  const [inCode, setInCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [giveCard, setGiveCard] = useState('');
  const [giveAmount, setGiveAmount] = useState(1);
  const [check, setCheck] = useState(null);
  const [result, setResult] = useState(null);

  const [tradeQ, setTradeQ] = useState('');
  const [tradeQInput, setTradeQInput] = useState('');
  const [tradePage, setTradePage] = useState(1);
  const [tradeList, setTradeList] = useState([]);
  const [tradeTotal, setTradeTotal] = useState(0);
  const [tradeTotalPages, setTradeTotalPages] = useState(1);
  const [tradeLoading, setTradeLoading] = useState(false);

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

        const [cardsRes, usersRes, offersRes] = await Promise.all([
          fetch('/api/cards?owned=1'),
          fetch('/api/trade/users'),
          fetch('/api/trade/create'),
        ]);
        const cardsData = await cardsRes.json().catch(() => ({}));
        if (cardsData.success) setMyCards((cardsData.cards || []).filter((c) => c.owned));
        const usersData = await usersRes.json().catch(() => ({}));
        if (usersData.success) setUsers(usersData.users || []);
        const offersData = await offersRes.json().catch(() => ({}));
        if (offersData.success) setMyOffers(offersData.offers || []);
      } catch {
        setError('Tidak bisa menghubungi server. Coba lagi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const filteredPick = useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    if (!q) return myCards;
    return myCards.filter((c) => `${c.name} ${c.tier}`.toLowerCase().includes(q));
  }, [myCards, pickQ]);

  const pickCardObj = useMemo(
    () => myCards.find((c) => c.name === pickCard) || null,
    [myCards, pickCard],
  );

  useEffect(() => {
    setPickAmount(1);
  }, [pickCard]);

  async function fetchTradeReady(page = tradePage, q = tradeQ) {
    setTradeLoading(true);
    try {
      const res = await fetch(`/api/trade/offers?q=${encodeURIComponent(q)}&page=${page}`);
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setTradeList(data.offers || []);
        setTradeTotal(data.pagination?.total || 0);
        setTradeTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      // abaikan
    } finally {
      setTradeLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) fetchTradeReady(tradePage, tradeQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tradePage, tradeQ]);

  async function refreshOffers() {
    const res = await fetch('/api/trade/create');
    const data = await res.json().catch(() => ({}));
    if (data.success) setMyOffers(data.offers || []);
    fetchTradeReady(tradePage, tradeQ);
  }

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setCreated(null);
    if (!pickCard) {
      setError('Pilih 1 kartumu dulu.');
      return;
    }
    const res = await fetch('/api/trade/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charName: pickCard, amount: pickAmount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Gagal buat kode.');
      return;
    }
    setCreated(data);
    refreshOffers();
  }

  async function copyText(t, key) {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('Gagal salin. Salin manual: ' + t);
    }
  }

  async function onCancel(code) {
    await fetch(`/api/trade/create?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    refreshOffers();
  }

  async function loadPreviewFor(code) {
    setError('');
    setPreview(null);
    setResult(null);
    setCheck(null);
    setGiveCard('');
    setGiveAmount(1);
    setInCode(code);
    const res = await fetch(`/api/trade/offer?code=${encodeURIComponent(code)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Kode tidak ditemukan.');
      return;
    }
    setPreview(data);
  }

  function onPickTrade(code) {
    setMode('enter');
    setError('');
    setCreated(null);
    setResult(null);
    loadPreviewFor(code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onPreview(e) {
    e.preventDefault();
    loadPreviewFor(inCode);
  }

  useEffect(() => {
    if (!preview || !giveCard) {
      setCheck(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/trade/offer?code=${encodeURIComponent(inCode)}&my=${encodeURIComponent(giveCard)}&myQty=${giveAmount}`,
        );
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          setPreview(data);
          setCheck(data.mineOk);
        }
      } catch {
        // abaikan, validasi final tetap di server
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giveCard, giveAmount]);

  async function onAccept(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/trade/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inCode, myCharName: giveCard, myAmount: giveAmount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Gagal tukar kartu.');
      return;
    }
    setResult({ received: data.received, given: data.given });
    setPreview(null);
    refreshOffers();
  }

  function onSearchTrade(e) {
    e.preventDefault();
    setTradePage(1);
    setTradeQ(tradeQInput.trim());
  }

  const giveObj = myCards.find((c) => c.name === giveCard);
  const fair = preview?.offer && giveObj
    ? fairLabel(preview.offer.rarity, preview.offer.amount, giveObj.tier, giveAmount)
    : null;

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">
              <div className="skeleton-line" style={{ width: '50%' }} />
              <div className="skeleton-line" style={{ width: '85%' }} />
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
          <div className="brand">
            <h1>Trade Kartu</h1>
          </div>

          {error ? <div className="alert-error">{error}</div> : null}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Trade aktif ({tradeTotal})</div>
            <form onSubmit={onSearchTrade} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Cari usn / nama kartu / kode..."
                value={tradeQInput}
                onChange={(e) => setTradeQInput(e.target.value)}
                aria-label="Cari trade"
              />
              <button className="btn" type="submit" style={{ width: 'auto', padding: '0 20px' }}>
                Cari
              </button>
            </form>
            {tradeLoading ? <div style={{ fontSize: 13 }}>Memuat...</div> : null}
            {!tradeLoading && tradeList.length === 0 ? (
              <div style={{ fontSize: 13 }}>Belum ada trade ready.</div>
            ) : null}
            {tradeList.map((o) => (
              <div className="user-row" key={o.code}>
                <span>
                  <strong>@{o.ownerUsername}</strong>
                  <span style={{ color: 'var(--body)' }}> — {o.charName} [{o.rarity}]{o.amount > 1 ? ` x${o.amount}` : ''}</span>
                  <br />
                  <span style={{ fontWeight: 800, letterSpacing: 2 }}>{o.code}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                    {formatSisa(o.expiresAt - Date.now())}
                  </span>
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ width: 'auto', minHeight: 0, padding: '6px 12px', marginLeft: 'auto' }}
                  onClick={() => onPickTrade(o.code)}
                >
                  Tukar
                </button>
              </div>
            ))}
            {tradeTotalPages > 1 ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                <button
                  className="btn btn-ghost"
                  style={{ width: 'auto' }}
                  disabled={tradePage <= 1}
                  onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </button>
                <span style={{ fontSize: 12 }}>
                  {tradePage}/{tradeTotalPages}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ width: 'auto' }}
                  disabled={tradePage >= tradeTotalPages}
                  onClick={() => setTradePage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </div>
            ) : null}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Aturan nilai trade</div>
            <div style={{ fontSize: 12, color: 'var(--body)', lineHeight: 1.7 }}>
              • Tier sama: bebas (jumlah copy bebas)<br />
              • Selisih 1 tier (mis. Legend ↔ Epic): wajib 1 lawan 1<br />
              • Selisih 2 tier (mis. Legend ↔ Rare): wajib 3 (tier bawah) lawan 1 (tier atas)<br />
              • Selisih 3 tier atau lebih: tidak bisa trade
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="tradeMode">
                Pilih aksi
              </label>
              <select
                id="tradeMode"
                className="select"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setError('');
                  setCreated(null);
                  setPreview(null);
                  setResult(null);
                }}
              >
                <option value="create">Buat kode</option>
                <option value="enter">Masukkan kode</option>
              </select>
            </div>
          </div>

          {mode === 'create' ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Buat kode trade ({myOffers.length}/10)</div>
              <form onSubmit={onCreate}>
                <div className="field">
                  <label className="label" htmlFor="pickQ">Cari kartumu</label>
                  <input id="pickQ" className="input" placeholder="Ketik nama kartu..." value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
                </div>
                <div className="pick-grid" style={{ marginBottom: 12 }}>
                  {filteredPick.slice(0, 30).map((c) => (
                    <div
                      key={c.name}
                      className={pickCard === c.name ? 'card-item picked' : 'card-item'}
                      onClick={() => setPickCard(c.name)}
                      title={c.name}
                      role="button"
                      aria-pressed={pickCard === c.name}
                    >
                      {pickCard === c.name ? <span className="pick-check">✓</span> : null}
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" decoding="async" />
                      ) : (
                        <div className="card-art" />
                      )}
                      <div className="card-meta">
                        <div className="card-name">{c.name}</div>
                        <div className="card-anime">{c.tier} ★{c.level}{c.quantity > 1 ? ` x${c.quantity}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {filteredPick.length === 0 ? <div style={{ fontSize: 13, marginBottom: 12 }}>Tidak ada kartu cocok.</div> : null}
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Dipilih: <b>{pickCard || '-'}</b>
                  {pickCardObj && pickCardObj.quantity > 1 ? ` (punya ${pickCardObj.quantity})` : ''}
                </div>
                {pickCardObj && pickCardObj.quantity > 1 ? (
                  <div className="field">
                    <label className="label" htmlFor="pickAmount">Jumlah copy</label>
                    <div className="stepper">
                      <button type="button" className="btn btn-ghost" style={{ width: 44 }} disabled={pickAmount <= 1} onClick={() => setPickAmount((a) => Math.max(1, a - 1))} aria-label="Kurangi">-</button>
                      <span className="stepper-val">{pickAmount}/{pickCardObj.quantity}</span>
                      <button type="button" className="btn btn-ghost" style={{ width: 44 }} disabled={pickAmount >= pickCardObj.quantity} onClick={() => setPickAmount((a) => Math.min(pickCardObj.quantity, a + 1))} aria-label="Tambah">+</button>
                    </div>
                  </div>
                ) : null}
                <button className="btn" type="submit" disabled={myOffers.length >= 10 || !pickCard}>
                  Buat Kode Angka
                </button>
              </form>
              {created ? (
                <div>
                  <div className="trade-code-big">{created.code}</div>
                  <div className="trade-hint">
                    {created.charName}{created.amount > 1 ? ` x${created.amount}` : ''} — berlaku 10 menit, sekali pakai. Bagikan kode ini ke lawan
                    trademu.
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => copyText(created.code, 'created')}>
                    {copied === 'created' ? 'Tersalin!' : 'Salin Kode'}
                  </button>
                </div>
              ) : null}
              {myOffers.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <div className="section-title">Penawaran aktifmu</div>
                  {myOffers.map((o) => (
                    <div className="user-row" key={o.code}>
                      <span style={{ fontWeight: 800, letterSpacing: 2 }}>{o.code}</span>
                      <span style={{ marginLeft: 10, color: 'var(--body)' }}>{o.charName}{o.amount > 1 ? ` x${o.amount}` : ''}</span>
                      <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }}
                          onClick={() => copyText(o.code, o.code)}
                          type="button"
                        >
                          {copied === o.code ? 'OK' : 'Salin'}
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }}
                          onClick={() => onCancel(o.code)}
                        >
                          Batal
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Masukkan kode trade</div>
              <form onSubmit={onPreview}>
                <div className="field">
                  <label className="label" htmlFor="inCode">
                    Kode angka dari lawan trademu
                  </label>
                  <input
                    id="inCode"
                    className="input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    placeholder="Contoh: 482910"
                    value={inCode}
                    onChange={(e) => setInCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                    required
                    style={{ letterSpacing: 4, fontWeight: 700, fontSize: 18 }}
                  />
                </div>
                <button className="btn" type="submit">
                  Lihat Penawaran
                </button>
              </form>

              {preview && preview.card ? (
                <form onSubmit={onAccept} style={{ marginTop: 16 }}>
                  <div className="section-title">Tukar dengan</div>
                  <div className="user-row">
                    <span>
                      <strong>{preview.card.charName || preview.offer.charName}</strong> [
                      {preview.offer.rarity}]{preview.offer.amount > 1 ? ` x${preview.offer.amount}` : ''} milik @{preview.offer.ownerUsername}
                    </span>
                  </div>
                  {preview.offer.isMine ? (
                    <div className="alert-error">Ini penawaranmu sendiri.</div>
                  ) : null}
                  {preview.alreadyOwned ? (
                    <div
                      style={{
                        border: '1px solid var(--hairline-strong)',
                        borderRadius: 'var(--r-md)',
                        padding: '10px 14px',
                        fontSize: 13,
                        marginBottom: 16,
                      }}
                    >
                      Kamu sudah punya {preview.offer.charName} — hasil trade akan menumpuk (tanpa XP otomatis).
                    </div>
                  ) : null}
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label" htmlFor="giveCard">
                      Kartumu sebagai gantinya
                    </label>
                    <select
                      id="giveCard"
                      className="select"
                      value={giveCard}
                      onChange={(e) => { setGiveCard(e.target.value); setGiveAmount(1); }}
                      required
                    >
                      <option value="">-- pilih kartumu --</option>
                      {myCards.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} [{c.tier}] ★{c.level}{c.quantity > 1 ? ` x${c.quantity}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {giveObj && giveObj.quantity > 1 ? (
                    <div className="field">
                      <label className="label" htmlFor="giveAmount">Jumlah copy yang diberikan</label>
                      <div className="stepper">
                        <button type="button" className="btn btn-ghost" style={{ width: 44 }} disabled={giveAmount <= 1} onClick={() => setGiveAmount((a) => Math.max(1, a - 1))} aria-label="Kurangi">-</button>
                        <span className="stepper-val">{giveAmount}/{giveObj.quantity}</span>
                        <button type="button" className="btn btn-ghost" style={{ width: 44 }} disabled={giveAmount >= giveObj.quantity} onClick={() => setGiveAmount((a) => Math.min(giveObj.quantity, a + 1))} aria-label="Tambah">+</button>
                      </div>
                      {giveAmount >= giveObj.quantity ? (
                        <div style={{ fontSize: 12, color: '#a16207', marginTop: 6 }}>Perhatian: ini copy terakhirmu.</div>
                      ) : null}
                    </div>
                  ) : null}
                  {fair && giveCard ? (
                    <div
                      className={fair.ok ? 'trade-fair ok' : 'trade-fair warn'}
                      role="status"
                    >
                      {fair.ok ? '✓' : '⚠'} {fair.text}
                    </div>
                  ) : null}
                  {check && giveCard ? (
                    !check.owned ? (
                      <div className="alert-error">Kamu tidak punya kartu itu.</div>
                    ) : !check.enough ? (
                      <div className="alert-error">Kamu hanya punya {check.quantity} copy (minta {giveAmount}).</div>
                    ) : check.same ? (
                      <div className="alert-error">Kartunya sama, tidak perlu tukar.</div>
                    ) : !check.ruleOk ? (
                      <div className="alert-error">{check.ruleMessage}</div>
                    ) : null
                  ) : null}
                  <button
                    className="btn"
                    type="submit"
                    disabled={!giveCard || preview.offer.isMine || !(check && check.ok)}
                  >
                    Konfirmasi Tukar
                  </button>
                </form>
              ) : null}

              {result ? (
                <div style={{ marginTop: 16 }}>
                  <div className="section-title">Trade berhasil</div>
                  <div className="user-row">
                    <span>
                      Kamu menerima <strong>{result.received?.charName}{result.received?.amount > 1 ? ` x${result.received.amount}` : ''}</strong>{' '}
                      dan memberikan <strong>{result.given?.charName}{result.given?.amount > 1 ? ` x${result.given.amount}` : ''}</strong>.
                      Copy yang sama menumpuk otomatis.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="card">
            <div className="section-title">Daftar user</div>
            {users.map((u) => (
              <div className="user-row" key={u.username}>
                <span style={{ fontWeight: 700 }}>
                  @{u.username}
                  {u.isMe ? ' (kamu)' : ''}
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--body)' }}>{u.owned} kartu</span>
              </div>
            ))}
            {users.length === 0 ? <div style={{ fontSize: 13 }}>Belum ada user.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
