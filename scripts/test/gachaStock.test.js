import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStockUnits, parseStockExclusions } from '../../src/lib/gacha.js';

const POOL = [
  { name: 'M1', anime: 'X', tier: 'Mythic' },
  { name: 'M2', anime: 'X', tier: 'Mythic' },
  { name: 'L1', anime: 'X', tier: 'Legendary' },
  { name: 'E1', anime: 'X', tier: 'Epic' },
  { name: 'C1', anime: 'X', tier: 'Common' },
];
// Mythic tidak lagi dibatasi (satu kartu bisa dimiliki banyak orang).
const STOCKS = { Legendary: 10, Epic: 50 };

describe('stok gacha', () => {
  it('parseStockExclusions: default yogaa, kosong eksplisit = tanpa exclusion', () => {
    assert.deepEqual(parseStockExclusions('Yogaa, Admin,,'), ['yogaa', 'admin']);
    assert.deepEqual(parseStockExclusions(''), []);
    const prev = process.env.STOCK_EXCLUDE_USERNAMES;
    delete process.env.STOCK_EXCLUDE_USERNAMES;
    assert.deepEqual(parseStockExclusions(), ['yogaa']);
    if (prev === undefined) delete process.env.STOCK_EXCLUDE_USERNAMES;
    else process.env.STOCK_EXCLUDE_USERNAMES = prev;
  });
  it('computeStockUnits: Mythic tanpa batas (null) walau sudah ada pemilik', () => {
    const out = computeStockUnits(POOL, STOCKS, { m1: 1, m2: 2 });
    assert.equal(out.Mythic, null);
  });
  it('computeStockUnits hitung unit tersisa per tier', () => {
    // L1 separuh (5/10); E1 utuh.
    const out = computeStockUnits(POOL, STOCKS, { l1: 5 });
    assert.deepEqual(out.Legendary, { left: 5, total: 10 });
    assert.deepEqual(out.Epic, { left: 50, total: 50 });
  });
  it('computeStockUnits clamp kelebihan pemilik jadi 0', () => {
    const out = computeStockUnits(POOL, STOCKS, { l1: 99, e1: 50 });
    assert.deepEqual(out.Legendary, { left: 0, total: 10 });
    assert.deepEqual(out.Epic, { left: 0, total: 50 });
  });
  it('computeStockUnits key case-insensitive', () => {
    const out = computeStockUnits(POOL, STOCKS, { L1: 5 });
    assert.deepEqual(out.Legendary, { left: 5, total: 10 });
  });
});
