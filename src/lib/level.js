export function calcLevel(xp) {
  const n = Number(xp) || 0;
  let lv = 1;
  while (n >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}
