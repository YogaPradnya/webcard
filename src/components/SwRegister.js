'use client';

import { useEffect } from 'react';

// Daftarkan service worker (PWA) sekali saat aplikasi dimuat.
// Dilewati di localhost: chunk JS dev tidak pakai hash nama file, jadi
// cache-first SW menyajikan kode lama selamanya (refresh pun tidak mempan).
export default function SwRegister() {
  useEffect(() => {
    try {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return;
      if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* abaikan */ });
      }
    } catch { /* abaikan */ }
  }, []);
  return null;
}
