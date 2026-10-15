import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// POST /api/auth/logout — hapus cookie sesi.
async function POST_impl() {
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/auth/logout/route.js');
