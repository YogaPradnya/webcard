'use client';

import { useEffect } from 'react';

// Daftarkan service worker (PWA) sekali saat aplikasi dimuat.
export default function SwRegister() {
  useEffect(() => {
    try {
      if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* abaikan */ });
      }
    } catch { /* abaikan */ }
  }, []);
  return null;
}
