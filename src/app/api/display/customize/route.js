import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { checkRateCount } from '@/lib/rateLimit';
import { customizeDisplayCard } from '@/lib/display';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// POST /api/display/customize { id, imageUrl, borderType, borderColor, description }
// Custom kartu admin milik sendiri (nama dikunci). Tiap Simpan memakai
// 1 jatah ubah (maks 3x, sama seperti slot custom).
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const attempt = await checkRateCount(`displaycustom:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return NextResponse.json({ success: false, message: 'Terlalu sering menyimpan. Tunggu sebentar.' }, { status: 429 });
  }
  try {
    const r = await customizeDisplayCard(session.id, body.id, {
      imageUrl: body.imageUrl,
      borderType: body.borderType,
      borderColor: body.borderColor,
      description: body.description,
    });
    if (!r.ok) return NextResponse.json({ success: false, message: r.error }, { status: 400 });
    return NextResponse.json({ success: true, editsLeft: r.editsLeft });
  } catch (e) {
    console.error('[DISPLAY CUSTOMIZE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal simpan kartu.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/display/customize/route.js');
