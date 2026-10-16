import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcLevel } from '../../src/lib/level.js';
import { jakartaDateKey, jakartaWeekKey } from '../../src/lib/jakartaTime.js';
import { sanitizePoolInput } from '../../src/lib/pool.js';
import { cleanHex } from '../../src/lib/color.js';
import { hashNameLower, slugify } from '../../src/lib/hash.js';
import { bundleStats, checkBundleRule } from '../../src/lib/tradeValue.js';

describe('shared helpers', () => {
  it('calcLevel batas 20*x^3', () => {
    assert.equal(calcLevel(0), 1);
    assert.equal(calcLevel(19), 1);
    assert.equal(calcLevel(20), 2);
  });
  it('jakartaDateKey format', () => {
    assert.match(jakartaDateKey(new Date('2026-01-01T00:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  });
  it('jakartaWeekKey senin', () => {
    const monday = jakartaWeekKey(new Date('2026-10-12T00:00:00Z'));
    assert.match(monday, /^\d{4}-\d{2}-\d{2}$/);
  });
  it('sanitizePoolInput tolak duplikat', () => {
    assert.equal(sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Common' }, { name: 'a', anime: 'Y', tier: 'Rare' }]), null);
    assert.equal(sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Common' }]).length, 1);
  });
  it('cleanHex 3 digit', () => {
    assert.equal(cleanHex('#abc'), '#aabbcc');
    assert.equal(cleanHex('zzz'), '');
  });
  it('hash stabil + slug', () => {
    assert.equal(hashNameLower('Asuna'), hashNameLower('asuna'));
    assert.equal(slugify('Asuna Yuuki!!'), 'asuna-yuuki');
  });
  it('trade bundle adil 2 Rare = 1 Epic', () => {
    const r = checkBundleRule([{ charName: 'A', rarity: 'Rare', amount: 2 }], [{ charName: 'B', rarity: 'Epic', amount: 1 }]);
    assert.equal(r.ok, true);
    assert.equal(bundleStats([{ rarity: 'Rare', amount: 2 }]).value, 4);
  });
});
