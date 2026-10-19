import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

// Navigasi publik sederhana untuk landing page dan halaman legal.
// Sengaja tidak memakai Sidebar aplikasi agar pengunjung yang belum login
// tetap melihat menu yang relevan.
export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label={`${SITE_NAME} — beranda`}>
          <span className="site-brand-mark" aria-hidden="true">A</span>
          <span>{SITE_NAME}</span>
        </Link>
        <nav className="site-nav" aria-label="Navigasi utama">
          <Link href="/#produk">Produk</Link>
          <Link href="/#cara">Cara Kerja</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/#legal">Legal</Link>
          <Link href="/contact">Kontak</Link>
          <Link href="/login" className="site-nav-cta">Masuk</Link>
        </nav>
      </div>
    </header>
  );
}
