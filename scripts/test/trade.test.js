import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBundleRule,
  bundleStats,
  normalizeBundleItems,
  TRADE_POINT,
  MAX_TRADE_CARDS_PER_SIDE,
} from '../../src/lib/trade.js';

const item = (charName, rarity, amount = 1) => ({ charName, rarity, amount });

describe('aturan nilai trade bundle (poin 2x)', () => {
  it('nilai dasar C1 R2 E4 L8 M16', () => {
    assert.deepEqual(TRADE_POINT, { Common: 1, Rare: 2, Epic: 4, Legendary: 8, Mythic: 16 });
    assert.equal(MAX_TRADE_CARDS_PER_SIDE, 10);
  });
  it('tier sama bebas (jumlah berapapun)', () => {
    assert.equal(checkBundleRule([item('A', 'Epic', 2)], [item('B', 'Epic', 5)]).ok, true);
    assert.equal(checkBundleRule([item('A', 'Common', 5)], [item('B', 'Common', 1)]).ok, true);
  });
  it('2 Rare untuk 1 Epic adil (4 vs 4)', () => {
    const r = checkBundleRule([item('A', 'Rare', 2)], [item('B', 'Epic', 1)]);
    assert.equal(r.ok, true);
    assert.equal(r.giveValue, 4);
    assert.equal(r.takeValue, 4);
  });
  it('tidak seimbang ditolak dengan info nilai', () => {
    const r = checkBundleRule([item('A', 'Rare', 1)], [item('B', 'Epic', 1)]);
    assert.equal(r.ok, false);
    assert.match(r.message, /2 vs 4/);
  });
  it('kartu sama di kedua sisi ditolak', () => {
    assert.equal(checkBundleRule([item('A', 'Rare', 1)], [item('a', 'Rare', 1)]).ok, false);
  });
  it('lebih dari 10 kartu per sisi ditolak', () => {
    assert.equal(checkBundleRule([item('A', 'Common', 11)], [item('B', 'Common', 11)]).ok, false);
    assert.equal(checkBundleRule([item('A', 'Common', 10)], [item('B', 'Common', 10)]).ok, true);
  });
  it('sisi kosong ditolak', () => {
    assert.equal(checkBundleRule([], [item('B', 'Common', 1)]).ok, false);
    assert.equal(checkBundleRule([item('A', 'Common', 1)], []).ok, false);
  });
});

describe('normalizeBundleItems', () => {
  it('gabung duplikat, buang kosong/nol', () => {
    const out = normalizeBundleItems([
      { charName: 'A', rarity: 'Rare', amount: 1 },
      { charName: 'a', rarity: 'Rare', amount: 2 },
      { charName: 'B', rarity: 'Epic', amount: 1 },
      { charName: '  ', rarity: 'Common', amount: 5 },
      { charName: 'C', rarity: 'Common', amount: 0 },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out.find((i) => i.charName === 'A').amount, 3);
    assert.equal(out.find((i) => i.charName === 'B').amount, 1);
  });
  it('bundleStats hitung count + value', () => {
    assert.deepEqual(bundleStats([item('A', 'Rare', 2), item('B', 'Epic', 1)]), {
      count: 3, value: 8, tiers: ['Rare', 'Epic'],
    });
  });
});
