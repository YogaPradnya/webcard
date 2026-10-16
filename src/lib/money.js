export function idr(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`;
}

export function paymentLabel(t) {
  const map = { qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', bank_transfer: 'Virtual Account', echannel: 'Mandiri Bill', credit_card: 'Kartu Kredit', cstore: 'Gerai Retail' };
  return map[String(t || '')] || (t ? String(t).toUpperCase() : '-');
}

export function fmtDate(ts) {
  if (!ts) return '-';
  try {
    return new Date(Number(ts)).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

export function loadSnapJs(src, clientKey) {
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
