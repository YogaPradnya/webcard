import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../../src/app/${name}`, import.meta.url), 'utf8');

function keyframesBody(css, name) {
  const start = css.indexOf(`@keyframes ${name}`);
  assert.notEqual(start, -1, `@keyframes ${name} tidak ditemukan`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`@keyframes ${name} tidak tertutup`);
}

/*
 * Regresi: transform (termasuk translateY(0) dari animation-fill-mode) pada
 * ancestor membuat position:fixed menempel ke ancestor itu, bukan viewport.
 * Floating bar battle/trade jadi ikut tergulung. Animasi masuk halaman
 * harus opacity-only, dan bar-nya sendiri tetap fixed.
 */
describe('layout & floating bar', () => {
  it('animasi .layout-main tidak memakai transform/translate', () => {
    const shell = read('shell.css');
    const fade = keyframesBody(shell, 'pageFadeIn');
    assert.ok(!/transform|translate/i.test(fade), 'pageFadeIn tidak boleh transform/translate');
    for (const match of shell.matchAll(/\.layout-main\s*\{([^}]*)\}/g)) {
      // transform: none justru aman (dipakai di prefers-reduced-motion).
      for (const decl of match[1].matchAll(/transform:\s*([^;}]+)/gi)) {
        assert.match(decl[1].trim(), /^none\b/i, '.layout-main tidak boleh punya transform aktif');
      }
      assert.ok(!/(^|[^-])translate:/i.test(match[1]), '.layout-main tidak boleh punya translate');
    }
  });

  it('transisi route juga opacity-only', () => {
    const components = read('components.css');
    const fade = keyframesBody(components, 'route-fade-in');
    assert.ok(!/transform|translate/i.test(fade), 'route-fade-in hanya boleh opacity');
  });

  it('.floating-bar fixed, di atas bottomnav, dan aman safe-area', () => {
    const battle = read('battle.css');
    assert.match(battle, /\.floating-bar\s*\{[^}]*position:\s*fixed/);
    assert.match(battle, /\.floating-bar\s*\{[^}]*bottom:\s*0/);
    assert.match(
      battle,
      /@media\s*\(max-width:\s*720px\)\s*\{\s*\.floating-bar\s*\{[^}]*bottom:\s*calc\(72px \+ env\(safe-area-inset-bottom\)\)/
    );
  });
});
