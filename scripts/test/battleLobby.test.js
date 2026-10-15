import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CARDS_CACHE_KEY,
  BATTLE_CARDS_CACHE_TTL_MS,
  readBattleCardsCache,
  writeBattleCardsCache,
} from '../../src/lib/battleLobby.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    _map: m,
  };
}

describe('battle lobby cache kartu', () => {
  it('tulis lalu baca kembali utuh', () => {
    const s = memStorage();
    const cards = [{ name: 'Ainz', owned: true }];
    writeBattleCardsCache(cards, s, 1000);
    assert.deepEqual(readBattleCardsCache(s, 1000 + 60 * 1000), cards);
  });
  it('kedaluwarsa setelah TTL 5 menit', () => {
    const s = memStorage();
    assert.equal(BATTLE_CARDS_CACHE_TTL_MS, 5 * 60 * 1000);
    writeBattleCardsCache([{ name: 'X' }], s, 0);
    assert.equal(readBattleCardsCache(s, BATTLE_CARDS_CACHE_TTL_MS + 1), null);
  });
  it('JSON rusak / bentuk salah -> null, tidak throw', () => {
    const s = memStorage();
    s.setItem(BATTLE_CARDS_CACHE_KEY, 'bukan-json{{{');
    assert.equal(readBattleCardsCache(s), null);
    s.setItem(BATTLE_CARDS_CACHE_KEY, JSON.stringify({ at: Date.now(), cards: 'ngawur' }));
    assert.equal(readBattleCardsCache(s), null);
    s.setItem(BATTLE_CARDS_CACHE_KEY, JSON.stringify({ at: Date.now() }));
    assert.equal(readBattleCardsCache(s), null);
  });
  it('tanpa storage -> null / no-op, tidak throw', () => {
    assert.equal(readBattleCardsCache(null), null);
    writeBattleCardsCache([{ name: 'X' }], null);
  });
});
