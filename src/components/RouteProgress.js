'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// Loading bar navigasi: aktif seketika saat user mengklik tautan navigasi
// dan selesai saat rute baru selesai dimuat oleh Next.js.
export default function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleTimer = useRef(null);
  const safetyTimer = useRef(null);
  const finishTimer = useRef(null);
  const currentPath = useRef(pathname);

  const startProgress = useCallback(() => {
    // Bersihkan timer lama
    if (trickleTimer.current) clearInterval(trickleTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);

    setVisible(true);
    setProgress(25);

    // Trickle bertahap (asymptotic menuju ~85%)
    trickleTimer.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev;
        const diff = (88 - prev) * 0.12;
        return Math.min(88, prev + Math.max(1, diff));
      });
    }, 180);

    // Safety timeout: jika dalam 10 detik halaman macet/batal, sembunyikan bar
    safetyTimer.current = setTimeout(() => {
      if (trickleTimer.current) clearInterval(trickleTimer.current);
      setProgress(100);
      finishTimer.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
    }, 10000);
  }, []);

  const completeProgress = useCallback(() => {
    if (trickleTimer.current) clearInterval(trickleTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);

    setProgress(100);
    finishTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }, []);

  // Event listener saat pathname berubah (rute selesai dimuat)
  useEffect(() => {
    if (pathname !== currentPath.current) {
      currentPath.current = pathname;
      completeProgress();
    }
    function handlePop() {
      completeProgress();
    }
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [pathname, completeProgress]);

  // Global listener klik link internal: tangkap klik detik ke-0 sebelum rute berganti
  useEffect(() => {
    function handleClick(e) {
      // Abaikan jika modifier key ditekan (ctrl, meta, shift, alt)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }

      const target = e.target;
      const anchor = target?.closest ? target.closest('a') : null;
      if (!anchor) return;

      // Abaikan jika ada atribut download atau target="_blank"
      if (anchor.hasAttribute('download') || anchor.target === '_blank') return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;

      try {
        const dest = new URL(anchor.href, window.location.href);
        const current = window.location;

        // Hanya untuk link internal (same origin)
        if (dest.origin !== current.origin) return;

        // Jika hanya ganti hash pada halaman yang sama, abaikan
        if (dest.pathname === current.pathname && dest.search === current.search) {
          return;
        }

        // Tautan rute berbeda: picu progress bar seketika
        startProgress();
      } catch {
        // abaikan URL tidak valid
      }
    }

    // Tangkap di capture phase agar tidak terlewat
    document.addEventListener('click', handleClick, true);

    // Dukung custom event bila kode memanggil router.push() secara manual
    function onCustomStart() { startProgress(); }
    function onCustomDone() { completeProgress(); }
    window.addEventListener('route-progress-start', onCustomStart);
    window.addEventListener('route-progress-done', onCustomDone);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('route-progress-start', onCustomStart);
      window.removeEventListener('route-progress-done', onCustomDone);
      if (trickleTimer.current) clearInterval(trickleTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, [startProgress, completeProgress]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="route-progress"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="route-progress-bar"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
        }}
      >
        <div className="route-progress-peg" />
      </div>
    </div>
  );
}
