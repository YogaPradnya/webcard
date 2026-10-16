import { NextResponse } from 'next/server';
import { getSessionFromRequest } from './session.js';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from './apiTimeout.js';

export { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS };

export function jsonOk(data = {}) {
  return NextResponse.json({ success: true, ...data });
}

export function jsonFail(message, status = 400, code = null) {
  return NextResponse.json({ success: false, message, ...(code ? { code } : {}) }, { status });
}

export async function parseJson(req) {
  try {
    return { body: await req.json(), error: null };
  } catch {
    return { body: {}, error: jsonFail('Body JSON tidak valid.', 400) };
  }
}

export function requireSession(req) {
  const s = getSessionFromRequest(req);
  if (!s) return { session: null, error: jsonFail('Belum login.', 401) };
  return { session: s, error: null };
}

export function apiHandler(impl, { auth = true, timeout = READ_TIMEOUT_MS, tag = 'API' } = {}) {
  const fn = async (req, ctx) => {
    try {
      let session = null;
      if (auth) {
        const r = requireSession(req);
        if (r.error) return r.error;
        session = r.session;
      }
      return await impl(req, ctx, session);
    } catch (e) {
      console.error(`[${tag}]`, e.message);
      return jsonFail('Terjadi kesalahan server.', 500);
    }
  };
  return withTimeout(fn, timeout, tag);
}
