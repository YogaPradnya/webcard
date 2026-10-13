import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { updateSlotCard } from '@/lib/shop';

// POST /api/shop/slot/update { slotId, name, imageUrl, borderType, borderColor }
// Tiap Simpan sukses memakai 1 jatah ubah (maks 3 per slot).
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  try {
    const r = await updateSlotCard(session.id, body.slotId, {
      name: body.name,
      imageUrl: body.imageUrl,
      borderType: body.borderType,
      borderColor: body.borderColor,
    });
    if (!r.ok) return NextResponse.json({ success: false, message: r.error }, { status: 400 });
    return NextResponse.json({ success: true, editsLeft: r.editsLeft });
  } catch (e) {
    console.error('[SHOP SLOT UPDATE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal simpan kartu.' }, { status: 500 });
  }
}
