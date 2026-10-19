'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import MissionList from '@/components/MissionList';
import { optImg } from '@/lib/images';
import { fetchJson, fetchLenient } from '@/lib/fetchJson';
import { postJson } from '@/lib/postJson';
import { useMe } from '@/hooks/useMe';
import { useShopEnabled } from '@/hooks/useShopEnabled';
import { displayBorderColor } from '@/lib/displayBorder';
import { hashNameLower } from '@/lib/hash';
import { CS_EMAIL, CS_EMAIL_URL, CS_WHATSAPP, CS_WHATSAPP_URL } from '@/lib/contact';

function avatarColor(name) {
  const pastels = ['#f7eafc', '#dbeafd', '#d7f2e3', '#fffaea', '#e9e3fb', '#ffedd7'];
  return pastels[hashNameLower(name || '?') % pastels.length];
}

function displayShowcaseStyle(c) {
  return { borderColor: displayBorderColor(c) };
}

export default function ProfilePage() {
  const { me } = useMe();
  const shopOn = useShopEnabled();
  const [profile, setProfile] = useState(null);
  const [lbMini, setLbMini] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showcasePick, setShowcasePick] = useState('');
  const [showcaseSource, setShowcaseSource] = useState('gacha');
  const [ownedCards, setOwnedCards] = useState([]);
  const [busy, setBusy] = useState('');
  const [displayCards, setDisplayCards] = useState([]);
  const [customSlots, setCustomSlots] = useState([]);
  const [dailyMissions, setDailyMissions] = useState([]);
  const [weeklyMissions, setWeeklyMissions] = useState([]);
  const [missionClaiming, setMissionClaiming] = useState('');
  const [missionToast, setMissionToast] = useState('');
  const [showTitles, setShowTitles] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      if (!me) return; // useMe menendang ke /login bila belum login
      // SATU request untuk seluruh halaman (dulu 7 endpoint paralel).
      // Profil wajib; seksi lain punya flag sections.* -> halaman tetap tampil.
      const { ok, data } = await fetchJson('/api/profile/summary');
      if (!ok || !data.success) {
        setError(data.message || 'Gagal memuat profil.');
        return;
      }
      const pData = data.profile;
      setProfile(pData);
      const sec = data.sections || {};
      if (sec.ownedCards) {
        setOwnedCards(data.ownedCards || []);
      }
      let activeDisplay = null;
      if (sec.display) {
        setDisplayCards(data.displayCards || []);
        activeDisplay = (data.displayCards || []).find((c) => c.showcase) || null;
      }
      // Satu slot pajangan: sumber efektif samakan dengan server
      // (auto = display bila ada, else gacha). Pilihan tersimpan eksplisit
      // saat user menekan Simpan.
      const src = sec.showcaseSource && data.showcaseSource ? data.showcaseSource : 'auto';
      const eff = src === 'gacha' ? 'gacha'
        : src === 'display' ? 'display'
        : activeDisplay ? 'display' : 'gacha';
      setShowcaseSource(eff);
      if (eff === 'display' && activeDisplay) setShowcasePick(activeDisplay.name);
      else if (pData?.showcase) setShowcasePick(pData.showcase.name);
      else setShowcasePick('');
      if (sec.leaderboard) setLbMini((data.leaderboard || []).slice(0, 5));
      if (sec.slots) setCustomSlots(data.slots || []);
      if (sec.missions) {
        setDailyMissions(data.daily || []);
        setWeeklyMissions(data.weekly || []);
      }
    } catch (e) {
      setError(e?.name === 'AbortError' ? 'Server lambat (timeout). Coba lagi.' : 'Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!me) return; // tunggu sesi (useMe menendang ke /login bila belum login)
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function onClaimMission(period, missionId) {
    setMissionClaiming(`${period}:${missionId}`);
    setMissionToast('');
    try {
      const { ok, data } = await postJson('/api/missions/claim', { period, missionId });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal klaim misi.');
        return;
      }
      setMissionToast(`+${data.xp} XP masuk! 🎉`);
      // Update optimistik: tandai diklaim tanpa reload penuh (tidak kelap-kelip).
      const mark = (list) => (list || []).map((m) => (
        m.id === missionId ? { ...m, claimed: true, canClaim: false, done: true, count: m.target } : m
      ));
      if (period === 'daily') setDailyMissions((prev) => mark(prev));
      else setWeeklyMissions((prev) => mark(prev));
      if (data.newXp != null) {
        setProfile((p) => (p ? { ...p, xp: data.newXp } : p));
      }
      // Sinkron ringan di background: misi + XP profil saja (tanpa /api/cards yang berat).
      try {
        const [mData, pData] = await Promise.all([fetchLenient('/api/missions'), fetchLenient('/api/profile')]);
        if (mData.success) {
          setDailyMissions(mData.daily || []);
          setWeeklyMissions(mData.weekly || []);
        }
        if (pData.success && pData.profile) setProfile(pData.profile);
      } catch { /* abaikan: state optimistik sudah benar */ }
    } finally {
      setMissionClaiming('');
    }
  }

  // Satu slot pajangan: simpan ke endpoint sesuai sumber, lalu kunci
  // pilihan sumber agar .profil chat ikut (ganti `auto` -> eksplisit).
  async function saveShowcase(e) {
    e.preventDefault();
    if (!showcasePick) return;
    setBusy('showcase');
    setError('');
    try {
      const isDisplay = showcaseSource === 'display';
      const { ok, data } = await postJson(
        isDisplay ? '/api/display/showcase' : '/api/cards/showcase',
        isDisplay ? { name: showcasePick, showcase: true } : { charName: showcasePick, showcase: true }
      );
      if (!ok || !data.success) {
        setError(data.message || 'Gagal ganti pajangan.');
        return;
      }
      const srcRes = await postJson('/api/profile/showcase-source', { source: showcaseSource });
      if (!srcRes.ok || !srcRes.data.success) {
        setError(srcRes.data.message || 'Pajangan tersimpan, tapi pilihan sumber gagal.');
        return;
      }
      await load();
    } finally {
      setBusy('');
    }
  }

  async function equipTitle(title) {
    setBusy(`title:${title}`);
    setError('');
    try {
      const { ok, data } = await postJson('/api/profile/title', { title });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal pasang gelar.');
        return;
      }
      setProfile((p) => (p ? { ...p, title } : p));
    } finally {
      setBusy('');
    }
  }

  async function removeTitle() {
    setBusy('title:');
    try {
      await postJson('/api/profile/title', { title: '' });
      setProfile((p) => (p ? { ...p, title: '' } : p));
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Profil" lines={[35, 80, 60]} />;
  }

  // Aksen banner profil mengikuti tier gelar yang sedang dipasang.
  const equipped = profile ? (profile.titles?.earned || []).find((t) => t.title === profile.title) : null;
  const bannerTier = equipped
    ? String(equipped.tier || /\btier-([a-z]+)\.svg/.exec(equipped.icon || '')?.[1] || '').toLowerCase()
    : '';

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand"><h1>Profil</h1></div>
          <ErrorRetry message={error} onRetry={load} />

          {profile ? (
            <>
              <div className={`card profile-hero${bannerTier ? ` banner-${bannerTier}` : ''}`}>
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
                    <div className="profile-sub">{profile.xp} XP</div>
                  </div>
                </div>
                <div className="profile-stats">
                  <div className="profile-stat"><b>{profile.owned}/{profile.total}</b><span>kartu</span></div>
                  <div className="profile-stat"><b>{profile.wins}W-{profile.losses}L</b><span>PvP WR {profile.winRate}%</span></div>
                  <div className="profile-stat"><b>{profile.titles.earned.length}</b><span>gelar</span></div>
                </div>
                {(() => {
                  const showDisplay = showcaseSource === 'display' && profile.displayShowcase;
                  const showGacha = !showDisplay && profile.showcase;
                  if (showDisplay) {
                    const c = profile.displayShowcase;
                    return (
                      <div className="profile-showcase" style={{ marginTop: 12, ...displayShowcaseStyle(c) }}>
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" style={{ border: `3px solid ${displayBorderColor(c)}` }} />
                        ) : null}
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pajangan • tampil di .profil</div>
                          <div style={{ fontWeight: 800 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--body)' }}>{c.grade}</div>
                        </div>
                      </div>
                    );
                  }
                  if (showGacha) {
                    const s = profile.showcase;
                    return (
                      <div className="profile-showcase">
                        {s.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={optImg(s.imageUrl, 300)} alt={s.name} loading="lazy" decoding="async" />
                        ) : null}
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pajangan • tampil di .profil</div>
                          <div style={{ fontWeight: 800 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--body)' }}>{s.tier} ★{s.level} • PWR {s.power}</div>
                        </div>
                      </div>
                    );
                  }
                  return <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>Belum ada pajangan. Pilih di bawah.</div>;
                })()}
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

              <div className="card" style={{ marginTop: 16 }}>
                <div className="section-title">Bantuan & Customer Service</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  Ada kendala pesanan, pembayaran, atau akun? Hubungi CS Animein melalui:
                </div>
                <div className="contact-grid">
                  <a className="contact-link" href={CS_EMAIL_URL}>
                    <span className="contact-ico" aria-hidden="true">✉</span>
                    <span className="contact-copy">
                      <span className="contact-label">Email</span>
                      <span className="contact-value">{CS_EMAIL}</span>
                    </span>
                  </a>
                  <a className="contact-link" href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <span className="contact-ico" aria-hidden="true">☎</span>
                    <span className="contact-copy">
                      <span className="contact-label">WhatsApp</span>
                      <span className="contact-value">{CS_WHATSAPP}</span>
                    </span>
                  </a>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  Sertakan username dan bukti pembayaran agar penanganan lebih cepat.
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
                <div className="section-title">Pajangan</div>
                <div className="chip-row" role="radiogroup" aria-label="Sumber pajangan" style={{ marginBottom: 8 }}>
                  <button
                    key="gacha"
                    type="button"
                    className={showcaseSource === 'gacha' ? 'chip active' : 'chip'}
                    aria-pressed={showcaseSource === 'gacha'}
                    disabled={ownedCards.length === 0}
                    onClick={() => { setShowcaseSource('gacha'); setShowcasePick(''); }}
                  >
                    Kartu gacha
                  </button>
                  <button
                    key="display"
                    type="button"
                    className={showcaseSource === 'display' ? 'chip active' : 'chip'}
                    aria-pressed={showcaseSource === 'display'}
                    disabled={displayCards.length === 0}
                    onClick={() => { setShowcaseSource('display'); setShowcasePick(''); }}
                  >
                    Kartu spesial
                  </button>
                </div>
                {showcaseSource === 'display' && displayCards.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                    Belum ada kartu spesial. Kartu spesial hanya bisa di-gift admin.
                  </div>
                ) : null}
                <form onSubmit={saveShowcase} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={showcasePick}
                    onChange={(e) => setShowcasePick(e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                    aria-label="Pilih pajangan"
                    disabled={showcaseSource === 'display' ? displayCards.length === 0 : ownedCards.length === 0}
                  >
                    <option value="">-- pilih kartumu --</option>
                    {showcaseSource === 'display'
                      ? displayCards.map((c) => (
                        <option key={c.id || c.name} value={c.name}>{c.name} [{c.grade}]</option>
                      ))
                      : ownedCards.map((c) => (
                        <option key={c.name} value={c.name}>{c.name} [{c.tier}] ★{c.level}</option>
                      ))}
                  </select>
                  <button className="btn" type="submit" disabled={!showcasePick || busy === 'showcase'} style={{ width: 'auto', padding: '0 20px' }}>
                    {busy === 'showcase' ? '...' : 'Simpan'}
                  </button>
                </form>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  Pajangan tampil di profil, badge Book, dan .profil chat.
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="section-title" style={{ margin: 0 }}>
                    Gelar ({profile.titles.earned.length} didapat)
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ width: 'auto', minHeight: 0, padding: '8px 16px', marginLeft: 'auto' }}
                    onClick={() => setShowTitles(true)}
                  >
                    🎖 Lihat Gelar
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                  {profile.title ? `Terpasang: [${profile.title}]` : 'Belum ada gelar terpasang.'}
                </div>
              </div>

              {showTitles ? (
                <div className="modal-backdrop" onClick={() => setShowTitles(false)} role="presentation">
                  <div
                    className="modal-card"
                    role="dialog"
                    aria-label="Gelar dan progres"
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: 560, maxHeight: '82vh', overflowY: 'auto' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div className="section-title" style={{ margin: 0 }}>
                        Gelar ({profile.titles.earned.length} didapat)
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto', minHeight: 0, padding: '6px 12px', marginLeft: 'auto' }}
                        onClick={() => setShowTitles(false)}
                      >
                        Tutup
                      </button>
                    </div>
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
                </div>
              ) : null}

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
