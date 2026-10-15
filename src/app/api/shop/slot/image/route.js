import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { checkRateCount } from '@/lib/rateLimit';
import { uploadSlotImage, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME } from '@/lib/cloudinary';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// POST /api/shop/slot/image (multipart form-data, field "file")
// Upload gambar ke Cloudinary, return { imageUrl }. Tidak makan jatah ubah
// (jatah kemakan saat Simpan). Maks 5MB, JPG/PNG/WebP.
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const attempt = await checkRateCount(`shopupload:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return NextResponse.json({ success: false, message: 'Terlalu sering upload. Tunggu sebentar.' }, { status: 429 });
  }
  let file = null;
  try {
    const form = await req.formData();
    file = form.get('file');
  } catch {
    return NextResponse.json({ success: false, message: 'Form tidak valid.' }, { status: 400 });
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ success: false, message: 'File gambar wajib diisi.' }, { status: 400 });
  }
  const size = Number(file.size) || 0;
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, message: 'Ukuran gambar maks 5MB.' }, { status: 400 });
  }
  const mime = String(file.type || '');
  if (!ALLOWED_UPLOAD_MIME.includes(mime)) {
    return NextResponse.json({ success: false, message: 'Format harus JPG, PNG, atau WebP.' }, { status: 400 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { secureUrl } = await uploadSlotImage(buf, session.id, mime);
    return NextResponse.json({ success: true, imageUrl: secureUrl });
  } catch (e) {
    console.error('[SHOP UPLOAD]', e.message);
    const msg = /Cloudinary belum dikonfigurasi/.test(e.message)
      ? 'Upload belum dikonfigurasi. Hubungi admin.'
      : 'Gagal upload gambar. Coba lagi.';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/shop/slot/image/route.js');
