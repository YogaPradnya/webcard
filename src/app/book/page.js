'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton } from '@/components/PageState';
import ConfirmModal from '@/components/ConfirmModal';
import RetryAlert from '@/components/RetryAlert';
import { optImg } from '@/lib/images';

const TIERS = ['All', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];
const PAGE_SIZE = 24;

const TIER_COLORS = {
  Mythic: '#e5484d',
  Legendary: '#eab308',
  Epic: '#a855f7',
  Rare: '#2c67e9',
  Common: '#9aa3b2',
};

const DISPLAY_BORDER_FALLBACK = {
  gold: '#eab308',
  rainbow: '#a855f7',
  neon: '#22d3ee',
  sakura: '#f9a8d4',
  shadow: '#111827',
  classic: '#9aa3b2',
};

function displayBorderColor(c) {
  if (!c) return '#9aa3b2';
  if (c.borderType === 'custom' && c.borderColor) return c.borderColor;
  return DISPLAY_BORDER_FALLBACK[c.borderType] || '#9aa3b2';
}

function displayCardStyle(c) {
  return { borderColor: displayBorderColor(c) };
}

function shortName(name) {
  const s = String(name || '');
  return s.length > 20 ? s.slice(0, 20) + '...' : s;
}

const EFFECT_LABELS = {
  none: '-',
  heavy: 'Heavy',
  crit: 'Crit',
  burn: 'Burn',
  double: 'Double',
  shield: 'Shield',
  slam: 'Stun',
  bulwark: 'Shield+',
  heal: 'Heal',
  regen: 'Regen',
  energize: 'Heal+Cons',
  surge: 'Cons+',
  weaken: 'Weaken',
  focus: 'Fokus',
};

const SORTS = [
  ['tier', 'Tier'],
  ['name', 'Nama A-Z'],
  ['power', 'Power tertinggi'],
  ['level', 'Level tertinggi'],
];

function effectTone(effect) {
  const e = String(effect || 'none');
  if (['heal', 'regen', 'energize'].includes(e)) return 'fx-heal';
  if (['shield', 'bulwark'].includes(e)) return 'fx-shield';
  if (['surge', 'focus'].includes(e)) return 'fx-assist';
  if (e === 'none') return '';
  return 'fx-dmg';
}

export default function BookPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [ownedCount, setOwnedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tier, setTier] = useState('All');
  const [query, setQuery] = useState('');
  const [ownedFilter, setOwnedFilter] = useState('all');
  const [animeFilter, setAnimeFilter] = useState('All');
  const [sort, setSort] = useState('tier');
  const [page, setPage] = useState(1);
  const [flipped, setFlipped] = useState(null);
  const [showcaseBusy, setShowcaseBusy] = useState('');
  const [evoTarget, setEvoTarget] = useState(null);
  const [tab, setTab] = useState('book');
  const [displayCards, setDisplayCards] = useState([]);
  const [displayFlipped, setDisplayFlipped] = useState(null);
  const [customSlots, setCustomSlots] = useState([]);
  const [shopOn, setShopOn] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null); // { kind: 'slot'|'display', id }
  const [slotForm, setSlotForm] = useState({ name: '', imageUrl: '', borderType: 'classic', borderColor: '#a855f7', description: '' });
  const [savingSlot, setSavingSlot] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.success) {
        router.push('/login');
        return;
      }
      setMe(meData);

      const cardsRes = await fetch('/api/cards');
      const cardsData = await cardsRes.json().catch(() => ({}));
      if (!cardsRes.ok || !cardsData.success) {
        if (cardsRes.status === 401) {
          router.push('/login');
          return;
        }
        setError(cardsData.message || 'Gagal memuat kartu.');
        return;
      }
      setCards(cardsData.cards || []);
      setTotal(cardsData.total || 0);
      setOwnedCount(cardsData.ownedCount || 0);

      // Kartu pajangan (display-only): koleksi terpisah, tidak masuk book gacha.
      try {
        const dispRes = await fetch('/api/display');
        const dispData = await dispRes.json().catch(() => ({}));
        if (dispRes.ok && dispData.success) setDisplayCards(dispData.cards || []);
      } catch {
        // non-kritis: book gacha tetap tampil
      }
      // Slot custom (beli di Shop): dikelola di tab Pajangan.
      try {
        const [slotRes, shopRes] = await Promise.all([fetch('/api/shop/slots'), fetch('/api/shop/packages')]);
        const slotData = await slotRes.json().catch(() => ({}));
        if (slotRes.ok && slotData.success) setCustomSlots(slotData.slots || []);
        const shopData = await shopRes.json().catch(() => ({}));
        if (shopData.success) setShopOn(Boolean(shopData.enabled));
      } catch {
        // non-kritis
      }
    } catch {
      setError('Tidak bisa menghubungi server. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tier, query, ownedFilter, animeFilter, sort]);

  const animeList = useMemo(() => {
    const s = new Set(cards.map((c) => c.anime).filter(Boolean));
    return ['All', ...[...s].sort()];
  }, [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = cards.filter((c) => {
      if (tier !== 'All' && c.tier !== tier) return false;
      if (animeFilter !== 'All' && c.anime !== animeFilter) return false;
      if (ownedFilter === 'owned' && !c.owned) return false;
      if (ownedFilter === 'missing' && c.owned) return false;
      if (q && !`${c.name} ${c.anime}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      tier: (a, b) => {
        const order = { Mythic: 4, Legendary: 3, Epic: 2, Rare: 1, Common: 0 };
        return (order[b.tier] ?? 0) - (order[a.tier] ?? 0) || a.name.localeCompare(b.name);
      },
      name: (a, b) => a.name.localeCompare(b.name),
      power: (a, b) => (b.power || 0) - (a.power || 0),
      level: (a, b) => (b.level || 0) - (a.level || 0),
    }[sort] || ((a, b) => 0);
    return [...out].sort(by);
  }, [cards, tier, query, ownedFilter, animeFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Daftar pajangan gabungan: slot custom + kartu gift admin (1 koleksi, maks 50).
  const pajanganItems = useMemo(() => ([
    ...customSlots.map((s) => ({ kind: 'slot', key: `slot-${s.id}`, ...s })),
    ...displayCards.map((c) => ({ kind: 'display', key: `display-${c.id}`, ...c })),
  ]), [customSlots, displayCards]);
  const pajanganTotal = customSlots.length + displayCards.length;

  async function evolveCard(c) {
    if (!c.owned || showcaseBusy) return;
    setShowcaseBusy(`evo:${c.name}`);
    setError('');
    try {
      const res = await fetch('/api/cards/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charName: c.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal evolusi.');
        return;
      }
      setCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, level: data.level, power: data.power, quantity: data.quantity }
        : x));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
      setEvoTarget(null);
    }
  }

  async function toggleShowcase(c) {
    if (!c.owned || showcaseBusy) return;
    setShowcaseBusy(c.name);
    setError('');
    try {
      const res = await fetch('/api/cards/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charName: c.name, showcase: !c.showcase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal atur pajangan.');
        return;
      }
      setCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, showcase: !c.showcase }
        : (!c.showcase ? { ...x, showcase: false } : x)));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
    }
  }

  async function reloadPajangan() {
    try {
      const [slotRes, dispRes] = await Promise.all([fetch('/api/shop/slots'), fetch('/api/display')]);
      const slotData = await slotRes.json().catch(() => ({}));
      if (slotRes.ok && slotData.success) setCustomSlots(slotData.slots || []);
      const dispData = await dispRes.json().catch(() => ({}));
      if (dispRes.ok && dispData.success) setDisplayCards(dispData.cards || []);
    } catch {
      // abaikan
    }
  }

  function openSlotEditor(item) {
    setEditingSlot({ kind: item.kind, id: item.id });
    setSlotForm({
      name: item.kind === 'slot' && item.name === 'Kartu Custom' ? '' : (item.name || ''),
      imageUrl: item.imageUrl || '',
      borderType: item.borderType || 'classic',
      borderColor: item.borderColor || '#a855f7',
      description: item.description || '',
    });
    setError('');
  }

  async function uploadSlotFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError('Ukuran gambar maks 5MB.');
      return;
    }
    setUploadBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/shop/slot/image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal upload gambar.');
        return;
      }
      setSlotForm((prev) => ({ ...prev, imageUrl: data.imageUrl }));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setUploadBusy(false);
    }
  }

  async function saveSlot(e) {
    e.preventDefault();
    if (!editingSlot || savingSlot) return;
    setSavingSlot(true);
    setError('');
    try {
      const isDisplay = editingSlot.kind === 'display';
      const res = await fetch(isDisplay ? '/api/display/customize' : '/api/shop/slot/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isDisplay
          ? JSON.stringify({ id: editingSlot.id, imageUrl: slotForm.imageUrl, borderType: slotForm.borderType, borderColor: slotForm.borderColor, description: slotForm.description })
          : JSON.stringify({ slotId: editingSlot.id, ...slotForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal simpan kartu.');
        return;
      }
      setEditingSlot(null);
      await reloadPajangan();
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setSavingSlot(false);
    }
  }

  async function toggleDisplayShowcase(c) {
    if (showcaseBusy) return;
    setShowcaseBusy(`display:${c.name}`);
    setError('');
    try {
      const res = await fetch('/api/display/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.name, showcase: !c.showcase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal atur pajangan.');
        return;
      }
      setDisplayCards((prev) => prev.map((x) => x.name === c.name
        ? { ...x, showcase: !c.showcase }
        : (!c.showcase ? { ...x, showcase: false } : x)));
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setShowcaseBusy('');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Book Kartu" lines={[40, 90]} />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Book Kartu</h1>
          </div>

          {error ? (
            <RetryAlert message={error} onRetry={load} />
          ) : null}

          <div className="chip-row" role="tablist" aria-label="Tab koleksi">
            <button
              className={tab === 'book' ? 'chip active' : 'chip'}
              onClick={() => setTab('book')}
              aria-pressed={tab === 'book'}
            >
              Gacha ({ownedCount}/{total})
            </button>
            <button
              className={tab === 'display' ? 'chip active' : 'chip'}
              onClick={() => setTab('display')}
              aria-pressed={tab === 'display'}
            >
              Pajangan ({pajanganTotal})
            </button>
          </div>

          {tab === 'display' ? (
            <div>
              <div className="card" style={{ marginTop: 12 }}>
                <div className="section-title">Kartu Pajangan ({pajanganTotal}/50)</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  1 koleksi: slot custom + kartu gift admin. Display-only (tidak bisa battle/trade/gacha/convert). Tiap Simpan memakai 1 jatah ubah (maks 3x per kartu).{' '}
                  {shopOn ? (
                    <Link href="/shop" style={{ color: 'var(--link)', fontWeight: 800 }}>Beli slot di Shop</Link>
                  ) : null}
                </div>
                {pajanganItems.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Belum ada kartu pajangan. {shopOn ? (
                      <>Beli slot di <Link href="/shop" style={{ color: 'var(--link)', fontWeight: 800 }}>Shop</Link> atau tunggu gift admin.</>
                    ) : (
                      <>Kartu spesial hanya bisa di-gift admin dari dashboard.</>
                    )}
                  </div>
                ) : (
                  <div className="book-grid">
                    {pajanganItems.map((item) => {
                      if (item.kind === 'slot') {
                        const empty = !item.imageUrl && (item.name === 'Kartu Custom' || !item.name);
                        const locked = item.editsLeft <= 0;
                        return (
                          <div
                            key={item.key}
                            className="card-item owned"
                            style={empty ? { borderStyle: 'dashed', cursor: 'pointer' } : displayCardStyle({ borderType: item.borderType, borderColor: item.borderColor })}
                            title={empty ? 'Slot kosong — ketuk untuk isi' : `${item.name} — ketuk untuk ubah`}
                            onClick={() => { if (!locked) openSlotEditor(item); }}
                          >
                            {empty ? (
                              <div className="card-art gacha-noart" style={{ fontSize: 48, fontWeight: 800 }}>+</div>
                            ) : item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="card-art" src={optImg(item.imageUrl, 300)} alt={item.name} loading="lazy" decoding="async" />
                            ) : (
                              <div className="card-art" />
                            )}
                            <div className="card-meta">
                              <div className="card-name">{empty ? 'Slot kosong' : shortName(item.name)}</div>
                              <div className="card-anime">{empty ? 'ketuk untuk isi' : `Custom • sisa ubah ${item.editsLeft}/3`}</div>
                              {!empty && item.description ? (
                                <div className="card-anime" style={{ whiteSpace: 'pre-wrap' }}>{item.description.slice(0, 80)}</div>
                              ) : null}
                              {!empty && !locked ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                                  onClick={(ev) => { ev.stopPropagation(); openSlotEditor(item); }}
                                >
                                  Ubah
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      }
                      const c = item;
                      const locked = c.editsLeft <= 0;
                      return (
                        <div
                          key={c.key}
                          className={displayFlipped === c.name ? 'card-item owned flipped' : 'card-item owned'}
                          style={displayCardStyle(c)}
                          title={`${c.name} (ketuk untuk flip)`}
                          onClick={() => setDisplayFlipped((f) => (f === c.name ? null : c.name))}
                        >
                          <div className="flip-inner">
                            <div className="flip-front">
                              {c.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="card-art" src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" />
                              ) : (
                                <div className="card-art" />
                              )}
                              <div className="card-meta">
                                <div className="card-name">{shortName(c.name)}</div>
                                <div className="card-anime">Gift 🎁 • sisa ubah {c.editsLeft}/3</div>
                                <div className="card-stats">
                                  {c.showcase ? <span className="stat-tag showcase">Pajangan</span> : null}
                                </div>
                                {!locked ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                                    onClick={(e) => { e.stopPropagation(); openSlotEditor(c); }}
                                  >
                                    Ubah
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                                  disabled={showcaseBusy === `display:${c.name}`}
                                  onClick={(e) => { e.stopPropagation(); toggleDisplayShowcase(c); }}
                                >
                                  {showcaseBusy === `display:${c.name}` ? '...' : c.showcase ? 'Lepas Pajangan' : 'Jadikan Pajangan'}
                                </button>
                              </div>
                            </div>
                            <div className="flip-back" style={{ borderTop: `3px solid ${displayBorderColor(c)}` }}>
                              <span className="flip-role">{c.grade}</span>
                              <div className="flip-stat" style={{ whiteSpace: 'pre-wrap' }}>
                                {c.description || 'Display-only'}
                              </div>
                              <div className="flip-stat" style={{ color: 'var(--muted)' }}>
                                Gift admin • Display-only
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {editingSlot ? (
                  <form onSubmit={saveSlot} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, border: '1px dashed var(--hairline-strong)', borderRadius: 8 }}>
                    <div className="section-title" style={{ margin: 0 }}>
                      {editingSlot.kind === 'display' ? `Ubah "${slotForm.name}" (pakai 1 jatah ubah)` : 'Isi / Ubah kartu (pakai 1 jatah ubah)'}
                    </div>
                    {editingSlot.kind === 'slot' ? (
                      <input className="input" placeholder="Nama kartu (maks 40)" value={slotForm.name} maxLength={40} onChange={(e) => setSlotForm((f) => ({ ...f, name: e.target.value }))} aria-label="Nama kartu" />
                    ) : null}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="input" placeholder="URL gambar https://... (opsional)" value={slotForm.imageUrl} onChange={(e) => setSlotForm((f) => ({ ...f, imageUrl: e.target.value }))} aria-label="URL gambar" style={{ flex: 1 }} />
                      <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0 14px' }} disabled={uploadBusy} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                        {uploadBusy ? '...' : 'Upload'}
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={uploadSlotFile} aria-label="Upload gambar" />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Upload langsung ke Cloudinary (maks 5MB, JPG/PNG/WebP) atau tempel URL.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select className="select" value={slotForm.borderType} onChange={(e) => setSlotForm((f) => ({ ...f, borderType: e.target.value }))} aria-label="Border" style={{ flex: 1 }}>
                        {['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      {slotForm.borderType === 'custom' ? (
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(slotForm.borderColor) ? slotForm.borderColor : '#a855f7'} onChange={(e) => setSlotForm((f) => ({ ...f, borderColor: e.target.value }))} aria-label="Warna custom" style={{ width: 48, height: 44 }} />
                      ) : null}
                    </div>
                    <textarea className="input" placeholder="Deskripsi kartu (maks 280, opsional)" value={slotForm.description} maxLength={280} rows={2} onChange={(e) => setSlotForm((f) => ({ ...f, description: e.target.value }))} aria-label="Deskripsi kartu" style={{ resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" type="submit" disabled={savingSlot} style={{ flex: 1 }}>
                        {savingSlot ? 'Menyimpan...' : 'Simpan'}
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={() => setEditingSlot(null)} style={{ width: 'auto' }}>
                        Batal
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          ) : (
          <>
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {ownedCount}/{total} kartu terkumpul
        </div>
        <div className="progress-wrap">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: total ? `${Math.round((ownedCount / total) * 100)}%` : '0%' }}
            />
          </div>
        </div>

        <div className="book-toolbar">
          <input
            className="input"
            placeholder="Cari kartu / anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari kartu"
          />
        </div>
        <div className="book-filters">
          <select className="select" value={animeFilter} onChange={(e) => setAnimeFilter(e.target.value)} aria-label="Filter anime" style={{ maxWidth: 220 }}>
            {animeList.map((a) => (
              <option key={a} value={a}>{a === 'All' ? 'Semua anime' : a}</option>
            ))}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan" style={{ maxWidth: 200 }}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="chip-row" role="tablist" aria-label="Filter tier">
          {TIERS.map((t) => (
            <button
              key={t}
              className={tier === t ? 'chip active' : 'chip'}
              onClick={() => setTier(t)}
              aria-pressed={tier === t}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {[
            ['all', 'Semua'],
            ['owned', 'Punya'],
            ['missing', 'Belum punya'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={ownedFilter === value ? 'chip active' : 'chip'}
              onClick={() => setOwnedFilter(value)}
              aria-pressed={ownedFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          {filtered.length} hasil • hal {page}/{totalPages}
        </div>
      </div>

      <div className="book-grid" style={{ marginTop: 16 }}>
        {pageItems.map((c) => (
          <div
            key={c.name}
            className={
              c.owned
                ? flipped === c.name
                  ? `card-item owned flipped rar-${c.tier}`
                  : `card-item owned rar-${c.tier}`
                : 'card-item locked'
            }
            title={c.owned ? `${c.name} (ketuk untuk stat)` : c.name}
            onClick={() => {
              if (!c.owned) return;
              setFlipped((f) => (f === c.name ? null : c.name));
            }}
          >
            <div className="flip-inner">
              <div className="flip-front">
                <span className="tier-ribbon" style={c.owned ? { ['--tier']: TIER_COLORS[c.tier], background: TIER_COLORS[c.tier] } : undefined} />
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="card-art" src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" />
                ) : (
                  <div className="card-art" />
                )}
                <div className="card-meta">
                  <div className="card-name">{shortName(c.name)}</div>
                  <div className="card-anime">{c.anime} • {c.tier}</div>
                  {c.owned ? (
                    <div className="card-stats">
                      <span className="stat-tag">★{c.level}</span>
                      <span className="stat-tag power">PWR {c.power}</span>
                      {c.quantity > 1 ? <span className="stat-tag power">x{c.quantity}</span> : null}
                      {c.showcase ? <span className="stat-tag showcase">Pajangan</span> : null}
                    </div>
                  ) : null}
                  {c.owned && (c.level >= 4 ? c.quantity >= 5 : c.quantity >= 3) && c.level < 5 && c.tier !== 'Legendary' && c.tier !== 'Mythic' ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                      disabled={showcaseBusy === `evo:${c.name}`}
                      onClick={(e) => { e.stopPropagation(); setEvoTarget(c); }}
                    >
                      {showcaseBusy === `evo:${c.name}` ? '...' : `Evolusi ★${c.level + 1} (${c.level >= 4 ? '5' : '3'}→1)`}
                    </button>
                  ) : null}
                  {c.owned ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: '100%', minHeight: 0, padding: '4px 8px', fontSize: 11, marginTop: 6 }}
                      disabled={showcaseBusy === c.name}
                      onClick={(e) => { e.stopPropagation(); toggleShowcase(c); }}
                    >
                      {showcaseBusy === c.name ? '...' : c.showcase ? 'Lepas Pajangan' : 'Jadikan Pajangan'}
                    </button>
                  ) : null}
                </div>
              </div>
              {c.owned && c.stats ? (
                <div className="flip-back" style={{ borderTop: `3px solid ${TIER_COLORS[c.tier]}` }}>
                  <span className={`flip-role role-${c.stats.role}`}>{c.stats.role}</span>
                  <div className="flip-stat">
                    HP <b>{c.stats.hp}</b>
                  </div>
                  <div className="flip-stat">
                    ATK <b>{c.stats.basic}</b>
                  </div>
                  <div className="flip-stat">{c.stats.skillName}</div>
                  <div className="flip-stat">
                    Skill <b>{c.stats.skill}</b> / Cons <b>{c.stats.cons}</b>
                  </div>
                  <div className="flip-stat">
                    Efek <b className={effectTone(c.stats.effect)}>{EFFECT_LABELS[c.stats.effect] || c.stats.effect}</b>
                  </div>
                  {c.stats.skill2Name ? (
                    <>
                      <div className="flip-stat">{c.stats.skill2Name} ★5</div>
                      <div className="flip-stat">
                        Skill2 <b>{c.stats.skill2}</b> / Cons <b>{c.stats.cons2}</b>
                      </div>
                      <div className="flip-stat">
                        Efek <b className={effectTone(c.stats.effect2)}>{EFFECT_LABELS[c.stats.effect2] || c.stats.effect2}</b>
                      </div>
                    </>
                  ) : null}
                  <div className="flip-stat" style={{ color: 'var(--muted)' }}>
                    {c.tier}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, justifyContent: 'center' }}>
          <button className="btn btn-ghost" style={{ width: 'auto' }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Sebelumnya
          </button>
          <span style={{ fontSize: 12 }}>{page}/{totalPages}</span>
          <button className="btn btn-ghost" style={{ width: 'auto' }} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Berikutnya
          </button>
        </div>
      ) : null}

      {filtered.length === 0 && !error ? (
        <div className="card" style={{ marginTop: 20 }}>
          Tidak ada kartu yang cocok.
        </div>
      ) : null}
          {evoTarget ? (
            <ConfirmModal
              title="Evolusi kartu?"
              message={`${evoTarget.name} ★${evoTarget.level} → ★${evoTarget.level + 1}. ${evoTarget.level >= 4 ? 4 : 2} copy dipakai (sisa ${evoTarget.quantity - (evoTarget.level >= 4 ? 4 : 2)}).${evoTarget.level + 1 >= 5 ? ' Skill ke-2 terbuka!' : ''}`}
              confirmLabel="Evolusi"
              busy={showcaseBusy === `evo:${evoTarget.name}`}
              onCancel={() => setEvoTarget(null)}
              onConfirm={() => evolveCard(evoTarget)}
            />
          ) : null}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
