import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { claimMission } from '@/lib/missions';

// POST /api/missions/claim { period: 'daily'|'weekly', missionId }
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const period = String(body.period || 'daily') === 'weekly' ? 'weekly' : 'daily';
  try {
    const r = await claimMission(session.id, session.username, period, body.missionId);
    if (!r.ok) return NextResponse.json({ success: false, message: r.error }, { status: 400 });
    return NextResponse.json({ success: true, xp: r.xp, newXp: r.newXp });
  } catch (e) {
    console.error('[MISSION CLAIM]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal klaim misi.' }, { status: 500 });
  }
}
