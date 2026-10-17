export function idr(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`;
}

export function paymentLabel(t) {
  const key = String(t || '').trim();
  if (!key) return '-';
  const map = { qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', bank_transfer: 'Virtual Account', echannel: 'Mandiri Bill', credit_card: 'Kartu Kredit', cstore: 'Gerai Retail' };
  return map[key.toLowerCase()] || key;
}

export function fmtDate(ts) {
  if (!ts) return '-';
  try {
    return new Date(Number(ts)).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}
