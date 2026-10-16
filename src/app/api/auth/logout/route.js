import { clearSessionCookieHeader } from '@/lib/session';
import { apiHandler, jsonOk } from '@/lib/apiHandler';

// POST /api/auth/logout — hapus cookie sesi.
async function POST_impl() {
  const res = jsonOk();
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}

// Tanpa auth; batas hang server via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, tag: 'src/app/api/auth/logout/route.js' });
