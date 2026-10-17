import Link from 'next/link';
import Rara from '@/components/Rara';

export default function NotFound() {
  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <div className="card empty-state" style={{ marginTop: 40 }}>
        <Rara size={120} className="rara-bob" />
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Halaman tidak ditemukan</h1>
        <p style={{ fontSize: 13, color: 'var(--body)' }}>Path yang kamu buka tidak ada.</p>
        <Link className="btn" href="/book">Ke Book</Link>
      </div>
    </div>
  );
}
