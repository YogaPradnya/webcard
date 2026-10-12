import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getShowcaseSource, setShowcaseSource } from '@/lib/profilePrefs';

// GET /api/profile/showcase-source — pilihan pajangan .profil milik user login.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    const source = await getShowcaseSource(session.id);
    return NextResponse.json({ success: true, source });
  } catch (e) {
    console.error('[SHOWCASE SOURCE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat pilihan.' }, { status: 500 });
  }
}

// POST /api/profile/showcase-source { source: 'auto'|'gacha'|'display' }
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
    const result = await setShowcaseSource(session.id, body.source);
    if (!result.ok) return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    return NextResponse.json({ success: true, source: result.source });
  } catch (e) {
    console.error('[SHOWCASE SOURCE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal menyimpan pilihan.' }, { status: 500 });
  }
}
