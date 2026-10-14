'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import MissionList from '@/components/MissionList';
import { optImg } from '@/lib/images';

function avatarColor(name) {
  const pastels = ['#f7eafc', '#dbeafd', '#d7f2e3', '#fffaea', '#e9e3fb', '#ffedd7'];
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % pastels.length;
  return pastels[h];
}

const DISPLAY_BORDER_FALLBACK = {
  gold: '#eab308',
  rainbow: '#a855f7',
  neon: '#22d3ee',
  sakura: '#f9a8d4',
  shadow: '#111827',
  classic: '#9aa3b2',
};

function displayBorderColor(c) {
  if (!c) return '#9aa3b2';
  if (c.borderType === 'custom' && c.borderColor) return c.borderColor;
  return DISPLAY_BORDER_FALLBACK[c.borderType] || '#9aa3b2';
}

function displayShowcaseStyle(c) {
  return { borderColor: displayBorderColor(c) };
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [lbMini, setLbMini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showcasePick, setShowcasePick] = useState('');
  const [ownedCards, setOwnedCards] = useState([]);
  const [busy, setBusy] = useState('');
  const [displayCards, setDisplayCards] = useState([]);
  const [displayPick, setDisplayPick] = useState('');
  const [profilSource, setProfilSource] = useState('auto');
  const [customSlots, setCustomSlots] = useState([]);
  const [shopOn, setShopOn] = useState(false);
  const [dailyMissions, setDailyMissions] = useState([]);
  const [weeklyMissions, setWeeklyMissions] = useState([]);
  const [missionClaiming, setMissionClaiming] = useState('');
  const [missionToast, setMissionToast] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData.success) {
        router.push('/login');
        return;
      }
      setMe(meData);
      const [pRes, cRes, lbRes, dRes, srcRes, slotRes, shopRes, mRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/cards'),
        fetch('/api/battle/leaderboard?tab=pvp'),
        fetch('/api/display'),
        fetch('/api/profile/showcase-source'),
        fetch('/api/shop/slots'),
        fetch('/api/shop/packages'),
        fetch('/api/missions'),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      if (!pRes.ok || !pData.success) {
        setError(pData.message || 'Gagal memuat profil.');
        return;
      }
      setProfile(pData.profile);
      const cData = await cRes.json().catch(() => ({}));
      if (cData.success) {
        const owned = (cData.cards || []).filter((c) => c.owned);
        setOwnedCards(owned);
        if (pData.profile?.showcase) setShowcasePick(pData.profile.showcase.name);
      }
      const lbData = await lbRes.json().catch(() => ({}));
      if (lbData.success) setLbMini((lbData.leaderboard || []).slice(0, 5));
      const dData = await dRes.json().catch(() => ({}));
      if (dData.success) {
        setDisplayCards(dData.cards || []);
        const active = (dData.cards || []).find((c) => c.showcase);
        if (active) setDisplayPick(active.name);
      }
      const srcData = await srcRes.json().catch(() => ({}));
      if (srcData.success && srcData.source) setProfilSource(srcData.source);
      const slotData = await slotRes.json().catch(() => ({}));
      if (slotData.success) setCustomSlots(slotData.slots || []);
      const shopData = await shopRes.json().catch(() => ({}));
      if (shopData.success) setShopOn(Boolean(shopData.enabled));
      const mData = await mRes.json().catch(() => ({}));
      if (mData.success) {
        setDailyMissions(mData.daily || []);
        setWeeklyMissions(mData.weekly || []);
      }
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onClaimMission(period, missionId) {
    setMissionClaiming(`${period}:${missionId}`);
    setMissionToast('');
    try {
      const res = await fetch('/api/missions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, missionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal klaim misi.');
        return;
      }
      setMissionToast(`+${data.xp} XP masuk! 🎉`);
      await load();
    } finally {
      setMissionClaiming('');
    }
  }

  async function saveShowcase(e) {
    e.preventDefault();
    if (!showcasePick) return;
    setBusy('showcase');
    setError('');
    try {
      const res = await fetch('/api/cards/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charName: showcasePick, showcase: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal ganti pajangan.');
        return;
      }
      await load();
    } finally {
      setBusy('');
    }
  }

  async function saveDisplayShowcase(e) {
    e.preventDefault();
    if (!displayPick) return;
    setBusy('display-showcase');
    setError('');
    try {
      const res = await fetch('/api/display/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayPick, showcase: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal ganti pajangan spesial.');
        return;
      }
      await load();
    } finally {
      setBusy('');
    }
  }

  async function saveProfilSource(source) {
    setBusy('profil-source');
    setError('');
    try {
      const res = await fetch('/api/profile/showcase-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal simpan pilihan.');
        return;
      }
      setProfilSource(data.source);
    } finally {
      setBusy('');
    }
  }

  async function equipTitle(title) {
    setBusy(`title:${title}`);
    setError('');
    try {
      const res = await fetch('/api/profile/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal pasang gelar.');
        return;
      }
      await load();
    } finally {
      setBusy('');
    }
  }

  async function removeTitle() {
    setBusy('title:');
    try {
      await fetch('/api/profile/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      await load();
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Profil" lines={[35, 80, 60]} />;
  }

  const pct = profile ? Math.round((profile.xpInto / Math.max(1, profile.xpSpan)) * 100) : 0;

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Profil</h1></div>
          <ErrorRetry message={error} onRetry={load} />

          {profile ? (
            <>
              <div className="card profile-hero">
                <div className="profile-top">
                  <div className="profile-avatar" style={{ background: avatarColor(profile.username) }}>
                    {String(profile.username || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="profile-name">{profile.username}</div>
                    {profile.title ? (
                      <div className="profile-title">
                        {(() => {
                          const found = (profile.titles.earned || []).find((t) => t.title === profile.title);
                          return found?.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={found.icon} alt="" width={20} height={20} className="title-badge-sm" loading="lazy" decoding="async" />
                          ) : null;
                        })()}
                        [{profile.title}] <button type="button" className="link-btn" onClick={removeTitle} disabled={busy === 'title:'}>lepas</button></div>
                    ) : (
                      <div className="profile-sub">Belum ada gelar terpasang</div>
                    )}
                    <div className="profile-sub">Lv {profile.level} • {profile.xp} XP • sisa {profile.xpSisa} XP ke Lv {profile.level + 1}</div>
                  </div>
                </div>
                <div className="progress-wrap">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="profile-stats">
                  <div className="profile-stat"><b>{profile.owned}/{profile.total}</b><span>kartu</span></div>
                  <div className="profile-stat"><b>{profile.wins}W-{profile.losses}L</b><span>PvP WR {profile.winRate}%</span></div>
                  <div className="profile-stat"><b>{profile.titles.earned.length}</b><span>gelar</span></div>
                </div>
                {profile.showcase ? (
                  <div className="profile-showcase">
                    {profile.showcase.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={optImg(profile.showcase.imageUrl, 300)} alt={profile.showcase.name} loading="lazy" decoding="async" />
                    ) : null}
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pajangan{(profilSource === 'gacha' || (profilSource === 'auto' && !profile.displayShowcase)) ? ' • tampil di .profil' : ''}</div>
                      <div style={{ fontWeight: 800 }}>{profile.showcase.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--body)' }}>{profile.showcase.tier} ★{profile.showcase.level} • PWR {profile.showcase.power}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>Belum ada pajangan. Pilih di bawah.</div>
                )}
                {profile.displayShowcase ? (
                  <div className="profile-showcase" style={{ marginTop: 12, ...displayShowcaseStyle(profile.displayShowcase) }}>
                    {profile.displayShowcase.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={optImg(profile.displayShowcase.imageUrl, 300)} alt={profile.displayShowcase.name} loading="lazy" decoding="async" style={{ border: `3px solid ${displayBorderColor(profile.displayShowcase)}` }} />
                    ) : null}
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pajangan spesial 🎁{(profilSource === 'display' || (profilSource === 'auto' && profile.displayShowcase)) ? ' • tampil di .profil' : ''}</div>
                      <div style={{ fontWeight: 800 }}>{profile.displayShowcase.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--body)' }}>{profile.displayShowcase.grade}</div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Menu</div>
                <div className="menu-grid">
                  <Link href="/gacha" className="menu-tile"><span className="menu-ico">●</span>Gacha</Link>
                  <Link href="/trade" className="menu-tile"><span className="menu-ico">⇄</span>Trade</Link>
                  <Link href="/convert" className="menu-tile"><span className="menu-ico">◈</span>Konversi</Link>
                  <Link href="/leaderboard" className="menu-tile"><span className="menu-ico">★</span>Rank</Link>
                  <Link href="/battle" className="menu-tile"><span className="menu-ico">VS</span>Battle</Link>
                  <Link href="/book" className="menu-tile"><span className="menu-ico">▦</span>Book</Link>
                  {shopOn ? <Link href="/shop" className="menu-tile"><span className="menu-ico">◉</span>Shop</Link> : null}
                </div>
              </div>

              <div className="mission-duo">
              <div className="card">
                <div className="section-title">Misi Harian (reset 00:00 WIB)</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Vs AI tidak dihitung — hanya mode PvP (vs teman).
                </div>
                {missionToast ? (
                  <div className="trade-fair ok" role="status" style={{ marginBottom: 8 }}>{missionToast}</div>
                ) : null}
                <MissionList items={dailyMissions} period="daily" claiming={missionClaiming} onClaim={onClaimMission} />
              </div>

              <div className="card">
                <div className="section-title">Misi Mingguan (reset Senin)</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Vs teman = mode PvP (vs AI tidak dihitung).
                </div>
                <MissionList items={weeklyMissions} period="weekly" claiming={missionClaiming} onClaim={onClaimMission} />
              </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Ganti pajangan</div>
                <form onSubmit={saveShowcase} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select className="select" value={showcasePick} onChange={(e) => setShowcasePick(e.target.value)} style={{ flex: 1, minWidth: 180 }} aria-label="Pilih pajangan">
                    <option value="">-- pilih kartumu --</option>
                    {ownedCards.map((c) => (
                      <option key={c.name} value={c.name}>{c.name} [{c.tier}] ★{c.level}</option>
                    ))}
                  </select>
                  <button className="btn" type="submit" disabled={!showcasePick || busy === 'showcase'} style={{ width: 'auto', padding: '0 20px' }}>
                    {busy === 'showcase' ? '...' : 'Simpan'}
                  </button>
                </form>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  Pajangan tampil di profil dan badge Book.
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Ganti pajangan spesial 🎁</div>
                {displayCards.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Belum ada kartu pajangan. Kartu spesial hanya bisa di-gift admin.</div>
                ) : (
                  <form onSubmit={saveDisplayShowcase} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select className="select" value={displayPick} onChange={(e) => setDisplayPick(e.target.value)} style={{ flex: 1, minWidth: 180 }} aria-label="Pilih pajangan spesial">
                      <option value="">-- pilih kartu pajangan --</option>
                      {displayCards.map((c) => (
                        <option key={c.id || c.name} value={c.name}>{c.name} [{c.grade}]</option>
                      ))}
                    </select>
                    <button className="btn" type="submit" disabled={!displayPick || busy === 'display-showcase'} style={{ width: 'auto', padding: '0 20px' }}>
                      {busy === 'display-showcase' ? '...' : 'Simpan'}
                    </button>
                  </form>
                )}
              </div>

              {shopOn ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Kartu Pajangan Custom ({customSlots.length}/50)</div>
                {customSlots.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Belum punya slot. <Link href="/shop" style={{ color: 'var(--link)', fontWeight: 800 }}>Beli di Shop</Link> (Rp10rb/slot).
                  </div>
                ) : (
                  <div className="pick-grid">
                    {customSlots.map((s) => (
                      <div key={s.id} className="card-item">
                        {s.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="card-art" src={optImg(s.imageUrl, 300)} alt={s.name} loading="lazy" decoding="async" />
                        ) : (
                          <div className="card-art" />
                        )}
                        <div className="card-meta">
                          <div className="card-name">{s.name}</div>
                          <div className="card-anime">sisa ubah {s.editsLeft}/3</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              ) : null}

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Tampil di .profil chat</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Pilih satu pajangan yang selalu tampil di .profil chat. Otomatis = kartu pajangan bila ada.
                </div>
                <div className="chip-row" role="radiogroup" aria-label="Pajangan profil">
                  {[
                    ['auto', 'Otomatis'],
                    ['gacha', 'Kartu gacha'],
                    ['display', 'Kartu pajangan 🎁'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={profilSource === value ? 'chip active' : 'chip'}
                      onClick={() => saveProfilSource(value)}
                      disabled={busy === 'profil-source'}
                      aria-pressed={profilSource === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Gelar ({profile.titles.earned.length} didapat)</div>
                {profile.titles.earned.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Belum ada gelar. Kumpulkan kartu Mythic atau lengkapi 1 tier.</div>
                ) : (
                  <div className="title-grid">
                    {profile.titles.earned.map((t) => (
                      <div key={t.id} className={profile.title === t.title ? 'title-tile active' : 'title-tile earned'}>
                        <div className="title-top">
                          {t.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.icon} alt={t.title} width={40} height={40} className="title-badge" loading="lazy" decoding="async" />
                          ) : null}
                          <div className="title-name">{t.title}</div>
                        </div>
                        <div className="title-desc">{t.kind === 'mythic' ? `Punya ${t.cardName}` : `Lengkap ${t.tier}`}</div>
                        {profile.title === t.title ? (
                          <div className="title-active">Terpasang ✓</div>
                        ) : (
                          <button type="button" className="btn btn-ghost" style={{ minHeight: 0, padding: '4px 10px', fontSize: 12 }} disabled={busy === `title:${t.title}`} onClick={() => equipTitle(t.title)}>
                            Pasang
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {profile.titles.locked.length > 0 ? (
                  <>
                    <div className="section-title" style={{ marginTop: 16 }}>Belum didapat</div>
                    <div className="title-grid">
                      {profile.titles.locked.map((t) => (
                        <div key={t.id} className="title-tile locked">
                          <div className="title-top">
                            {t.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.icon} alt={t.title} width={40} height={40} className="title-badge locked-img" loading="lazy" decoding="async" />
                            ) : null}
                            <div className="title-name">{t.title}</div>
                          </div>
                          <div className="title-desc">
                            {t.kind === 'mythic' ? `Butuh kartu ${t.cardName}` : `${t.progress}/${t.total} ${t.tier}`}
                          </div>
                          {t.kind === 'tier' ? (
                            <div className="progress-bar" style={{ marginTop: 6 }}>
                              <div className="progress-fill" style={{ width: `${t.total ? Math.round((t.progress / t.total) * 100) : 0}%` }} />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Koleksi per tier</div>
                {profile.perTier.map((p) => (
                  <div key={p.tier} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', fontSize: 12, fontWeight: 700 }}>
                      <span>{p.tier}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{p.owned}/{p.total}</span>
                    </div>
                    <div className="progress-bar" style={{ marginTop: 4 }}>
                      <div className="progress-fill" style={{ width: `${p.total ? Math.round((p.owned / p.total) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Leaderboard PvP (5 besar)</div>
                {lbMini.length === 0 ? <div style={{ fontSize: 13 }}>Belum ada battle PvP.</div> : lbMini.map((u, i) => (
                  <div className="user-row" key={`${u.username}-${i}`}>
                    <span style={{ fontWeight: 700, width: 28 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 700 }}>@{u.username}{u.isMe ? ' (kamu)' : ''}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--body)' }}>{u.wins}W - {u.losses}L</span>
                  </div>
                ))}
                <Link href="/leaderboard" className="btn btn-ghost" style={{ marginTop: 12, textAlign: 'center', textDecoration: 'none', display: 'block', lineHeight: '40px' }}>
                  Lihat semua
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
