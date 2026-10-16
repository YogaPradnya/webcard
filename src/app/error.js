'use client';

import { ErrorRetry } from '@/components/PageState';

export default function Error({ error, reset }) {
  return (
    <div className="page">
      <ErrorRetry message={error?.message || 'Gagal memuat halaman.'} onRetry={reset} />
    </div>
  );
}
