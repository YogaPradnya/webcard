'use client';

import { useEffect, useState } from 'react';

const KEY = 'animein-theme';

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
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem(KEY, theme); } catch { /* abaikan */ }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
      title={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
      suppressHydrationWarning
    >
      {theme === 'dark' ? '☀️ White mode' : '🌙 Dark mode'}
    </button>
  );
}
