export function formatSisa(ms) {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  return `${h} jam`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function effectTone(effect) {
  const e = String(effect || 'none');
  if (['heal', 'regen', 'energize'].includes(e)) return 'fx-heal';
  if (['shield', 'bulwark'].includes(e)) return 'fx-shield';
  if (['surge', 'focus'].includes(e)) return 'fx-assist';
  if (e === 'none') return '';
  return 'fx-dmg';
}
