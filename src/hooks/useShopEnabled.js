'use client';

import { useEffect, useState } from 'react';
import { fetchLenient } from '@/lib/fetchJson';

// Flag shop dibaca SEKALI per page-load, dipakai Sidebar + book + profile + shop.
// Tanpa ini tiap komponen fetch /api/shop/packages sendiri-sendiri.
let _cached = null;
let _promise = null;

export function useShopEnabled() {
  const [enabled, setEnabled] = useState(_cached);
  useEffect(() => {
    if (_cached !== null) return;
    if (!_promise) {
      _promise = fetchLenient('/api/shop/packages')
        .then((d) => {
          _cached = Boolean(d && d.success && d.enabled);
          return _cached;
        })
        .catch(() => {
          _promise = null;
          return false;
        });
    }
    let alive = true;
    _promise.then((v) => { if (alive) setEnabled(v); });
    return () => { alive = false; };
  }, []);
  return Boolean(enabled);
}
