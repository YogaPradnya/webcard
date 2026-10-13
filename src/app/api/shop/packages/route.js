import { NextResponse } from 'next/server';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  SLOT_BORDER_TYPES, ORDER_PENDING_TTL_MS, snapJsUrl, isMidtransConfigured,
} from '@/lib/shop';

// GET /api/shop/packages — katalog publik (buat reviewer Midtrans juga).
export async function GET() {
  return NextResponse.json({
    success: true,
    xpPacks: XP_PACKS.map((p) => ({
      ...p,
      bonusPct: Math.round(((p.xp - p.priceIdr) / p.priceIdr) * 100),
    })),
    slot: {
      priceIdr: SLOT_PRICE_IDR,
      maxPerUser: MAX_SLOTS_PER_USER,
      maxEdits: MAX_EDITS_PER_SLOT,
      borderTypes: SLOT_BORDER_TYPES,
      desc: '1 slot = 1 kartu pajangan custom (display-only, tampil di profil). Tiap Simpan memakai 1 jatah ubah (maks 3x per slot).',
    },
    payment: {
      configured: isMidtransConfigured(),
      snapJsUrl: snapJsUrl(),
      clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
      methods: ['QRIS'],
      orderTtlMs: ORDER_PENDING_TTL_MS,
    },
  });
}
