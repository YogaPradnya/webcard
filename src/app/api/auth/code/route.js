import { getDb } from '@/lib/db';
import { ensureLoginCodeTable, generateLoginCode, hashToken, newToken, LOGIN_CODE_TTL_MS } from '@/lib/loginCode';
import { apiHandler, jsonOk, jsonFail, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

function tokenCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `login_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// POST /api/auth/code { tnc: true } — fallback/rollback kode login 6 huruf.
// UI utama sekarang memakai password Animein; route ini sengaja dipertahankan.
// Wajib menyetujui TnC dulu (validasi server anti by-pass).
// Body dibaca toleran (bukan parseJson ketat): body kosong = tidak setuju.
async function POST_impl(req) {
  try {
    let tnc = false;
    let clientToken = '';
    try {
      const body = await req.json();
      tnc = Boolean(body && body.tnc);
      // Token opsional dari browser (sessionStorage). Dipakai agar polling
      // tetap bisa mencocokkan kode walau cookie login_token hilang/terblokir.
      const raw = String(body?.clientToken || '').trim();
      if (/^[a-f0-9]{64}$/i.test(raw)) clientToken = raw;
    } catch { /* body kosong = tidak setuju */ }
    if (!tnc) {
      return jsonFail('Centang persetujuan Syarat & Ketentuan dulu.', 400);
    }
    await ensureLoginCodeTable();
    const db = getDb();
    await db.execute('DELETE FROM web_login_codes WHERE expires_at <= ?', [Date.now()]);

    let code = '';
    for (let i = 0; i < 10; i++) {
      const cand = generateLoginCode();
      const exists = await db.execute({ sql: 'SELECT code FROM web_login_codes WHERE code = ?', args: [cand] });
      if (exists.rows.length === 0) {
        code = cand;
        break;
      }
    }
    if (!code) {
      return jsonFail('Gagal buat kode.', 500);
    }

    const token = clientToken || newToken();
    const expiresAt = Date.now() + LOGIN_CODE_TTL_MS;
    await db.execute({
      sql: 'INSERT INTO web_login_codes (code, token_hash, expires_at, created_at, tnc_at) VALUES (?, ?, ?, ?, ?)',
      args: [code, hashToken(token), expiresAt, Date.now(), Date.now()],
    });
    const res = jsonOk({ code, expiresAt });
    res.headers.set('Set-Cookie', tokenCookie(token, Math.ceil(LOGIN_CODE_TTL_MS / 1000)));
    return res;
  } catch (e) {
    console.error('[LOGIN CODE]', e.message);
    return jsonFail('Gagal buat kode.', 500);
  }
}

// Tanpa auth; batas hang server via apiHandler (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/auth/code/route.js' });
