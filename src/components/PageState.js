'use client';

import Sidebar from '@/components/Sidebar';

// Kerangka loading seragam semua halaman (ganti 11 blok duplikat).
export function PageSkeleton({ username, title = 'Memuat...', lines = [40, 80] }) {
  return (
    <div className="layout">
      <Sidebar username={username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>{title}</h1></div>
          <div className="card">
            {lines.map((w, i) => (
              <div key={i} className="skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Error + tombol coba lagi seragam.
export function ErrorRetry({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert-error">
      {message}{' '}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: 'auto', minHeight: 0, padding: '4px 12px' }}
        onClick={onRetry}
      >
        Coba lagi
      </button>
    </div>
  );
}
