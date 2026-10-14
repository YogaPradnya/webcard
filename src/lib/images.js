// Optimasi URL gambar untuk web: bila dari Cloudinary, sisipkan transformasi
// f_auto (format terbaik browser) + q_auto (kualitas adaptif) + w (lebar).
// URL non-Cloudinary dikembalikan apa adanya. Murni (aman dipakai client).

export function optImg(url, width = 400) {
  const src = String(url || '');
  if (!src) return src;
  const w = Math.min(1200, Math.max(50, Number(width) || 400));
  const m = src.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)?(.*)$/);
  if (!m) return src;
  const rest = `${m[2] || ''}${m[3] || ''}`;
  // Jangan tumpuk bila sudah ada transformasi.
  if (/^f_auto/.test(rest) || /^w_\d+/.test(rest)) return src;
  return `${m[1]}f_auto,q_auto,w_${w}/${rest}`;
}
