'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
// Menu utama 4 saja: Book, Battle, Chat Global, Profil (Trade & Leaderboard via Profil).
export default function Sidebar({ username }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeBattle, setActiveBattle] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/battle/mine');
        const data = await res.json().catch(() => ({}));
        if (alive && data.success) setActiveBattle((data.rooms || []).length);
      } catch { /* abaikan */ }
    })();
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/battle/mine');
        const data = await res.json().catch(() => ({}));
        if (alive && data.success) setActiveBattle((data.rooms || []).length);
      } catch { /* abaikan */ }
    }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [pathname]);

  async function onLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const item = (href, label, badge) => (
    <Link key={href} href={href} className={pathname === href ? 'nav-item active' : 'nav-item'}>
      {label}
      {badge > 0 ? <span className="nav-badge" aria-label={`${badge} aktif`}>{badge}</span> : null}
    </Link>
  );

  const desktopLinks = (
    <>
      {item('/book', 'Book Kartu')}
      {item('/battle', activeBattle > 0 ? `Battle (${activeBattle})` : 'Battle', activeBattle)}
      {item('/chat', 'Chat Global')}
      {item('/profile', 'Profil')}
    </>
  );

  const mobileLinks = (
    <>
      {item('/book', 'Book')}
      {item('/battle', activeBattle > 0 ? `Battle (${activeBattle})` : 'Battle', activeBattle)}
      {item('/chat', 'Chat')}
      {item('/profile', 'Profil')}
    </>
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">Book Kartu Animein</div>
        {username ? <div className="sidebar-user">@{username}</div> : null}
        <nav className="sidebar-nav">{desktopLinks}</nav>
        <div className="sidebar-bottom">
          <Link href="/terms" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'underline', marginBottom: 8 }}>
            Syarat & Ketentuan
          </Link>
          <ThemeToggle />
          <button className="btn btn-ghost sidebar-logout" onClick={onLogout}>
            Keluar
          </button>
        </div>
      </aside>

      <header className="topbar">
        <span className="topbar-title">Animein</span>
        <span className="topbar-spacer" />
        <ThemeToggle />
      </header>

      <nav className="bottomnav">{mobileLinks}</nav>
    </>
  );
}
