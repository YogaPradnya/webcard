'use client';

// Blok error seragam dengan tombol coba lagi.
export default function RetryAlert({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert-error">
      {message}{' '}
      {onRetry ? (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: 'auto', minHeight: 0, padding: '4px 12px', marginLeft: 8 }}
          onClick={onRetry}
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}
