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
              XP otomatis masuk setelah pembayaran sukses. Bayar via QRIS (Midtrans).
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
            {me && slots.length > 0 ? (
              <div style={{ fontSize: 13 }}>
                Kamu punya {slots.length} slot. Atur kartunya di{' '}
                <Link href="/book" style={{ color: 'var(--link)', fontWeight: 800 }}>tab Pajangan Book</Link>.
              </div>
            ) : null}
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
