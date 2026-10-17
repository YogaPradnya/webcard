'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetchJson';

// Auth guard seragam: return { me, loading }. requireLogin(true) -> tendang ke /login bila belum login.
// Pilot di missions/page.js; page lain menyusul satu per satu.
export function useMe(requireLogin = true) {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { ok, data } = await fetchJson('/api/auth/me');
        if (!ok || !data.success) {
          if (requireLogin) router.push('/login');
          return;
        }
        if (alive) setMe(data);
      } catch {
        // Gagal jaringan/abort: anggap belum login (anti skeleton nyangkut).
        if (requireLogin) router.push('/login');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { me, loading };
}
