'use client';

import { useEffect, useRef } from 'react';

const COLORS = ['#a3e636', '#ffd94a', '#ff7a9c', '#7fb0ec', '#fffff6'];
const PIECES = 26;

/* Confetti layar penuh sekali jalan (auto hilang). Posisi/delay deterministik
   dari index supaya tidak ada hydration mismatch (komponen hanya muncul
   setelah interaksi pull). Prefers-reduced-motion dipatuhi via deco.css. */
export default function MythicConfetti({ onDone }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) doneRef.current();
    }, 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mythic-confetti" aria-hidden="true">
      {Array.from({ length: PIECES }).map((_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 6) * 110}ms`,
            animationDuration: `${1500 + (i % 5) * 240}ms`,
          }}
        />
      ))}
    </div>
  );
}
