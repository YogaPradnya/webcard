'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import Rara from '@/components/Rara';
import { fetchJson, fetchLenient } from '@/lib/fetchJson';
import { postJson } from '@/lib/postJson';
import { useMe } from '@/hooks/useMe';
import { idr, paymentLabel, fmtDate } from '@/lib/money';

export default function ShopPage() {
  const { me } = useMe(false); // katalog publik; data user hanya bila login
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
  const [qrOrder, setQrOrder] = useState(null);
  const [simulating, setSimulating] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function fmtSisa(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Buka panel QR dari data order (hasil buat order baru / baris order lama).
  function openQr({ orderId, qrUrl, qrContent, checkoutUrl, channel, amountIdr, label, createdAt }) {
    setError('');
    setSuccessMsg('');
    setQrOrder({
      orderId,
      qrUrl: qrUrl || '',
      qrContent: qrContent || '',
      checkoutUrl: checkoutUrl || '',
      channel: channel || 'QRIS',
      amountIdr: Number(amountIdr) || 0,
      label: label || 'Pembelian',
      createdAt: Number(createdAt) || Date.now(),
    });
  }

  function orderLabel(o) {
    return o.kind === 'xp'
      ? `Top-Up ${Number(o.xpAmount || 0).toLocaleString('id-ID')} XP`
      : `Slot Pajangan x${o.qty || 1}`;
  }

  async function simulatePay(orderId) {
    if (!orderId) return;
    setSimulating(orderId);
    setError('');
    setSuccessMsg('');
    try {
      const { ok, data } = await postJson('/api/shop/order/simulate', { orderId });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal simulasi pembayaran.');
        return;
      }
      const o = orders.find((x) => x.orderId === orderId);
      const what = o ? (o.kind === 'xp' ? `+${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `+${o.qty} slot pajangan`) : (qrOrder?.label || 'item');
      setSuccessMsg(`Simulasi pembayaran sukses! ${what} sudah masuk.`);
      setQrOrder(null);
      await load({ quiet: true });
    } catch {
      setError('Gagal menghubungi server untuk simulasi pembayaran.');
    } finally {
      setSimulating('');
    }
  }

  async function checkOrder(orderId, opts = {}) {
    if (!orderId) return;
    const quiet = Boolean(opts.quiet);
    if (!quiet) {
      setChecking(orderId);
      setSuccessMsg('');
    }
    let paidFound = false;
    try {
      const { data } = await fetchJson('/api/shop/order/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!data.success && data.message) {
        if (!quiet) setError(data.message);
      } else if (data.status === 'paid') {
        paidFound = true;
        const o = orders.find((x) => x.orderId === orderId);
        const what = o ? (o.kind === 'xp' ? `+${Number(o.xpAmount).toLocaleString('id-ID')} XP` : `+${o.qty} slot pajangan`) : (qrOrder?.label || 'pembayaran');
        setSuccessMsg(`Pembayaran lunas! ${what} sudah masuk. 🎉`);
        setQrOrder(null);
      }
    } catch {
      // abaikan, user bisa tekan tombol Cek manual
    } finally {
      if (!quiet) setChecking('');
    }
    if (paidFound) {
      await load({ quiet: true });
    } else if (quiet) {
      // Auto-cek: cukup segarkan daftar order (hemat request).
      try {
        const oData = await fetchLenient('/api/shop/orders');
        if (oData.success) setOrders(oData.orders || []);
      } catch { /* abaikan */ }
    } else {
      await load({ quiet: true });
    }
  }

  async function load(opts = {}) {
    if (!opts.quiet) setError('');
    try {
      const catData = await fetchLenient('/api/shop/packages');
      if (catData.success) setCatalog(catData);
      if (me) {
        const [sData, oData, pData] = await Promise.all([fetchLenient('/api/shop/slots'), fetchLenient('/api/shop/orders'), fetchLenient('/api/profile')]);
        if (sData.success) setSlots(sData.slots || []);
        if (oData.success) setOrders(oData.orders || []);
        if (pData.success && Number.isFinite(Number(pData.profile?.xp))) setMyXp(Number(pData.profile.xp));
      }
    } catch {
      if (!opts.quiet) setError('Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Auto-cek berkala selama panel QR terbuka (callback tak menjangkau localhost).
  useEffect(() => {
    if (!qrOrder?.orderId) return;
    const t = setInterval(() => { checkOrder(qrOrder.orderId, { quiet: true }); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOrder?.orderId]);

  function payAgain(order) {
    if (!me || !order) return;
    if (!order.qrUrl && !order.checkoutUrl) return;
    openQr({
      orderId: order.orderId,
      qrUrl: order.qrUrl,
      qrContent: order.qrContent,
      checkoutUrl: order.checkoutUrl,
      channel: order.payChannel,
      amountIdr: order.amountIdr,
      label: orderLabel(order),
      createdAt: order.createdAt,
    });
  }

  async function pay(body, label) {
    if (paying || !me) return;
    if (!catalog?.payment?.configured) {
      setError('Pembayaran belum dikonfigurasi. Hubungi admin.');
      return;
    }
    setPaying(label);
    setError('');
    setSuccessMsg('');
    try {
      const { ok, data } = await postJson('/api/shop/order', body, { ms: 22000 });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal membuat pembayaran.');
        return;
      }
      let amountIdr = 0;
      let what = 'Pembelian';
      if (body.kind === 'xp') {
        const p = (catalog?.xpPacks || []).find((x) => x.id === body.packId);
        amountIdr = Number(p?.priceIdr) || 0;
        what = `Top-Up ${Number(p?.xp || 0).toLocaleString('id-ID')} XP`;
      } else {
        amountIdr = (catalog?.slot?.priceIdr || 10000) * (Number(body.qty) || 1);
        what = `Slot Pajangan x${body.qty}`;
      }
      openQr({
        orderId: data.orderId,
        qrUrl: data.qrUrl,
        qrContent: data.qrContent,
        checkoutUrl: data.checkoutUrl,
        channel: data.qrChannel,
        amountIdr,
        label: what,
        createdAt: Date.now(),
      });
      await load({ quiet: true });
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
  const ttlMs = catalog?.payment?.orderTtlMs || 15 * 60 * 1000;
  const qrLeft = qrOrder ? qrOrder.createdAt + ttlMs - nowTick : 0;

  if (!loading && catalog && !shopOn) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="brand"><h1>Shop</h1></div>
            <div className="card">
              <div className="empty-state">
                <Rara size={104} className="rara-bob" />
                <div className="section-title" style={{ margin: 0 }}>Segera hadir 🛠️</div>
                <div style={{ fontSize: 13, color: 'var(--body)' }}>
                  Toko Top-Up XP dan Slot Kartu Pajangan sedang disiapkan dan akan segera dibuka.
                </div>
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
          {qrOrder ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Pembayaran QRIS via Tripay — {qrOrder.label}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {qrOrder.qrUrl ? (
                  <img
                    src={qrOrder.qrUrl}
                    alt="QRIS pembayaran"
                    style={{ width: 220, height: 220, objectFit: 'contain', background: '#fff', borderRadius: 12, padding: 8, border: '1px solid var(--hairline)' }}
                  />
                ) : null}
                <div style={{ flex: '1 1 240px', fontSize: 13, lineHeight: 1.9 }}>
                  <div><b>Order ID:</b> {qrOrder.orderId}</div>
                  <div><b>Nominal:</b> {idr(qrOrder.amountIdr)}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                    Total akhir mengikuti halaman pembayaran Tripay (termasuk biaya layanan bila ada).
                  </div>
                  <div><b>Berlaku:</b> {qrLeft > 0 ? fmtSisa(qrLeft) : 'kadaluarsa — buat order baru'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Scan QR dengan aplikasi bank / e-wallet yang mendukung QRIS. Status tercentang otomatis — atau tekan Cek Status.
                  </div>
                  {catalog?.payment?.simulation || qrOrder.channel?.includes('Simulasi') ? (
                    <div style={{ background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.35)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--body)', margin: '4px 0 8px' }}>
                      <b>Mode Simulasi Dev:</b> Karena gateway pihak ketiga sedang ditutup sementara, pembayaran dapat disimulasikan secara instan untuk pengujian.
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {catalog?.payment?.simulation || qrOrder.channel?.includes('Simulasi') ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ width: 'auto', padding: '0 16px', background: 'var(--success, #22c55e)', color: '#fff', border: 'none', fontWeight: 800 }}
                        disabled={simulating === qrOrder.orderId}
                        onClick={() => simulatePay(qrOrder.orderId)}
                      >
                        {simulating === qrOrder.orderId ? 'Memproses...' : '⚡ Bayar Instan (Simulasi Dev)'}
                      </button>
                    ) : null}
                    {qrOrder.checkoutUrl ? (
                      <a
                        className="btn"
                        style={{ width: 'auto', padding: '0 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        href={qrOrder.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Buka Halaman Pembayaran
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: 'auto', minHeight: 0, padding: '8px 14px', fontSize: 13 }}
                      disabled={checking === qrOrder.orderId}
                      onClick={() => checkOrder(qrOrder.orderId)}
                    >
                      {checking === qrOrder.orderId ? '...' : 'Cek Status'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: 'auto', minHeight: 0, padding: '8px 14px', fontSize: 13 }}
                      onClick={() => setQrOrder(null)}
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
              XP otomatis masuk setelah pembayaran sukses. Bayar via QRIS (scan dari aplikasi bank / e-wallet).
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
                    <span style={{ fontSize: 12, fontWeight: 800, color: o.status === 'paid' ? 'var(--success)' : o.status === 'pending' ? '#b8860b' : o.status === 'refund' ? '#b8860b' : 'var(--error)' }}>
                      {o.status === 'paid' ? 'Lunas' : o.status === 'pending' ? `Menunggu bayar${left > 0 ? ` • ${fmtSisa(left)}` : ''}` : o.status === 'expired' ? 'Kadaluarsa' : o.status === 'refund' ? 'Refund' : 'Gagal'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
                    {o.status === 'pending' ? (
                      <>
                        {o.qrUrl || o.checkoutUrl ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ width: 'auto', minHeight: 0, padding: '4px 10px', fontSize: 12 }}
                            onClick={(e) => { e.stopPropagation(); payAgain(o); }}
                          >
                            Bayar
                          </button>
                        ) : null}
                        {catalog?.payment?.simulation || o.payChannel?.includes('Simulasi') ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', minHeight: 0, padding: '4px 8px', fontSize: 11, color: 'var(--success, #22c55e)', fontWeight: 700 }}
                            disabled={simulating === o.orderId}
                            onClick={(e) => { e.stopPropagation(); simulatePay(o.orderId); }}
                          >
                            {simulating === o.orderId ? '...' : 'Bayar (Simulasi)'}
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
