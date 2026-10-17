import { checkRateCount } from '@/lib/rateLimit';
import { uploadSlotImage, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME } from '@/lib/cloudinary';
import { apiHandler, jsonOk, jsonFail, UPLOAD_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/slot/image (multipart form-data, field "file")
// Upload gambar ke Cloudinary, return { imageUrl }. Tidak makan jatah ubah
// (jatah kemakan saat Simpan). Maks 5MB, JPG/PNG/WebP.
// Pakai formData() — JANGAN parseJson di sini.
async function POST_impl(req, _ctx, session) {
  const attempt = await checkRateCount(`shopupload:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering upload. Tunggu sebentar.', 429);
  }
  let file = null;
  try {
    const form = await req.formData();
    file = form.get('file');
  } catch {
    return jsonFail('Form tidak valid.', 400);
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return jsonFail('File gambar wajib diisi.', 400);
  }
  const size = Number(file.size) || 0;
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    return jsonFail('Ukuran gambar maks 5MB.', 400);
  }
  const mime = String(file.type || '');
  if (!ALLOWED_UPLOAD_MIME.includes(mime)) {
    return jsonFail('Format harus JPG, PNG, atau WebP.', 400);
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { secureUrl } = await uploadSlotImage(buf, session.id, mime);
    return jsonOk({ imageUrl: secureUrl });
  } catch (e) {
    console.error('[SHOP UPLOAD]', e.message);
    const msg = /Cloudinary belum dikonfigurasi/.test(e.message)
      ? 'Upload belum dikonfigurasi. Hubungi admin.'
      : 'Gagal upload gambar. Coba lagi.';
    return jsonFail(msg, 500);
  }
}

// Auth + batas hang server via apiHandler (penjaga Turso menggantung).
// Upload Cloudinary bisa lebih lama dari write biasa -> timeout khusus 25 dtk.
export const POST = apiHandler(POST_impl, { timeout: UPLOAD_TIMEOUT_MS, tag: 'src/app/api/shop/slot/image/route.js' });
