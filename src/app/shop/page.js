'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

function idr(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`;
}

function loadSnapJs(src, clientKey) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.snap) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-client-key', clientKey);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat Snap.js'));
    document.body.appendChild(s);
  });
}

function SlotEditor({ slot, saving, onSave }) {
  const [name, setName] = useState(slot.name || '');
  const [imageUrl, setImageUrl] = useState(slot.imageUrl || '');
  const [borderType, setBorderType] = useState(slot.borderType || 'classic');
  const [borderColor, setBorderColor] = useState(slot.borderColor || '#a855f7');
  const locked = slot.editsLeft <= 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(slot.id, { name, imageUrl, borderType, borderColor });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {slot.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.imageUrl} alt={slot.name} width={54} height={72} style={{ objectFit: 'cover', borderRadius: 8, background: 'var(--hairline-soft)' }} loading="lazy" />
        ) : (
          <div style={{ width: 54, height: 72, borderRadius: 8, background: 'var(--hairline-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>?</div>
        )}
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 800 }}>{slot.name}</div>
          <div style={{ color: locked ? '#ef4444' : 'var(--muted)' }}>
            {locked ? 'Jatah ubah habis (3/3)' : `Sisa ubah: ${slot.editsLeft}/3`}
          </div>
        </div>
      </div>
      <input className="input" placeholder="Nama kartu (maks 40)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={locked} aria-label="Nama kartu" />
      <input className="input" placeholder="URL gambar https://... (opsional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={locked} aria-label="URL gambar" />
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="select" value={borderType} onChange={(e) => setBorderType(e.target.value)} disabled={locked} aria-label="Border" style={{ flex: 1 }}>
          {['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {borderType === 'custom' ? (
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(borderColor) ? borderColor : '#a855f7'} onChange={(e) => setBorderColor(e.target.value)} disabled={locked} aria-label="Warna custom" style={{ width: 48, height: 44 }} />
        ) : null}
      </div>
      <button className="btn btn-ghost" type="submit" disabled={locked || saving} style={{ minHeight: 0, padding: '8px 12px' }}>
        {saving ? 'Menyimpan...' : 'Simpan (pakai 1 jatah ubah)'}
      </button>
    </form>
  );
}

export default function ShopPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [slots, setSlots] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState('');
  const [slotQty, setSlotQty] = useState(1);
  const [savingSlot, setSavingSlot] = useState(0);
  const snapReady = useRef(false);

  async function load() {
    setError('');
    try {
      const catRes = await fetch('/api/shop/packages');
      const catData = await catRes.json().catch(() => ({}));
      if (catRes.ok && catData.success) setCatalog(catData);
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (meRes.ok && meData.success) {
        setMe(meData);
        const [sRes, oRes] = await Promise.all([fetch('/api/shop/slots'), fetch('/api/shop/orders')]);
        const sData = await sRes.json().catch(() => ({}));
        if (sData.success) setSlots(sData.slots || []);
        const oData = await oRes.json().catch(() => ({}));
        if (oData.success) setOrders(oData.orders || []);
      }
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

  async function pay(body, label) {
    if (paying || !me) return;
    if (!catalog?.payment?.configured) {
      setError('Pembayaran belum dikonfigurasi. Hubungi admin.');
      return;
    }
    setPaying(label);
    setError('');
    try {
      const res = await fetch('/api/shop/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal membuat pembayaran.');
        return;
      }
      if (!snapReady.current) {
        await loadSnapJs(catalog.payment.snapJsUrl, catalog.payment.clientKey);
        snapReady.current = true;
      }
      window.snap.pay(data.snapToken, {
        onSuccess: () => load(),
        onPending: () => load(),
        onClose: () => load(),
      });
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setPaying('');
    }
  }

  async function saveSlot(slotId, form) {
    setSavingSlot(slotId);
    setError('');
    try {
      const res = await fetch('/api/shop/slot/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal simpan kartu.');
        return;
      }
      await load();
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setSavingSlot(0);
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

  const maxSlots = catalog?.slot?.maxPerUser || 50;
  const slotRoom = Math.max(0, maxSlots - slots.length);

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Shop</h1></div>
          {error ? <div className="alert-error">{error}</div> : null}
          {!me ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13 }}>
                Kamu belum login. Katalog bisa dilihat, tapi untuk membeli harus login dulu.{' '}
                <Link href="/login" style={{ color: 'var(--link)', fontWeight: 800 }}>Masuk di sini</Link>
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Top-Up XP</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              XP otomatis masuk setelah pembayaran sukses. Bayar via QRIS, virtual account, e-wallet, atau gerai retail (Midtrans).
            </div>
            <div className="title-grid">
              {(catalog?.xpPacks || []).map((p) => (
                <div key={p.id} className="title-tile earned">
                  <div className="title-name">{p.xp.toLocaleString('id-ID')} XP</div>
                  <div className="title-desc">{idr(p.priceIdr)} • bonus {p.bonusPct}%</div>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 0, padding: '8px 10px', marginTop: 8, fontSize: 13 }}
                    disabled={!me || paying === p.id}
                    onClick={() => pay({ kind: 'xp', packId: p.id }, p.id)}
                  >
                    {!me ? 'Login dulu' : paying === p.id ? '...' : `Beli ${idr(p.priceIdr)}`}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Slot Kartu Pajangan ({slots.length}/{maxSlots})</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              {catalog?.slot?.desc} Harga {idr(catalog?.slot?.priceIdr || 10000)}/slot.
            </div>
            {me ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <div className="stepper">
                  <button type="button" className="btn btn-ghost" style={{ width: 44 }} onClick={() => setSlotQty((q) => Math.max(1, q - 1))} disabled={slotQty <= 1}>−</button>
                  <span className="stepper-val">{slotQty} slot</span>
                  <button type="button" className="btn btn-ghost" style={{ width: 44 }} onClick={() => setSlotQty((q) => Math.min(Math.min(10, slotRoom), q + 1))} disabled={slotQty >= Math.min(10, slotRoom)}>+</button>
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ width: 'auto', padding: '0 20px' }}
                  disabled={slotRoom <= 0 || paying === 'slot'}
                  onClick={() => pay({ kind: 'slot', qty: slotQty }, 'slot')}
                >
                  {slotRoom <= 0 ? 'Slot penuh (50/50)' : paying === 'slot' ? '...' : `Beli ${idr((catalog?.slot?.priceIdr || 10000) * slotQty)}`}
                </button>
              </div>
            ) : null}
            {me && slots.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Belum punya slot. Beli dulu di atas.</div>
            ) : null}
            {slots.map((s) => (
              <div key={s.id} className="user-row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <SlotEditor slot={s} saving={savingSlot === s.id} onSave={saveSlot} />
              </div>
            ))}
          </div>

          {me && orders.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Order terakhir</div>
              {orders.map((o) => (
                <div className="user-row" key={o.orderId}>
                  <span style={{ fontWeight: 700 }}>{o.kind === 'xp' ? `Top-Up ${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `Slot x${o.qty}`}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{idr(o.amountIdr)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: o.status === 'paid' ? 'var(--success)' : o.status === 'pending' ? '#eab308' : '#ef4444' }}>
                    {o.status === 'paid' ? 'Lunas' : o.status === 'pending' ? 'Menunggu bayar' : o.status === 'expired' ? 'Kadaluarsa' : 'Gagal'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="card">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Dengan membeli, Anda menyetujui{' '}
              <Link href="/terms" style={{ color: 'var(--link)', textDecoration: 'underline' }}>Syarat & Ketentuan</Link>{' '}
              termasuk kebijakan refund produk digital.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
