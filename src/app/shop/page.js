'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import { fetchJson, fetchLenient } from '@/lib/fetchJson';
import { postJson } from '@/lib/postJson';
import { useMe } from '@/hooks/useMe';
import { CS_HOURS, CS_EMAIL, CS_EMAIL_URL, CS_WHATSAPP, CS_WHATSAPP_URL } from '@/lib/contact';
import { LEGAL_LINKS } from '@/lib/legal';
import { idr, paymentLabel, fmtDate } from '@/lib/money';
import { XP_PACKS } from '@/lib/products';

function bonusCardsLabel(cards) {
  return Object.entries(cards || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([rarity, qty]) => `${Number(qty)} ${rarity}`)
    .join(' + ');
}

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
  const ordersRef = useRef([]);
  const refreshInFlight = useRef(false);
  const hasPending = orders.some((o) => o.status === 'pending' || o.status === 'processing');

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function fmtSisa(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Refresh ringan: order + XP saja (tanpa katalog/slot). Dipakai polling
  // selama ada order pending dan saat tab kembali aktif.
  const refreshOrders = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const [oData, pData] = await Promise.all([
        fetchLenient('/api/shop/orders'),
        fetchLenient('/api/profile'),
      ]);
      if (pData.success && Number.isFinite(Number(pData.profile?.xp))) {
        setMyXp(Number(pData.profile.xp));
      }
      if (!oData.success) return;
      const next = Array.isArray(oData.orders) ? oData.orders : [];
      const prev = ordersRef.current || [];
      const becamePaid = prev.find((p) => p.status !== 'paid'
        && next.some((n) => n.orderId === p.orderId && n.status === 'paid'));
      if (becamePaid) {
        const what = becamePaid.kind === 'xp'
          ? `+${Number(becamePaid.xpAmount || 0).toLocaleString('id-ID')} XP`
          : `+${becamePaid.qty || 1} slot pajangan`;
        const bonus = bonusCardsLabel(
          XP_PACKS.find((pack) => pack.id === becamePaid.ref)?.bonusCards,
        );
        setSuccessMsg(
          `Pembayaran lunas! ${what} sudah masuk.${bonus ? ` Bonus kartu: ${bonus}.` : ''} 🎉`,
        );
      }
      ordersRef.current = next;
      setOrders(next);
    } catch { /* polling best-effort */ } finally {
      refreshInFlight.current = false;
    }
  }, []);

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
      // Auto-cek: segarkan order + XP (hemat request, tanpa katalog/slot).
      await refreshOrders();
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

  // Jaga ref tetap sinkron bila order diubah oleh load()/checkOrder().
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Saat tab kembali aktif/fokus, langsung tarik status terbaru. Ini menutup
  // kasus browser yang selama ini menampilkan order basi sampai reload.
  useEffect(() => {
    if (!me) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshOrders();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [me, refreshOrders]);

  // Polling ringan selama masih ada order pending/processing. Berhenti sendiri
  // setelah semua lunas/kadaluarsa; tidak perlu WebSocket untuk kebutuhan ini.
  useEffect(() => {
    if (!me || !hasPending) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') refreshOrders();
    }, 5000);
    return () => clearInterval(t);
  }, [me, hasPending, refreshOrders]);

  // Tutup panel QR bila order-nya sudah lunas lewat polling/callback.
  useEffect(() => {
    if (!qrOrder?.orderId) return;
    if (orders.some((o) => o.orderId === qrOrder.orderId && o.status === 'paid')) {
      setQrOrder(null);
    }
  }, [orders, qrOrder?.orderId]);

  // Auto-cek berkala selama panel QR terbuka (callback tak menjangkau localhost).
  // Cek pertama langsung, jangan tunggu 5 detik.
  useEffect(() => {
    if (!qrOrder?.orderId) return;
    checkOrder(qrOrder.orderId, { quiet: true });
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
  const paymentReady = Boolean(catalog?.payment?.configured);
  const canBuy = shopOn && paymentReady;
  const ttlMs = catalog?.payment?.orderTtlMs || 15 * 60 * 1000;
  const qrLeft = qrOrder ? qrOrder.createdAt + ttlMs - nowTick : 0;

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Shop</h1></div>
          <ErrorRetry message={error} onRetry={load} />
          {!canBuy ? (
            <div className="card" style={{ marginBottom: 16, background: 'var(--pastel-yellow)' }}>
              <div className="section-title" style={{ marginBottom: 6 }}>
                {!shopOn ? 'Katalog produk' : 'Pembayaran QRIS belum aktif'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.7 }}>
                {!shopOn
                  ? 'Produk di bawah ini adalah katalog resmi KartuYogaa. Pembelian dibuka kembali setelah konfigurasi toko selesai. Untuk pertanyaan, hubungi CS.'
                  : 'Katalog dan harga tetap bisa dilihat. Pembayaran QRIS sedang disiapkan; tombol pembelian akan aktif setelah konfigurasi Tripay selesai. Untuk pertanyaan, hubungi CS.'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
                <a href={CS_EMAIL_URL} style={{ color: 'var(--link)', fontWeight: 700 }}>{CS_EMAIL}</a>
                <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontWeight: 700 }}>WhatsApp {CS_WHATSAPP}</a>
              </div>
            </div>
          ) : null}
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
              Bonus kartu 50k/100k/500k juga masuk otomatis setelah pembayaran sukses.
            </div>
            <div className="title-grid">
              {(catalog?.xpPacks || []).map((p) => (
                <div key={p.id} className="title-tile earned">
                  <div className="title-name">{p.xp.toLocaleString('id-ID')} XP</div>
                  <div className="title-desc">
                    {idr(p.priceIdr)} • bonus {p.bonusPct}%
                    {bonusCardsLabel(p.bonusCards) ? ` • kartu ${bonusCardsLabel(p.bonusCards)}` : ''}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 0, padding: '8px 10px', marginTop: 8, fontSize: 13 }}
                    disabled={!me || !canBuy || paying === p.id}
                    onClick={() => pay({ kind: 'xp', packId: p.id }, p.id)}
                  >
                    {!me
                      ? 'Login dulu'
                      : !shopOn
                        ? 'Segera hadir'
                        : !paymentReady
                          ? 'Pembayaran belum aktif'
                          : paying === p.id
                            ? '...'
                            : `Beli ${idr(p.priceIdr)}`}
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
                  disabled={!canBuy || slotRoom <= 0 || paying === 'slot'}
                  onClick={() => pay({ kind: 'slot', qty: slotQty }, 'slot')}
                >
                  {slotRoom <= 0
                    ? 'Slot penuh (50/50)'
                    : !shopOn
                      ? 'Segera hadir'
                      : !paymentReady
                        ? 'Pembayaran belum aktif'
                        : paying === 'slot'
                          ? '...'
                          : `Beli ${idr((catalog?.slot?.priceIdr || 10000) * slotQty)}`}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="btn btn-ghost"
                style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px' }}
              >
                Login untuk membeli slot
              </Link>
            )}
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
                    <span style={{ fontSize: 12, fontWeight: 800, color: o.status === 'paid' ? 'var(--success)' : (o.status === 'pending' || o.status === 'processing' || o.status === 'refund') ? '#b8860b' : 'var(--error)' }}>
                      {o.status === 'paid' ? 'Lunas' : o.status === 'pending' ? `Menunggu bayar${left > 0 ? ` • ${fmtSisa(left)}` : ''}` : o.status === 'processing' ? 'Memproses...' : o.status === 'expired' ? 'Kadaluarsa' : o.status === 'refund' ? 'Refund' : 'Gagal'}
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
            <div style={{ fontSize: 12, color: 'var(--body)', lineHeight: 1.7 }}>
              Semua produk bersifat digital, tanpa pengiriman fisik. Pembayaran
              diproses melalui Tripay dengan QRIS. Dengan membeli, kamu menyetujui
              dokumen legal KartuYogaa di bawah ini.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 12 }}>
              {LEGAL_LINKS.map((link) => (
                <Link key={link.href} href={link.href} style={{ color: 'var(--link)', textDecoration: 'underline', fontWeight: 700 }}>
                  {link.label}
                </Link>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              CS KartuYogaa:{' '}
              <a href={CS_EMAIL_URL} style={{ color: 'var(--link)' }}>{CS_EMAIL}</a>
              {' • '}
              <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)' }}>WhatsApp {CS_WHATSAPP}</a>
              {' • '}
              {CS_HOURS}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
