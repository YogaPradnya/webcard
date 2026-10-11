'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

// Cangkang navigasi: sidebar kiri (desktop), topbar + bottomnav (mobile).
// Mobile: atas hanya toggle dark mode + logout, menu pindah ke bawah.
export default function Sidebar({ username }) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const item = (href, label) => (
    <Link key={href} href={href} className={pathname === href ? 'nav-item active' : 'nav-item'}>
      {label}
    </Link>
  );

  const links = (
    <>
      {item('/book', 'Book Kartu')}
      {item('/trade', 'Trade Kartu')}
      {item('/battle', 'Battle')}
    </>
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">Book Kartu Animein</div>
        {username ? <div className="sidebar-user">@{username}</div> : null}
        <nav className="sidebar-nav">{links}</nav>
        <div className="sidebar-bottom">
          <ThemeToggle />
          <button className="btn btn-ghost sidebar-logout" onClick={onLogout}>
            Keluar
          </button>
        </div>
      </aside>

      <header className="topbar">
        <span className="topbar-spacer" />
        <ThemeToggle />
        <button className="btn btn-ghost topbar-logout" onClick={onLogout}>
          Keluar
        </button>
      </header>

      <nav className="bottomnav">{links}</nav>
    </>
  );
}
