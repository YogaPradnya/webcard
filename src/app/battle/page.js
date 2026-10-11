'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function HpBar({ hp, maxHp }) {
  const pct = Math.max(0, Math.round((hp / Math.max(1, maxHp)) * 100));
  const color = pct > 50 ? 'var(--success)' : pct > 20 ? '#eab308' : '#ef4444';
  return (
    <div style={{ background: 'var(--hairline)', borderRadius: 9999, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
    </div>
  );
}

function ConsPips({ value }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 800, marginRight: 4 }}>Cons {value}/10</span>
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: i < value ? 'var(--link)' : 'var(--hairline)',
            border: '1px solid var(--hairline-strong)',
          }}
        />
      ))}
    </div>
  );
}

function FighterCard({ f, active, art, fx, foe, onTap, tappable }) {
  const cls = ['fighter', active ? 'active' : '', !f.alive ? 'ko' : '', fx || ''].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      onClick={tappable ? onTap : undefined}
      style={tappable ? { cursor: 'pointer' } : undefined}
      title={tappable ? `Ganti ke ${f.name}` : f.name}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="fighter-img" src={art} alt={f.name} loading="lazy" />
      ) : (
        <div className="fighter-img" />
      )}
      <div className="fighter-body">
        <div className="fighter-name">{f.name}</div>
        <div className="fighter-hp">
          {f.hp}/{f.maxHp}
        </div>
        <HpBar hp={f.hp} maxHp={f.maxHp} />
        <div className="status-row">
          {f.shield > 0 ? <span className="status-badge">SHD {f.shield}</span> : null}
          {f.burn ? <span className="status-badge">BURN</span> : null}
          {f.regen ? <span className="status-badge">REGEN</span> : null}
          {f.stun ? <span className="status-badge">STUN</span> : null}
          {f.weaken > 0 ? <span className="status-badge">WEAK</span> : null}
          {f.focus ? <span className="status-badge">FOKUS</span> : null}
        </div>
      </div>
      {fx === 'float' && foe != null ? (
        <span className={foe < 0 ? 'dmg-float heal' : 'dmg-float'}>
          {foe < 0 ? `+${-foe}` : `-${foe}`}
        </span>
      ) : null}
    </div>
  );
}

export default function BattlePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [arts, setArts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Setup
  const [mode, setMode] = useState('ai');
  const [picked, setPicked] = useState([]);
  const [vanguard, setVanguard] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [pickFlipped, setPickFlipped] = useState(null);

  // Arena
  const [st, setSt] = useState(null);
  const [acting, setActing] = useState(false);
  const [fx, setFx] = useState(null); // { actor, target, kind, num, key }
  const fxTimer = useRef(null);
  const seenLog = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json().catch(() => ({}));
        if (!meRes.ok || !meData.success) {
          router.push('/login');
          return;
        }
        setMe(meData);
        const cardsRes = await fetch('/api/cards');
        const cardsData = await cardsRes.json().catch(() => ({}));
        if (cardsData.success) {
          const all = cardsData.cards || [];
          setCards(all.filter((c) => c.owned));
          const artMap = {};
          for (const c of all) if (c.imageUrl) artMap[c.name.toLowerCase()] = c.imageUrl;
          setArts(artMap);
        }
      } catch {
        setError('Tidak bisa menghubungi server.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function applyState(state) {
    setSt(state);
    const log = state.battle?.log || [];
    if (log.length > seenLog.current) {
      const ev = log[log.length - 1];
      const num = ev.dmg ?? (ev.amount != null ? -ev.amount : null);
      const target =
        ev.target || (ev.type === 'ko' || ev.type === 'stun' ? ev.name : null);
      const kind =
        ev.type === 'basic' || ev.type === 'skill'
          ? 'attack'
          : ev.type === 'heal' || ev.type === 'hot' || ev.type === 'regen'
            ? 'heal'
            : ev.type === 'ko'
              ? 'ko'
              : null;
      if (target && kind) {
        const key = `${log.length}-${ev.t}`;
        setFx({ actor: ev.name, target, kind, num, key });
        clearTimeout(fxTimer.current);
        fxTimer.current = setTimeout(() => setFx(null), 1100);
      }
      seenLog.current = log.length;
    }
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json().catch(() => ({}));
  }

  // Urutan tim: vanguard (maju duluan) dulu, sisanya ikut urutan pilih.
  function orderedTeam() {
    if (picked.length !== 3) return picked;
    const first = vanguard && picked.includes(vanguard) ? vanguard : picked[0];
    return [first, ...picked.filter((n) => n !== first)];
  }

  async function startAi() {
    setError('');
    const data = await api('/api/battle/room', { mode: 'ai', team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal mulai battle.');
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
  }

  async function createPvp() {
    setError('');
    const data = await api('/api/battle/room', { mode: 'pvp', team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal buat room.');
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
  }

  async function joinPvp(e) {
    e.preventDefault();
    setError('');
    const data = await api('/api/battle/room/join', { code: joinCode, team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal gabung room.');
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
  }

  async function doAct(action) {
    if (!st || acting) return;
    setActing(true);
    setError('');
    const data = await api('/api/battle/room/act', { code: st.code, action });
    setActing(false);
    if (!data.success) {
      setError(data.message || 'Aksi gagal.');
      refresh();
      return;
    }
    if (data.battle) {
      applyState({ ...st, battle: data.battle, result: data.result || st.result });
      if (data.finished) refresh();
    }
  }

  async function refresh() {
    if (!st) return;
    const data = await api(`/api/battle/room?code=${encodeURIComponent(st.code)}`);
    if (data.success) applyState(data.state);
  }

  // Polling PvP: tunggu lawan / giliran lawan.
  useEffect(() => {
    if (!st || st.status === 'finished') return;
    const waiting = st.status === 'waiting';
    const myTurn = st.turn === me?.id;
    if (!waiting && myTurn) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status, st?.turn, me?.id]);

  const mySide = st?.yourSide || 'player';
  const foeSide = mySide === 'player' ? 'enemy' : 'player';
  const myTeam = st?.battle?.[mySide];
  const foeTeam = st?.battle?.[foeSide];
  const myTurn = st && st.status === 'ongoing' && !st.battle.over && st.turn === me?.id;
  const activeFighter = myTeam?.fighters[myTeam?.active];
  const canSkill = activeFighter && myTeam && activeFighter.alive && myTeam.cons >= activeFighter.cons;

  function fxFor(name) {
    if (!fx || !name) return '';
    if (fx.actor === name && (fx.kind === 'attack')) return 'attacking';
    if (fx.target === name && fx.kind === 'attack') return 'hit';
    if (fx.target === name && fx.kind === 'heal') return 'healed';
    if (fx.target === name && fx.kind === 'ko') return '';
    return '';
  }

  function floatFor(name) {
    if (!fx || fx.target !== name || fx.num == null) return null;
    return fx.num;
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">Memuat battle...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Battle Kartu</h1>
          </div>
          {error ? <div className="alert-error">{error}</div> : null}

          {!st ? (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="label" htmlFor="battleMode">
                    Mode
                  </label>
                  <select
                    id="battleMode"
                    className="select"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="ai">Lawan AI</option>
                    <option value="create">Buat room PvP (kode angka)</option>
                    <option value="join">Gabung room (kode angka)</option>
                  </select>
                </div>
                <div className="section-title">Pilih 3 kartumu</div>
                <div className="pick-grid">
                  {cards.map((c) => {
                    const idx = picked.indexOf(c.name);
                    const selected = idx >= 0;
                    const flipped = pickFlipped === c.name;
                    return (
                      <div
                        key={c.name}
                        className={
                          selected
                            ? flipped
                              ? 'card-item picked flipped'
                              : 'card-item picked'
                            : flipped
                              ? 'card-item flipped'
                              : 'card-item'
                        }
                        onClick={() => {
                          setPicked((p) => {
                            const next = p.includes(c.name)
                              ? p.filter((n) => n !== c.name)
                              : p.length >= 3
                                ? p
                                : [...p, c.name];
                            if (!next.includes(vanguard)) setVanguard(next[0] || '');
                            return next;
                          });
                        }}
                        title={c.name}
                      >
                        {selected ? <span className="pick-check">{idx + 1}</span> : null}
                        <div className="flip-inner">
                          <div className="flip-front">
                            {c.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" />
                            ) : (
                              <div className="card-art" />
                            )}
                            <div className="card-meta">
                              <span className="pick-role">{c.stats?.role || '-'}</span>
                              <div className="card-name">{c.name}</div>
                              <div className="card-anime">{c.tier}</div>
                            </div>
                          </div>
                          {c.stats ? (
                            <div className="flip-back">
                              <span className="flip-role">{c.stats.role}</span>
                              <div className="flip-stat">
                                HP <b>{c.stats.hp}</b>
                              </div>
                              <div className="flip-stat">
                                ATK <b>{c.stats.basic}</b>
                              </div>
                              <div className="flip-stat">{c.stats.skillName}</div>
                              <div className="flip-stat">
                                Skill <b>{c.stats.skill}</b> / Cons <b>{c.stats.cons}</b>
                              </div>
                              <div className="flip-stat">
                                Efek <b>{c.stats.effect}</b>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="flip-btn"
                          aria-label="Lihat detail"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickFlipped((f) => (f === c.name ? null : c.name));
                          }}
                        >
                          ?
                        </button>
                      </div>
                    );
                  })}
                </div>
                {picked.length === 3 ? (
                  <div className="field" style={{ marginTop: 4 }}>
                    <label className="label" htmlFor="vanguard">
                      Yang maju duluan
                    </label>
                    <select
                      id="vanguard"
                      className="select"
                      value={vanguard}
                      onChange={(e) => setVanguard(e.target.value)}
                    >
                      {picked.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {cards.length === 0 ? (
                  <div style={{ fontSize: 13 }}>Kamu belum punya kartu. Gacha dulu.</div>
                ) : null}
              </div>

              {mode === 'join' ? (
                <div className="card" style={{ marginBottom: 16 }}>
                  <form id="joinForm" onSubmit={joinPvp}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="label" htmlFor="joinCode">
                        Kode room angka
                      </label>
                      <input
                        id="joinCode"
                        className="input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Contoh: 482910"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                        required
                        style={{ letterSpacing: 4, fontWeight: 700, fontSize: 18 }}
                      />
                    </div>
                  </form>
                </div>
              ) : null}
            </div>
            <div style={{ height: 90 }} />
            <div className="floating-bar">
              {mode === 'join' ? (
                <button className="btn" disabled={picked.length !== 3} type="submit" form="joinForm">
                  Gabung & Mulai ({picked.length}/3)
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={picked.length !== 3}
                  onClick={mode === 'ai' ? startAi : createPvp}
                >
                  {mode === 'ai' ? `Mulai vs AI (${picked.length}/3)` : `Buat Kode Room (${picked.length}/3)`}
                </button>
              )}
            </div>
          ) : st.status === 'waiting' ? (
            <div className="card">
              <div className="section-title">Room {st.code}</div>
              <div className="trade-code-big">{st.code}</div>
              <div className="trade-hint">Bagikan kode ini ke lawan. Menunggu gabung...</div>
              <button className="btn btn-ghost" onClick={refresh}>
                Cek Lagi
              </button>{' '}
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setSt(null);
                  setPicked([]);
                }}
              >
                Batal
              </button>
            </div>
          ) : (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="arena-side-title">
                  {st.mode === 'ai' ? 'Lawan (AI)' : `@${mySide === 'player' ? st.p2Username : st.p1Username}`}
                  {st.turn !== me?.id && st.status === 'ongoing' && !st.battle.over ? (
                    <span className="turn-badge">Giliran lawan</span>
                  ) : null}
                </div>
                <div className="fighters">
                  {foeTeam?.fighters.map((f, i) => (
                    <FighterCard
                      key={f.name}
                      f={f}
                      active={foeTeam.active === i}
                      art={arts[f.name.toLowerCase()]}
                      fx={fxFor(f.name)}
                      foe={floatFor(f.name)}
                    />
                  ))}
                </div>
                <ConsPips value={foeTeam?.cons || 0} />
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="arena-side-title">
                  Timmu
                  {myTurn ? <span className="turn-badge">Giliranmu</span> : null}
                </div>
                <div className="fighters">
                  {myTeam?.fighters.map((f, i) => {
                    const switchable = Boolean(myTurn && !acting && f.alive && i !== myTeam.active);
                    return (
                      <FighterCard
                        key={f.name}
                        f={f}
                        active={myTeam.active === i}
                        art={arts[f.name.toLowerCase()]}
                        fx={fxFor(f.name)}
                        foe={floatFor(f.name)}
                        tappable={switchable}
                        onTap={() => doAct({ type: 'switch', to: i })}
                      />
                    );
                  })}
                </div>
                <ConsPips value={myTeam?.cons || 0} />

                {myTurn && !acting ? (
                  <div className="action-bar">
                    <button className="btn" style={{ width: 'auto' }} onClick={() => doAct({ type: 'basic' })}>
                      ATK ({activeFighter?.basic})
                    </button>
                    <button
                      className="btn"
                      style={{ width: 'auto' }}
                      disabled={!canSkill}
                      onClick={() => doAct({ type: 'skill' })}
                      title={activeFighter ? `${activeFighter.skillName} - ${activeFighter.cons} cons` : ''}
                    >
                      Skill ({activeFighter?.cons} cons)
                    </button>
                    <div style={{ width: '100%', fontSize: 11, color: 'var(--body)' }}>
                      Ketuk kartu cadanganmu untuk ganti (1 giliran).
                    </div>
                  </div>
                ) : null}
                {st.turn && !myTurn && st.status === 'ongoing' && !st.battle.over ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--body)' }}>
                    Menunggu lawan... (otomatis jalan bila 60 detik)
                  </div>
                ) : null}
              </div>

              {st.status === 'finished' || st.battle.over ? (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-title">
                    {String(st.winner) === String(me?.id) ? 'Menang!' : 'Kalah'}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {st.result?.xp?.[me?.id] ? (
                      <span>
                        +{st.result.xp[me.id].gain} XP
                        {st.result.xp[me.id].capped ? ' (jatah harian habis)' : ''}
                      </span>
                    ) : (
                      <span>Battle selesai.</span>
                    )}
                  </div>
                  <button
                    className="btn"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setSt(null);
                      setPicked([]);
                      setFx(null);
                    }}
                  >
                    Main Lagi
                  </button>
                </div>
              ) : null}

              <div className="card">
                <div className="section-title">Log</div>
                <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
                  {st.battle.log.map((ev, i) => (
                    <div key={i} className="user-row">
                      <span>
                        {ev.side === mySide ? 'Kamu' : ev.side === 'enemy' || ev.side === 'player' ? 'Lawan' : '-'} —{' '}
                        {ev.type}
                        {ev.name ? ` ${ev.name}` : ''}
                        {ev.skill ? ` (${ev.skill})` : ''}
                        {ev.dmg ? ` -${ev.dmg}` : ''}
                        {ev.amount ? ` +${ev.amount}` : ''}
                        {ev.combo ? ' [KOMBO]' : ''}
                        {ev.crit ? ' [CRIT]' : ''}
                        {ev.status ? ` (${ev.status})` : ''}
                        {ev.target ? ` -> ${ev.target}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
