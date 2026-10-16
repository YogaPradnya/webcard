export const MAX_CARD_COPIES = 999;
export const DISPLAY_BORDERS = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];
export const MAX_DISPLAY_EDITS = 3;
export const GACHA_HISTORY_LIMIT = 50;

export function ok(data = {}) {
  return { ok: true, ...data };
}

export function fail(code, message, extra = {}) {
  return { ok: false, code, error: message, message, ...extra };
}
