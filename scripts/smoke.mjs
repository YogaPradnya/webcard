#!/usr/bin/env node
// Smoke test pasca-deploy: tembak endpoint kunci di server LIVE, pastikan
// status 200 + latensi di bawah anggaran. Read-only (GET) — aman kapan pun.
// Keluar dengan kode 1 bila ada yang gagal, supaya bisa dipakai di CI/manual:
// "deploy sehat atau tidak" = 1 perintah.
//
// Pemakaian:
//   node scripts/smoke.mjs --user <id> [--username <nama>]
//   node scripts/smoke.mjs --base http://localhost:3000 --user <id>
//   SMOKE_COOKIE=<nilai cookie> node scripts/smoke.mjs   # kalau tak mau bikin cookie
// Opsi: --base <url> (default produksi), --budget <ms> (default 3000).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Muat .env.local (SESSION_SECRET) tanpa dependensi dotenv.
function loadEnvLocal() {
  try {
    for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* opsional */ }
}
loadEnvLocal();

const argv = process.argv.slice(2);
const arg = (name, def = '') => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? def) : def;
};
const base = (arg('--base') || process.env.BASE_URL || 'https://kartu.yogaa.web.id').replace(/\/+$/, '');
const budgetMs = Math.max(100, Number(arg('--budget') || 3000) || 3000);
const user = arg('--user') || process.env.SMOKE_USER || '';

const { sealSession, COOKIE_NAME } = await import('../src/lib/session.js');
let cookieValue = process.env.SMOKE_COOKIE || '';
if (!cookieValue) {
  if (!user) {
    console.error('Butuh --user <id> (atau SMOKE_COOKIE=<nilai cookie>).');
    process.exit(2);
  }
  cookieValue = sealSession({ id: user, key: 'smoke', username: arg('--username') || user });
}

// [path, wajibStatus] — endpoint publik; sisanya wajib login + success !== false.
const PUBLIC = [['/', 200], ['/login', 200]];
const AUTHED = [
  '/api/profile/summary',
  '/api/battle/mine',
  '/api/battle/rooms',
  '/api/cards',
  '/api/display',
  '/api/shop/slots',
  '/api/missions',
  '/api/battle/leaderboard?tab=pvp',
  '/api/trade/offers',
  '/api/profile',
];

async function hit(p) {
  const t0 = Date.now();
  try {
    const res = await fetch(base + p, { headers: { cookie: `${COOKIE_NAME}=${cookieValue}` } });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ms: Date.now() - t0, status: res.status, body };
  } catch (e) {
    return { ms: Date.now() - t0, status: 0, body: null, error: String(e?.message || e) };
  }
}

console.log(`== SMOKE ${base} (budget ${budgetMs}ms) ==`);
// Pemanasan: skema + pool + JIT server tidak ikut diukur.
for (const [p] of PUBLIC) await hit(p);
await hit(AUTHED[0]);

let pass = 0;
const total = PUBLIC.length + AUTHED.length;
const fails = [];

for (const [p, wantStatus] of PUBLIC) {
  const r = await hit(p);
  const ok = r.status === wantStatus && r.ms <= budgetMs;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(6)}ms  ${p}`);
  if (ok) pass += 1; else fails.push(`${p} status=${r.status} ${r.ms}ms${r.error ? ` err=${r.error}` : ''}`);
}
for (const p of AUTHED) {
  const r = await hit(p);
  const ok = r.status === 200 && r.body?.success !== false && r.ms <= budgetMs;
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(6)}ms  ${p}${r.body?.success === false ? ' (success=false)' : ''}`);
  if (ok) pass += 1; else fails.push(`${p} status=${r.status} ${r.ms}ms success=${r.body?.success}${r.error ? ` err=${r.error}` : ''}`);
}

console.log(`== HASIL: ${pass}/${total} lulus ==`);
if (fails.length) {
  console.error('Gagal:\n' + fails.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
