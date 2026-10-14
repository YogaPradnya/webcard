'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';

function idr(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`;
}

function paymentLabel(t) {
  const map = { qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', bank_transfer: 'Virtual Account', echannel: 'Mandiri Bill', credit_card: 'Kartu Kredit', cstore: 'Gerai Retail' };
  return map[String(t || '')] || (t ? String(t).toUpperCase() : '-');
}

function fmtDate(ts) {
  if (!ts) return '-';
  try {
    return new Date(Number(ts)).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
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
  const [checking, setChecking] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [myXp, setMyXp] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const snapReady = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function fmtSisa(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  async function checkOrder(orderId) {
    if (!orderId) return;
    setChecking(orderId);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/shop/order/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success && data.message) {
        setError(data.message);
      } else if (data.status === 'paid') {
        const o = orders.find((x) => x.orderId === orderId);
        const what = o
          ? (o.kind === 'xp' ? `+${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `+${o.qty} slot pajangan`)
          : 'pembayaran';
        setSuccessMsg(`Pembayaran lunas! ${what} sudah masuk. 🎉`);
      }
    } catch {
      // abaikan, user bisa tekan tombol Cek manual
    } finally {
      setChecking('');
      await load();
    }
  }

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
        const [sRes, oRes, pRes] = await Promise.all([fetch('/api/shop/slots'), fetch('/api/shop/orders'), fetch('/api/profile')]);
        const sData = await sRes.json().catch(() => ({}));
        if (sData.success) setSlots(sData.slots || []);
        const oData = await oRes.json().catch(() => ({}));
        if (oData.success) setOrders(oData.orders || []);
        const pData = await pRes.json().catch(() => ({}));
        if (pData.success && Number.isFinite(Number(pData.profile?.xp))) setMyXp(Number(pData.profile.xp));
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

  async function payAgain(order) {
    if (paying || !me || !order?.snapToken) return;
    setPaying(order.orderId);
    setError('');
    setSuccessMsg('');
    try {
      if (!snapReady.current) {
        await loadSnapJs(catalog.payment.snapJsUrl, catalog.payment.clientKey);
        snapReady.current = true;
      }
      window.snap.pay(order.snapToken, {
        onSuccess: () => checkOrder(order.orderId),
        onPending: () => checkOrder(order.orderId),
        onClose: () => checkOrder(order.orderId),
      });
    } catch {
      setError('Tidak bisa membuka pembayaran.');
    } finally {
      setPaying('');
    }
  }

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
        onSuccess: () => checkOrder(data.orderId),
        onPending: () => checkOrder(data.orderId),
        onClose: () => checkOrder(data.orderId),
      });
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setPaying('');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Shop" />;
  }

  const maxSlots = catalog?.slot?.maxPerUser || 50;
  const slotRoom = Math.max(0, maxSlots - slots.length);
  const shopOn = Boolean(catalog?.enabled);

  if (!loading && catalog && !shopOn) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="brand"><h1>Shop</h1></div>
            <div className="card">
              <div className="section-title">Segera hadir 🛠️</div>
              <div style={{ fontSize: 13, color: 'var(--body)' }}>
                Toko Top-Up XP dan Slot Kartu Pajangan sedang disiapkan dan akan segera dibuka.
              </div>
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
          <div className="brand"><h1>Shop</h1></div>
          <ErrorRetry message={error} onRetry={load} />
          {successMsg ? (
            <div className="trade-fair ok" role="status" style={{ marginBottom: 16 }}>{successMsg}</div>
          ) : null}
          {!me ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13 }}>
                Kamu belum login. Katalog bisa dilihat, tapi untuk membeli harus login dulu.{' '}
                <Link href="/login" style={{ color: 'var(--link)', fontWeight: 800 }}>Masuk di sini</Link>
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Top-Up XP{myXp != null ? ` (kamu: ${myXp.toLocaleString('id-ID')} XP)` : ''}</div>
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
              {orders.map((o) => {
                const ttl = catalog?.payment?.orderTtlMs || 15 * 60 * 1000;
                const left = o.status === 'pending' ? (o.createdAt + ttl - nowTick) : 0;
                const open = expandedOrder === o.orderId;
                return (
                <div key={o.orderId}>
                <div
                  className="user-row"
                  onClick={() => setExpandedOrder(open ? null : o.orderId)}
                  style={{ cursor: 'pointer' }}
                  title="Ketuk untuk detail"
                >
                  <span style={{ fontWeight: 700 }}>{o.kind === 'xp' ? `Top-Up ${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `Slot x${o.qty}`}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{idr(o.amountIdr)}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: o.status === 'paid' ? 'var(--success)' : o.status === 'pending' ? '#b8860b' : 'var(--error)' }}>
                      {o.status === 'paid' ? 'Lunas' : o.status === 'pending' ? `Menunggu bayar${left > 0 ? ` • ${fmtSisa(left)}` : ''}` : o.status === 'expired' ? 'Kadaluarsa' : 'Gagal'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
                    {o.status === 'pending' ? (
                      <>
                        {o.snapToken ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ width: 'auto', minHeight: 0, padding: '4px 10px', fontSize: 12 }}
                            disabled={paying === o.orderId}
                            onClick={(e) => { e.stopPropagation(); payAgain(o); }}
                          >
                            {paying === o.orderId ? '...' : 'Bayar'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: 'auto', minHeight: 0, padding: '4px 10px', fontSize: 12 }}
                          disabled={checking === o.orderId}
                          onClick={(e) => { e.stopPropagation(); checkOrder(o.orderId); }}
                        >
                          {checking === o.orderId ? '...' : 'Cek Status'}
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
                {open ? (
                  <div style={{ fontSize: 12, color: 'var(--body)', background: 'var(--hairline-soft)', borderRadius: 8, padding: '10px 12px', margin: '0 0 8px', lineHeight: 1.8 }}>
                    <div><b>Order ID:</b> {o.orderId}</div>
                    <div><b>Dibuat:</b> {fmtDate(o.createdAt)}</div>
                    {o.paidAt ? <div><b>Lunas:</b> {fmtDate(o.paidAt)}</div> : null}
                    <div><b>Metode:</b> {paymentLabel(o.paymentType)}</div>
                    <div><b>Nominal:</b> {idr(o.amountIdr)}</div>
                    <div><b>Isi:</b> {o.kind === 'xp' ? `+${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `+${o.qty} slot pajangan`}</div>
                  </div>
                ) : null}
                </div>
                );
              })}
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
