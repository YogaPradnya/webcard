import { apiHandler, jsonOk, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import {
  XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT,
  SLOT_BORDER_TYPES, ORDER_PENDING_TTL_MS, isShopEnabled, isTokopayConfigured,
  isPaymentSimulationEnabled, tokopayChannel,
} from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET /api/shop/packages — katalog publik.
async function GET_impl() {
  const sim = isPaymentSimulationEnabled();
  return jsonOk({
    enabled: isShopEnabled(),
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
      configured: isTokopayConfigured() || sim,
      provider: sim ? 'simulation' : 'tokopay',
      simulation: sim,
      channelId: tokopayChannel(),
      methods: ['QRIS'],
      orderTtlMs: ORDER_PENDING_TTL_MS,
    },
  });
}

// Tanpa auth; batas hang server via apiHandler (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { auth: false, timeout: READ_TIMEOUT_MS, tag: 'src/app/api/shop/packages/route.js' });
