import { checkRateCount } from '@/lib/rateLimit';
import { customizeDisplayCard } from '@/lib/display';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/display/customize { id, imageUrl, borderType, borderColor, description }
// Custom kartu admin milik sendiri (nama dikunci). Tiap Simpan memakai
// 1 jatah ubah (maks 3x, sama seperti slot custom).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const attempt = await checkRateCount(`displaycustom:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering menyimpan. Tunggu sebentar.', 429);
  }
  try {
    const r = await customizeDisplayCard(session.id, body.id, {
      imageUrl: body.imageUrl,
      borderType: body.borderType,
      borderColor: body.borderColor,
      description: body.description,
    });
    if (!r.ok) return jsonFail(r.error, 400);
    return jsonOk({ editsLeft: r.editsLeft });
  } catch (e) {
    console.error('[DISPLAY CUSTOMIZE]', e.message);
    return jsonFail('Gagal simpan kartu.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/display/customize/route.js' });
