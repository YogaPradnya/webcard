'use client';

import { useEffect, useState } from 'react';

const KEY = 'kartuyogaa-theme';
// Event internal: tombol tema di sidebar & topbar (dua instance) saling sinkron
// plus tab lain lewat event 'storage'.
const EVT = 'kartuyogaa-theme-change';

function getInitial() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* abaikan: storage tidak tersedia */ }
  const cur = document.documentElement.getAttribute('data-theme');
  if (cur === 'light' || cur === 'dark') return cur;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export default function ThemeToggle() {
  // Init sinkron dari localStorage/DOM agar tidak kedip ke dark dulu.
  const [theme, setTheme] = useState(getInitial);

  useEffect(() => {
    function sync(t) {
      if (t === 'light' || t === 'dark') setTheme(t);
    }
    const onLocal = (e) => sync(e.detail);
    const onStorage = (e) => { if (e.key === KEY) sync(e.newValue); };
    window.addEventListener(EVT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVT, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(KEY, theme); } catch { /* abaikan */ }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={() => {
        setTheme(next);
        window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
      }}
      aria-label={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
      title={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
      suppressHydrationWarning
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
