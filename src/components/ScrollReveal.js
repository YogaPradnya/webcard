'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/* Blok konten yang ikut animasi reveal saat masuk viewport.
   Sengaja dibatasi ke blok utama (bukan semua elemen kecil) agar ringan. */
const REVEAL_SELECTOR = [
  '.page .brand',
  '.page .card',
  '.book-grid > .card-item',
  '.pick-grid > .card-item',
].join(', ');

/* Stagger maksimal 8 item per grup (sisanya tanpa delay) supaya tidak lemot. */
const STAGGER_MAX = 8;
const STAGGER_MS = 45;

function groupIndex(el) {
  const parent = el.parentElement;
  if (!parent) return 0;
  let idx = 0;
  for (const child of parent.children) {
    if (child === el) break;
    if (child.matches?.(REVEAL_SELECTOR)) idx += 1;
  }
  return idx;
}

/*
 * Animasi elemen masuk viewport (scroll reveal).
 * Kelas `js-reveal` dipasang inline script di <head> supaya elemen sudah
 * tersembunyi sejak paint pertama (tanpa kedip); komponen ini menandai
 * elemen dengan `data-reveal="in"` ketika mulai terlihat.
 *
 * Status reveal sengaja disimpan di data-attribute, bukan class: beberapa
 * kartu mengubah className saat di-flip/dipilih. Kalau statusnya class,
 * React akan menimpa dan menghapusnya -> opacity kembali 0 (kartu hilang).
 * Class `.reveal-in` tetap ditambahkan untuk kompatibilitas CSS lama.
 *
 * Tidak aktif saat prefers-reduced-motion (script head tidak memasang class).
 *
 * Perbaikan utama dari versi sebelumnya:
 * - Delayed re-scan (RAF + setTimeout) agar tidak miss elemen yang di-mount
 *   belakangan oleh template.js remount atau state async (loading -> content).
 * - MutationObserver mengakumulasi mutasi yang pending, bukan drop.
 * - rootMargin lebih lebar: elemen di atas fold langsung terlihat tanpa
 *   harus scroll dulu.
 * - threshold 0.01 (dari 0.06): cukup 1% area terlihat sudah ter-reveal.
 */
export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!document.documentElement.classList.contains('js-reveal')) return undefined;

    const tracked = new WeakSet();

    function isRevealed(el) {
      return el.dataset.reveal === 'in' || el.classList.contains('reveal-in');
    }

    function markRevealed(el) {
      el.dataset.reveal = 'in';
      // Kompatibilitas dengan CSS versi lama yang masih memakai class.
      el.classList.add('reveal-in');
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          markRevealed(el);
          io.unobserve(el);
        }
      },
      /* rootMargin 80px atas dan bawah: elemen tepat sebelum masuk viewport sudah
         mulai ter-reveal dengan mulus tanpa jeda/kedip, dan tidak pernah terpotong. */
      { threshold: 0.001, rootMargin: '80px 0px 80px 0px' }
    );

    function track(el) {
      if (!(el instanceof HTMLElement) || tracked.has(el)) return;
      tracked.add(el);
      if (isRevealed(el)) return;
      const idx = Math.min(groupIndex(el), STAGGER_MAX - 1);
      if (idx > 0) el.style.setProperty('--reveal-delay', `${idx * STAGGER_MS}ms`);
      io.observe(el);
    }

    function scan(scope) {
      if (scope instanceof Element && scope.matches(REVEAL_SELECTOR)) track(scope);
      const list = (scope instanceof Element ? scope : document).querySelectorAll(REVEAL_SELECTOR);
      list.forEach(track);
    }

    // Scan awal
    scan(document);

    // Delayed re-scan: tangkap elemen yang belum ada saat scan awal.
    // Skenario: template.js remount, atau state loading -> content (async).
    const t1 = requestAnimationFrame(() => scan(document));
    const t2 = setTimeout(() => scan(document), 100);
    const t3 = setTimeout(() => scan(document), 300);

    // Safety fallback JS: pastikan dalam 450ms semua elemen utama tampil
    // meskipun IntersectionObserver mengalami keterlambatan atau miss.
    const safetyTimer = setTimeout(() => {
      const all = document.querySelectorAll(REVEAL_SELECTOR);
      all.forEach((el) => {
        if (!isRevealed(el)) markRevealed(el);
      });
    }, 450);

    /* Konten yang muncul belakangan (async/filter/pagination) ikut di-observe.
       Akumulasi mutasi yang pending: jangan drop bila RAF belum selesai. */
    let pendingMuts = [];
    let raf = 0;
    const mo = new MutationObserver((mutations) => {
      pendingMuts.push(...mutations);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const batch = pendingMuts;
        pendingMuts = [];
        for (const m of batch) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) scan(node);
          }
        }
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(safetyTimer);
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
    };
  }, [pathname]);

  return null;
}
