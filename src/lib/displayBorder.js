export const DISPLAY_BORDER_FALLBACK = '#9ca3af';

const BORDER_MAP = {
  gold: '#eab308',
  rainbow: '#a855f7',
  neon: '#22d3ee',
  sakura: '#f9a8d4',
  shadow: '#111827',
  classic: '#9ca3af',
};

export function displayBorderColor(type, custom) {
  if (type && typeof type === 'object') return displayBorderColorCard(type);
  if (type === 'custom' && custom) return custom;
  return BORDER_MAP[type] || DISPLAY_BORDER_FALLBACK;
}

export function displayBorderColorCard(c) {
  if (!c) return '#9aa3b2';
  if (c.borderType === 'custom' && c.borderColor) return c.borderColor;
  return BORDER_MAP[c.borderType] || '#9aa3b2';
}

export function displayCardStyle(c) {
  return { borderColor: displayBorderColorCard(c) };
}
