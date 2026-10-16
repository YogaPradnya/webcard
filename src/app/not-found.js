import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <h1>Halaman tidak ditemukan</h1>
      <p>Path yang kamu buka tidak ada.</p>
      <Link className="btn" href="/book">Ke Book</Link>
    </div>
  );
}
