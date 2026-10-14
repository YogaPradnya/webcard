'use client';

import { useEffect, useState } from 'react';

const KEY = 'animein-theme';

function getInitial() {
  if (typeof document !== 'undefined') {
    const cur = document.documentElement.getAttribute('data-theme');
    if (cur === 'light' || cur === 'dark') return cur;
  }
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  }
  return 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(getInitial());
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
      onClick={() => setTheme(next)}
      aria-label={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
      title={`Ganti ke mode ${next === 'dark' ? 'gelap' : 'terang'}`}
    >
      {theme === 'dark' ? '☀️ White mode' : '🌙 Dark mode'}
    </button>
  );
}
