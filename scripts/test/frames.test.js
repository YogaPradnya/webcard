import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_TIERS, frameDefsSvg, frameSymbolId } from '../../src/lib/frames.js';

describe('frames web', () => {
  it('5 tier + fallback Common', () => {
    assert.deepEqual(FRAME_TIERS, ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']);
    assert.equal(frameSymbolId('Mythic'), 'bf-Mythic');
    assert.equal(frameSymbolId('Ngawur'), 'bf-Common');
  });
  it('defs berisi 5 symbol + plat grade', () => {
    const d = frameDefsSvg();
    assert.equal((d.match(/<symbol/g) || []).length, 5);
    for (const t of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
      assert.ok(d.includes(`>${t}</text>`), `plat ${t} hilang`);
    }
  });
  it('tidak ada id duplikat, semua url(#) merujuk id yang ada', () => {
    const d = frameDefsSvg();
    const ids = [...d.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'id duplikat');
    const refs = [...d.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(refs.length > 0);
    const set = new Set(ids);
    for (const r of refs) assert.ok(set.has(r), `ref gantung: ${r}`);
  });
});
