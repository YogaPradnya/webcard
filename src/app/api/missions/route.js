import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getMissionStatus, recordEvent } from '@/lib/missions';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/missions — status progres + klaim. Sekaligus mencatat misi
// "buka web hari ini" (login harian).
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await recordEvent(session.id, session.username, 'login', 1);
    const status = await getMissionStatus(session.id);
    return NextResponse.json({ success: true, ...status });
  } catch (e) {
    console.error('[MISSIONS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat misi.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/missions/route.js');
