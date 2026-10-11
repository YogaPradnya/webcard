import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';

// POST /api/auth/logout — hapus cookie sesi.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}
