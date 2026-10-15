'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { fetchJson } from '@/lib/fetchJson';

// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
export default function Sidebar({ username }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeBattle, setActiveBattle] = useState(0);
  const [shopOn, setShopOn] = useState(false);

  useEffect(() => {
    let alive = true;
    // Halaman /battle sudah poll /api/battle/mine sendiri -> jangan dobel.
    const skipMine = pathname === '/battle' || pathname?.startsWith('/battle/');
    async function pollMine() {
      if (skipMine) return;
      try {
        const { ok, data } = await fetchJson('/api/battle/mine', { ms: 10000 }).catch(() => ({ ok: false, data: {} }));
        if (alive && ok && data.success) setActiveBattle((data.rooms || []).length);
      } catch { /* abaikan */ }
    }
    (async () => {
      try {
        const { ok, data } = await fetchJson('/api/shop/packages', { ms: 10000 }).catch(() => ({ ok: false, data: {} }));
        if (alive && ok && data.success) setShopOn(Boolean(data.enabled));
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
    await fetchJson('/api/auth/logout', { method: 'POST', ms: 8000 }).catch(() => ({}));
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
