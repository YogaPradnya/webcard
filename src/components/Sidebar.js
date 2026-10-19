'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { fetchJson } from '@/lib/fetchJson';
import { useShopEnabled } from '@/hooks/useShopEnabled';
import { LEGAL_LINKS } from '@/lib/legal';

// Cangkang navigasi: sidebar kiri (desktop) + topbar + bottomnav (mobile).
export default function Sidebar({ username }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeBattle, setActiveBattle] = useState(0);
  const shopOn = useShopEnabled();

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
      await pollMine();
    })();
    const t = setInterval(async () => {
      if (document.hidden) return;
      await pollMine();
    }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [pathname]);

  async function onLogout() {
    await fetchJson('/api/auth/logout', { method: 'POST', ms: 10000 }).catch(() => ({}));
    router.push('/login');
  }

  const [pendingNav, setPendingNav] = useState(null);

  useEffect(() => {
    setPendingNav(null);
    function handlePop() {
      setPendingNav(null);
    }
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [pathname]);

  const item = (href, label, badge) => {
    const isCurrent = pathname === href;
    const isPending = pendingNav === href && !isCurrent;
    let cls = 'nav-item';
    if (isCurrent) cls += ' active';
    if (isPending) cls += ' pending-nav';

    return (
      <Link
        key={href}
        href={href}
        prefetch={false}
        className={cls}
        onClick={() => {
          if (href !== pathname) setPendingNav(href);
        }}
      >
        {label}
        {isPending ? (
          <span className="nav-spinner" aria-hidden="true" />
        ) : badge > 0 ? (
          <span className="nav-badge" aria-label={`${badge} aktif`}>{badge}</span>
        ) : null}
      </Link>
    );
  };

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
        <Link href="/" className="sidebar-brand">Book Kartu Animein</Link>
        {username ? <div className="sidebar-user">@{username}</div> : null}
        <nav className="sidebar-nav">{desktopLinks}</nav>
        <div className="sidebar-bottom">
          <ThemeToggle />
          <div className="sidebar-legal">
            <div className="sidebar-legal-title">Legal &amp; Bantuan</div>
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} prefetch={false}>{link.label}</Link>
            ))}
          </div>
          {username ? (
            <button className="btn btn-ghost sidebar-logout" onClick={onLogout}>
              Keluar
            </button>
          ) : (
            <Link href="/login" className="btn btn-ghost sidebar-logout">Masuk</Link>
          )}
        </div>
      </aside>

      <header className="topbar">
        <Link href="/" className="topbar-title">Animein</Link>
        <span className="topbar-spacer" />
        <span className="topbar-toggle"><ThemeToggle /></span>
        {username ? (
          <button className="btn btn-ghost topbar-logout" onClick={onLogout}>
            Keluar
          </button>
        ) : (
          <Link href="/login" className="btn btn-ghost topbar-logout">Masuk</Link>
        )}
      </header>

      <nav className="bottomnav">{mobileLinks}</nav>
    </>
  );
}
