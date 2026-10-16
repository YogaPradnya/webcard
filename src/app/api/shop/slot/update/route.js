import { updateSlotCard } from '@/lib/shop';
import { checkRateCount } from '@/lib/rateLimit';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/slot/update { slotId, name, imageUrl, borderType, borderColor }
// Tiap Simpan sukses memakai 1 jatah ubah (maks 3 per slot).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const attempt = await checkRateCount(`shopsave:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering menyimpan. Tunggu sebentar.', 429);
  }
  try {
    const r = await updateSlotCard(session.id, body.slotId, {
      name: body.name,
      imageUrl: body.imageUrl,
      borderType: body.borderType,
      borderColor: body.borderColor,
    });
    if (!r.ok) return jsonFail(r.error, 400);
    return jsonOk({ editsLeft: r.editsLeft });
  } catch (e) {
    console.error('[SHOP SLOT UPDATE]', e.message);
    return jsonFail('Gagal simpan kartu.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/slot/update/route.js' });
