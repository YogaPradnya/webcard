import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTitles, iconForTitle, slugCard } from '../../src/lib/titles.js';
import { calcPower, calcLevel, tenCost } from '../../src/lib/gacha.js';
import { generateTradeCode, normalizeTradeCode } from '../../src/lib/trade.js';

describe('titles', () => {
  it('mythic dimiliki memberi gelar + ikon', () => {
    const pool = [
      { name: 'Sung Jinwoo', tier: 'Mythic' },
      { name: 'Madara Uchiha', tier: 'Mythic' },
      { name: 'Naruto Uzumaki', tier: 'Epic' },
    ];
    const out = computeTitles(pool, { 'sung jinwoo': true });
    const sm = out.earned.find((t) => t.title === 'Shadow Monarch');
    assert.ok(sm);
    assert.equal(sm.icon, '/titles/mythic-sung-jinwoo.svg');
    // Mythic 1/2 -> gelar tier Mythic tetap terkunci
    assert.ok(out.locked.some((t) => t.id === 'tier:Mythic'));
  });
  it('tier lengkap memberi gelar, tier belum lengkap terkunci', () => {
    const pool = [{ name: 'A', tier: 'Common' }, { name: 'B', tier: 'Common' }];
    const done = computeTitles(pool, { a: true, b: true });
    assert.ok(done.earned.some((t) => t.id === 'tier:Common'));
    const half = computeTitles(pool, { a: true });
    const locked = half.locked.find((t) => t.id === 'tier:Common');
    assert.equal(locked.progress, 1);
    assert.equal(locked.total, 2);
  });
  it('iconForTitle memetakan judul dikenal, null untuk asing', () => {
    assert.equal(iconForTitle('Dewa Kartu'), '/titles/tier-mythic.svg');
    assert.equal(iconForTitle('Gelar Ngawur'), null);
    assert.equal(slugCard('Madara Uchiha'), 'madara-uchiha');
  });
});

describe('gacha math', () => {
  it('calcPower deterministik per nama (bot: base + lv*10 + hash%10)', () => {
    assert.equal(calcPower('Common', 1, 'Edward Elric'), calcPower('Common', 1, 'Edward Elric'));
    const p = calcPower('Mythic', 1, 'Guts');
    assert.ok(p >= 210 && p <= 219);
  });
  it('calcLevel ambang floor(20*lv^3)', () => {
    assert.equal(calcLevel(0), 1);
    assert.equal(calcLevel(19), 1);
    assert.equal(calcLevel(20), 2);
  });
  it('tenCost = 9x (diskon 10%)', () => {
    assert.equal(tenCost(500), 4500);
    assert.equal(tenCost(0), 0);
  });
});

describe('trade code', () => {
  it('kode 6 digit angka, normalize buang non-digit', () => {
    assert.match(generateTradeCode(), /^[0-9]{6}$/);
    assert.equal(normalizeTradeCode('ab48-29 10xy'), '482910');
  });
});
