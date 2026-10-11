'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function TradePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('create');
  const [myCards, setMyCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  // Buat kode
  const [pickCard, setPickCard] = useState('');
  const [created, setCreated] = useState(null);
  const [myOffers, setMyOffers] = useState([]);

  // Masukkan kode (angka saja -> keypad numerik di HP)
  const [inCode, setInCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [giveCard, setGiveCard] = useState('');
  const [check, setCheck] = useState(null);
  const [result, setResult] = useState(null);

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
          fetch('/api/cards'),
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

  async function refreshOffers() {
    const res = await fetch('/api/trade/create');
    const data = await res.json().catch(() => ({}));
    if (data.success) setMyOffers(data.offers || []);
  }

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setCreated(null);
    const res = await fetch('/api/trade/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ charName: pickCard }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Gagal buat kode.');
      return;
    }
    setCreated(data);
    refreshOffers();
  }

  async function onCancel(code) {
    await fetch(`/api/trade/create?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    refreshOffers();
  }

  async function onPreview(e) {
    e.preventDefault();
    setError('');
    setPreview(null);
    setResult(null);
    setCheck(null);
    setGiveCard('');
    const res = await fetch(`/api/trade/offer?code=${encodeURIComponent(inCode)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Kode tidak ditemukan.');
      return;
    }
    setPreview(data);
  }

  // Cek live tiap ganti kartu: sudah punya? milik sendiri? penawar sudah punya?
  useEffect(() => {
    if (!preview || !giveCard) {
      setCheck(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/trade/offer?code=${encodeURIComponent(inCode)}&my=${encodeURIComponent(giveCard)}`,
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
  }, [giveCard]);

  async function onAccept(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/trade/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inCode, myCharName: giveCard }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      setError(data.message || 'Gagal tukar kartu.');
      return;
    }
    setResult(data);
    setPreview(null);
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">Memuat trade...</div>
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
              <div className="section-title">Buat kode trade</div>
              <form onSubmit={onCreate}>
                <div className="field">
                  <label className="label" htmlFor="pickCard">
                    Kartu yang ditawarkan
                  </label>
                  <select
                    id="pickCard"
                    className="select"
                    value={pickCard}
                    onChange={(e) => setPickCard(e.target.value)}
                    required
                  >
                    <option value="">-- pilih kartumu --</option>
                    {myCards.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} [{c.tier}] ★{c.level}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn" type="submit">
                  Buat Kode Angka
                </button>
              </form>
              {created ? (
                <div>
                  <div className="trade-code-big">{created.code}</div>
                  <div className="trade-hint">
                    {created.charName} — berlaku 30 menit, sekali pakai. Bagikan kode ini ke lawan
                    trademu.
                  </div>
                </div>
              ) : null}
              {myOffers.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <div className="section-title">Penawaran aktifmu</div>
                  {myOffers.map((o) => (
                    <div className="user-row" key={o.code}>
                      <span style={{ fontWeight: 800, letterSpacing: 2 }}>{o.code}</span>
                      <span style={{ marginLeft: 10, color: 'var(--body)' }}>{o.charName}</span>
                      <button
                        className="btn btn-ghost"
                        style={{ width: 'auto', minHeight: 0, padding: '6px 12px', marginLeft: 'auto' }}
                        onClick={() => onCancel(o.code)}
                      >
                        Batal
                      </button>
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
                      {preview.offer.rarity}] milik @{preview.offer.ownerUsername}
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
                      Kamu sudah punya {preview.offer.charName} — jadi Limit Break +XP otomatis.
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
                      onChange={(e) => setGiveCard(e.target.value)}
                      required
                    >
                      <option value="">-- pilih kartumu --</option>
                      {myCards.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} [{c.tier}] ★{c.level}
                        </option>
                      ))}
                    </select>
                  </div>
                  {check && giveCard ? (
                    !check.owned ? (
                      <div className="alert-error">Kamu tidak punya kartu itu.</div>
                    ) : check.same ? (
                      <div className="alert-error">Kartunya sama, tidak perlu tukar.</div>
                    ) : check.offererHas ? (
                      <div
                        style={{
                          border: '1px solid var(--hairline-strong)',
                          borderRadius: 'var(--r-md)',
                          padding: '10px 14px',
                          fontSize: 13,
                          marginBottom: 16,
                        }}
                      >
                        Penawar sudah punya {giveCard} — kartumu jadi Limit Break +XP untuknya.
                      </div>
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
                      Kamu menerima <strong>{result.received.charName}</strong>
                      {result.dupeReceived
                        ? ` (duplikat: Limit Break ★${result.dupeReceived.level} +${result.dupeReceived.xpBonus} XP)`
                        : ''}{' '}
                      dan memberikan <strong>{result.given.charName}</strong>
                      {result.dupeGiven
                        ? ` (duplikat untuk lawan: Limit Break ★${result.dupeGiven.level} +${result.dupeGiven.xpBonus} XP)`
                        : ''}
                      .
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
