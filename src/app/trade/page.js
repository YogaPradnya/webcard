'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton } from '@/components/PageState';
import { optImg } from '@/lib/images';
import { fetchJson, fetchLenient } from '@/lib/fetchJson';

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

// Nilai tukar per tier (samakan dengan server lib/trade.js).
const TRADE_POINT = { Common: 1, Rare: 2, Epic: 4, Legendary: 8, Mythic: 16 };
const MAX_BUNDLE = 10;

function bundleValue(items) {
  return (items || []).reduce((n, i) => n + (TRADE_POINT[i.rarity || i.tier] || 0) * (Number(i.amount) || 0), 0);
}

function bundleCount(items) {
  return (items || []).reduce((n, i) => n + (Number(i.amount) || 0), 0);
}

function bundleText(items) {
  const list = items || [];
  if (!list.length) return '-';
  const names = list.map((i) => `${i.charName || i.name}${Number(i.amount) > 1 ? ` x${i.amount}` : ''}`).join(' + ');
  return `${names} (${bundleCount(list)} kartu • nilai ${bundleValue(list)})`;
}

function fairBundleLabel(giveItems, takeItems) {
  const tiers = new Set([...(giveItems || []), ...(takeItems || [])].map((i) => i.rarity || i.tier));
  if (tiers.size === 1) return { text: 'Seimbang (semua tier sama)', ok: true };
  const gv = bundleValue(giveItems);
  const tv = bundleValue(takeItems);
  return gv === tv
    ? { text: `Adil (nilai ${gv} vs ${tv})`, ok: true }
    : { text: `Belum adil (nilai ${gv} vs ${tv}). Samakan total: C1 R2 E4 L8 M16.`, ok: false };
}

// Pemilih bundle multi-kartu (maks 10 total). value: [{name, amount}].
function BundlePicker({ cards, value, onChange, maxTotal = MAX_BUNDLE }) {
  const [q, setQ] = useState('');
  const total = bundleCount(value.map((v) => ({ amount: v.amount })));
  const qLower = q.trim().toLowerCase();
  const list = (cards || []).filter((c) => !qLower || `${c.name} ${c.tier}`.toLowerCase().includes(qLower)).slice(0, 30);
  const ownedOf = (name) => (cards || []).find((c) => c.name === name);

  function toggle(name) {
    const cur = value.find((v) => v.name === name);
    if (cur) {
      onChange(value.filter((v) => v.name !== name));
      return;
    }
    const owned = ownedOf(name);
    if (!owned || total >= maxTotal) return;
    onChange([...value, { name, amount: 1 }]);
  }

  function step(name, d) {
    const owned = ownedOf(name);
    const next = value.map((v) => {
      if (v.name !== name) return v;
      const cap = Math.min(owned ? owned.quantity : 1, maxTotal - (total - v.amount));
      return { ...v, amount: Math.max(0, Math.min(cap, v.amount + d)) };
    }).filter((v) => v.amount > 0);
    onChange(next);
  }

  return (
    <div>
      <input
        className="input"
        placeholder="Ketik nama kartu..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Cari kartu bundle"
        style={{ marginBottom: 8 }}
      />
      <div className="pick-grid" style={{ marginBottom: 12 }}>
        {list.map((c) => {
          const sel = value.find((v) => v.name === c.name);
          return (
            <div
              key={c.name}
              className={sel ? 'card-item picked' : 'card-item'}
              onClick={() => toggle(c.name)}
              title={c.name}
              role="button"
              aria-pressed={Boolean(sel)}
            >
              {sel ? <span className="pick-check">{sel.amount > 1 ? `x${sel.amount}` : '✓'}</span> : null}
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="card-art" src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" />
              ) : (
                <div className="card-art" />
              )}
              <div className="card-meta">
                <div className="card-name">{c.name}</div>
                <div className="card-anime">{c.tier} ★{c.level}{c.quantity > 1 ? ` x${c.quantity}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 ? <div style={{ fontSize: 13, marginBottom: 12 }}>Tidak ada kartu cocok.</div> : null}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        Dipilih ({total}/{maxTotal}): <b>{value.length ? bundleText(value.map((v) => ({ name: v.name, amount: v.amount, tier: ownedOf(v.name)?.tier }))) : '-'}</b>
      </div>
      {value.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {value.map((v) => {
            const owned = ownedOf(v.name);
            const cap = Math.min(owned ? owned.quantity : 1, maxTotal - (total - v.amount));
            return (
              <span key={v.name} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {v.name} x{v.amount}
                <button type="button" aria-label={`Kurangi ${v.name}`} onClick={() => step(v.name, -1)} style={{ fontWeight: 800, padding: '0 6px' }}>-</button>
                <button type="button" aria-label={`Tambah ${v.name}`} disabled={v.amount >= cap} onClick={() => step(v.name, 1)} style={{ fontWeight: 800, padding: '0 6px' }}>+</button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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

  const [pickItems, setPickItems] = useState([]);
  const [created, setCreated] = useState(null);
  const [myOffers, setMyOffers] = useState([]);

  const [inCode, setInCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [giveItems, setGiveItems] = useState([]);
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
        const { ok: meOk, data: meData } = await fetchJson('/api/auth/me');
        if (!meOk || !meData.success) {
          router.push('/login');
          return;
        }
        setMe(meData);

        const [cardsData, usersData, offersData] = await Promise.all([
          fetchLenient('/api/cards?owned=1'),
          fetchLenient('/api/trade/users'),
          fetchLenient('/api/trade/create'),
        ]);
        if (cardsData.success) setMyCards((cardsData.cards || []).filter((c) => c.owned));
        if (usersData.success) setUsers(usersData.users || []);
        if (offersData.success) setMyOffers(offersData.offers || []);
      } catch (e) {
        setError(e?.name === 'AbortError' ? 'Server lambat (timeout). Coba lagi.' : 'Tidak bisa menghubungi server. Coba lagi.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setCreated(null);
    if (!pickItems.length) {
      setError('Pilih kartumu dulu (maks 10).');
      return;
    }
    const { ok, data } = await fetchJson('/api/trade/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: pickItems.map((v) => ({ charName: v.name, amount: v.amount })) }),
    });
    if (!ok || !data.success) {
      setError(data.message || 'Gagal buat kode.');
      return;
    }
    setCreated(data);
    setPickItems([]);
    refreshOffers();
  }

  async function fetchTradeReady(page = tradePage, q = tradeQ) {
    setTradeLoading(true);
    try {
      const { data } = await fetchJson(`/api/trade/offers?q=${encodeURIComponent(q)}&page=${page}`, { ms: 8000 }).catch(() => ({ data: {} }));
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
    const { data } = await fetchJson('/api/trade/create', { ms: 8000 }).catch(() => ({ data: {} }));
    if (data.success) setMyOffers(data.offers || []);
    fetchTradeReady(tradePage, tradeQ);
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
    await fetchJson(`/api/trade/create?code=${encodeURIComponent(code)}`, { method: 'DELETE', ms: 8000 }).catch(() => ({}));
    refreshOffers();
  }

  async function loadPreviewFor(code) {
    setError('');
    setPreview(null);
    setResult(null);
    setCheck(null);
    setGiveItems([]);
    setInCode(code);
    const { ok, data } = await fetchJson(`/api/trade/offer?code=${encodeURIComponent(code)}`, { ms: 8000 }).catch(() => ({ ok: false, data: {} }));
    if (!ok || !data.success) {
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
    if (!preview || !giveItems.length) {
      setCheck(null);
      return;
    }
    (async () => {
      try {
        const myItems = encodeURIComponent(JSON.stringify(giveItems.map((v) => ({ charName: v.name, amount: v.amount }))));
        const { data } = await fetchJson(
          `/api/trade/offer?code=${encodeURIComponent(inCode)}&myItems=${myItems}`,
          { ms: 8000 },
        ).catch(() => ({ data: {} }));
        if (data.success) {
          setPreview(data);
          setCheck(data.mineOk);
        }
      } catch {
        // abaikan, validasi final tetap di server
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giveItems]);

  async function onAccept(e) {
    e.preventDefault();
    setError('');
    if (!giveItems.length) {
      setError('Pilih kartumu dulu (maks 10).');
      return;
    }
    const { ok, data } = await fetchJson('/api/trade/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inCode, myItems: giveItems.map((v) => ({ charName: v.name, amount: v.amount })) }),
    });
    if (!ok || !data.success) {
      setError(data.message || 'Gagal tukar kartu.');
      return;
    }
    setResult({ received: data.received, given: data.given });
    setPreview(null);
    setGiveItems([]);
    refreshOffers();
  }

  function onSearchTrade(e) {
    e.preventDefault();
    setTradePage(1);
    setTradeQ(tradeQInput.trim());
  }

  const tierOf = (name) => (myCards.find((c) => c.name === name)?.tier || 'Common');
  const giveWithTier = giveItems.map((v) => ({ charName: v.name, rarity: tierOf(v.name), amount: v.amount }));
  const fair = preview?.offer?.items
    ? fairBundleLabel(preview.offer.items, giveWithTier)
    : null;

  if (loading) {
    return <PageSkeleton username={me?.username} title="Trade Kartu" lines={[50, 85]} />;
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
                style={{ flex: 1, minWidth: 0 }}
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
                  <span style={{ color: 'var(--body)' }}> — {bundleText(o.items || [{ charName: o.charName, rarity: o.rarity, amount: o.amount }])}</span>
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
            <div className="section-title">Aturan nilai trade (maks 10 kartu per sisi)</div>
            <div style={{ fontSize: 12, color: 'var(--body)', lineHeight: 1.7 }}>
              • Semua kartu satu tier: bebas (jumlah berapapun)<br />
              • Beda tier: total nilai harus sama — C1 • R2 • E4 • L8 • M16<br />
              • Contoh: 2 Rare (4) untuk 1 Epic (4) ✓ • 5 Epic (20) untuk 5 Rare (10) ✗<br />
              • Tidak boleh ada kartu yang sama di kedua sisi
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
                <BundlePicker cards={myCards} value={pickItems} onChange={setPickItems} />
                <button className="btn" type="submit" disabled={myOffers.length >= 10 || !pickItems.length}>
                  Buat Kode Angka
                </button>
              </form>
              {created ? (
                <div>
                  <div className="trade-code-big">{created.code}</div>
                  <div className="trade-hint">
                    {bundleText(created.items || [{ charName: created.charName, amount: created.amount }])} — berlaku 10 menit, sekali pakai. Bagikan kode ini ke lawan
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
                      <span style={{ marginLeft: 10, color: 'var(--body)' }}>{bundleText(o.items || [{ charName: o.charName, amount: o.amount }])}</span>
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
                      <strong>{bundleText(preview.offer.items || [{ charName: preview.offer.charName, rarity: preview.offer.rarity, amount: preview.offer.amount }])}</strong>{' '}
                      milik @{preview.offer.ownerUsername}
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
                  <div className="section-title" style={{ marginTop: 12 }}>Kartumu sebagai gantinya (maks 10)</div>
                  <BundlePicker cards={myCards} value={giveItems} onChange={setGiveItems} />
                  {fair && giveItems.length ? (
                    <div
                      className={fair.ok ? 'trade-fair ok' : 'trade-fair warn'}
                      role="status"
                    >
                      {fair.ok ? '✓' : '⚠'} {fair.text}
                    </div>
                  ) : null}
                  {check && giveItems.length ? (
                    !check.enough ? (
                      <div className="alert-error">
                        Ada kartu yang tidak cukup: {(check.items || []).filter((p) => !p.enough).map((p) => `${p.charName} (punya ${p.quantity})`).join(', ') || 'cek kepemilikan'}.
                      </div>
                    ) : check.same ? (
                      <div className="alert-error">Ada kartu yang sama di kedua sisi.</div>
                    ) : !check.ruleOk ? (
                      <div className="alert-error">{check.ruleMessage}</div>
                    ) : null
                  ) : null}
                  <button
                    className="btn"
                    type="submit"
                    disabled={!giveItems.length || preview.offer.isMine || !(check && check.ok)}
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
                      Kamu menerima <strong>{bundleText(result.received || (result.received?.charName ? [result.received] : []))}</strong>{' '}
                      dan memberikan <strong>{bundleText(result.given || (result.given?.charName ? [result.given] : []))}</strong>.
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
