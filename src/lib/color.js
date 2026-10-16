export function cleanHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return '';
}

export function validateImageUrl(v, maxLen = 2000) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.length > maxLen || !/^https?:\/\/.+/i.test(s)) return null;
  return s;
}
