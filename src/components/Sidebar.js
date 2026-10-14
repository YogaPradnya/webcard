'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
export default function Sidebar({ username }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeBattle, setActiveBattle] = useState(0);
  const [shopOn, setShopOn] = useState(false);

  useEffect(() => {
    let alive = true;
    // Timeout agar koneksi gantung tidak menumpuk (tiap navigasi = 2 fetch).
    async function fetchJson(path, ms = 10000) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(path, { signal: ctrl.signal });
        return await res.json().catch(() => ({}));
      } finally {
        clearTimeout(t);
      }
    }
    // Halaman /battle sudah poll /api/battle/mine sendiri -> jangan dobel.
    const skipMine = pathname === '/battle' || pathname?.startsWith('/battle/');
    async function pollMine() {
      if (skipMine) return;
      try {
        const data = await fetchJson('/api/battle/mine');
        if (alive && data.success) setActiveBattle((data.rooms || []).length);
      } catch { /* abaikan */ }
    }
    (async () => {
      try {
        const data = await fetchJson('/api/shop/packages');
        if (alive && data.success) setShopOn(Boolean(data.enabled));
      } catch { /* abaikan: shop tetap sembunyi */ }
      await pollMine();
    })();
    const t = setInterval(async () => {
      if (document.hidden) return;
      await pollMine();
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
      {shopOn ? item('/shop', 'Shop') : null}
      {item('/profile', 'Profil')}
    </>
  );

  const mobileLinks = (
    <>
      {item('/book', 'Book')}
      {item('/battle', activeBattle > 0 ? `Battle (${activeBattle})` : 'Battle', activeBattle)}
      {shopOn ? item('/shop', 'Shop') : null}
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
          <ThemeToggle />
          <Link href="/terms" style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'underline', marginBottom: 8 }}>
            Syarat & Ketentuan
          </Link>
          <button className="btn btn-ghost sidebar-logout" onClick={onLogout}>
            Keluar
          </button>
        </div>
      </aside>

      <header className="topbar">
        <span className="topbar-title">Animein</span>
        <span className="topbar-spacer" />
        <span className="topbar-toggle"><ThemeToggle /></span>
      </header>

      <nav className="bottomnav">{mobileLinks}</nav>
    </>
  );
}
