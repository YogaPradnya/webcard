import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { buildProfileData } from '@/lib/profileData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/profile — ringkasan profil: nama, xp/sisa, koleksi, battle, showcase, gelar.
async function GET_impl(req, _ctx, session) {
  try {
    const profile = await buildProfileData(session);
    return jsonOk({ profile });
  } catch (e) {
    console.error('[PROFILE]', e.message);
    return jsonFail('Gagal memuat profil.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/profile/route.js' });
