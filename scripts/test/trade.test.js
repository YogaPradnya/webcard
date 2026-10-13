import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkTradeTierRule } from '../../src/lib/trade.js';

describe('aturan nilai trade', () => {
  it('tier sama bebas', () => {
    assert.equal(checkTradeTierRule('Legendary', 1, 'Legendary', 1).ok, true);
    assert.equal(checkTradeTierRule('Epic', 2, 'Epic', 5).ok, true);
  });
  it('selisih 1 tier wajib 1 lawan 1', () => {
    assert.equal(checkTradeTierRule('Legendary', 1, 'Epic', 1).ok, true);
    assert.equal(checkTradeTierRule('Epic', 1, 'Legendary', 1).ok, true);
    assert.equal(checkTradeTierRule('Legendary', 1, 'Epic', 2).ok, false);
    assert.equal(checkTradeTierRule('Legendary', 2, 'Epic', 1).ok, false);
  });
  it('selisih 2 tier wajib 3 bawah lawan 1 atas', () => {
    assert.equal(checkTradeTierRule('Legendary', 1, 'Rare', 3).ok, true);
    assert.equal(checkTradeTierRule('Rare', 3, 'Legendary', 1).ok, true);
    assert.equal(checkTradeTierRule('Legendary', 1, 'Rare', 1).ok, false);
    assert.equal(checkTradeTierRule('Legendary', 1, 'Rare', 2).ok, false);
    assert.equal(checkTradeTierRule('Mythic', 1, 'Epic', 3).ok, true);
  });
  it('selisih 3+ tier dilarang', () => {
    assert.equal(checkTradeTierRule('Legendary', 1, 'Common', 3).ok, false);
    assert.equal(checkTradeTierRule('Mythic', 1, 'Rare', 3).ok, false);
    assert.equal(checkTradeTierRule('Mythic', 1, 'Common', 1).ok, false);
  });
});
