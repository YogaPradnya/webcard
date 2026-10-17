// Guardrail insiden 17 Okt: db.batch()/db.transaction() di request path
// membuat endpoint menggantung puluhan detik di Turso (batch 23-68 dtk,
// tx tulis pertama 12-35 dtk) -> 503 massal. Pelajaran lengkap + aturan:
// db/SCHEMA_OWNERSHIP.md ("JANGAN pakai batch()/transaction() di request path").
//
// Pengecualian yang SAH (satu-satunya):
//  - src/lib/trade.js -> transaction('write') all-or-nothing, sekali pakai.
//  - src/lib/db.js    -> warmWriteTxOnce() saat boot (menyerap stall tx pertama).
// File baru = tulis ulang pakai execute() tunggal (boleh Promise.all).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const ALLOWED = new Set(['src/lib/trade.js', 'src/lib/db.js']);

// .batch( / .transaction( + bentuk bracket db['batch']( — titik/prefix wajib,
// supaya kalimat komentar seperti "mendukung transaction()" tidak kena.
const CALL_RE = /\.(batch|transaction)\s*\(|\[\s*['"](batch|transaction)['"]\s*\]\s*\(/;

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(p));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('guardrail: batch()/transaction() cuma boleh di trade+d warm-up boot', () => {
  it('tidak ada pemakai baru di src/** (selain allowlist)', () => {
    const violations = [];
    for (const file of listJsFiles(SRC_ROOT)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (CALL_RE.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(
      violations,
      [],
      'Pola .batch(/.transaction( DILARANG di request path — patologi Turso 17 Okt '
        + '(batch 23-68 dtk/statement, tx pertama 12-35 dtk) => timeout 503 massal.\n'
        + 'Pakai execute() tunggal (boleh Promise.all). Lihat db/SCHEMA_OWNERSHIP.md.\n'
        + `Pelanggaran:\n${violations.join('\n')}`,
    );
  });
});
