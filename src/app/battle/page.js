'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import ConfirmModal from '@/components/ConfirmModal';
import { optImg } from '@/lib/images';

function HpBar({ hp, maxHp }) {
  const pct = Math.max(0, Math.round((hp / Math.max(1, maxHp)) * 100));
  const color = pct > 50 ? 'var(--success)' : pct > 20 ? '#eab308' : '#ef4444';
  return (
    <div style={{ background: 'var(--hairline)', borderRadius: 9999, height: 8, overflow: 'hidden' }} className={pct <= 20 && hp > 0 ? 'hp-low' : ''}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
    </div>
  );
}

function CountUp({ value }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (target <= 0) {
      setN(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>+{n} XP</span>;
}

function ConsPips({ value }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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

function FighterCard({ f, active, art, fx, foe, onTap, tappable, selectTone, refCb, preview }) {
  const cls = ['fighter', active ? 'active' : '', !f.alive ? 'ko' : '', fx || '', selectTone || ''].filter(Boolean).join(' ');
  return (
    <div
      ref={refCb}
      className={cls}
      onClick={tappable ? onTap : undefined}
      style={tappable ? { cursor: 'pointer' } : undefined}
      title={tappable ? f.name : f.name}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="fighter-img" src={optImg(art, 400)} alt={f.name} loading="lazy" decoding="async" />
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
      {foe != null ? (
        <>
          <span className={'dmg-float' + (foe.num < 0 ? ' heal' : '') + (foe.crit ? ' crit' : '')}>
            {foe.crit ? `CRIT -${foe.num}` : foe.num < 0 ? `+${-foe.num}` : `-${foe.num}`}
          </span>
          {foe.absorbed > 0 ? <span className="absorb-float">terserap {foe.absorbed}</span> : null}
        </>
      ) : null}
      {preview ? <span className="dmg-preview">{preview}</span> : null}
      {f.alive && f.shield > 0 ? <span className="shield-ring" title={`Shield ${f.shield}`} /> : null}
      {f.alive && f.burn ? (
        <span className="fx-ember" aria-hidden="true"><i /><i /><i /></span>
      ) : null}
      {f.alive && f.stun ? <span className="fx-stun" aria-hidden="true">💫</span> : null}
      {f.alive && f.regen ? <span className="fx-regen" aria-hidden="true">+{f.regen.amount || ''}</span> : null}
      {!f.alive ? <span className="ko-stamp">KO</span> : null}
    </div>
  );
}

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const AUTO_TIER_SCORE = { Mythic: 50, Legendary: 40, Epic: 30, Rare: 20, Common: 10 };

function scoreCard(c) {
  const s = c.stats || {};
  return (Number(s.hp) || 0) + (Number(s.basic) || 0) * 2 + (Number(s.skill) || 0) * 2 + (AUTO_TIER_SCORE[c.tier] || 0);
}

function pickAutoTeam(all) {
  const pool = (all || []).filter((c) => c.stats);
  if (pool.length <= 3) return pool.map((c) => c.name);
  const byRole = (role) => pool.filter((c) => c.stats?.role === role).sort((a, b) => scoreCard(b) - scoreCard(a));
  const team = [];
  const tank = byRole('Tank')[0];
  if (tank) team.push(tank.name);
  const sup = byRole('Support').find((c) => !team.includes(c.name));
  if (sup) team.push(sup.name);
  const rest = [...pool].sort((a, b) => scoreCard(b) - scoreCard(a));
  for (const c of rest) {
    if (team.length >= 3) break;
    if (!team.includes(c.name)) team.push(c.name);
  }
  return team.slice(0, 3);
}

function describeLog(ev) {
  if (!ev) return '';
  const who = ev.name ? `${ev.name}` : ev.side === 'player' ? 'Tim biru' : 'Tim merah';
  switch (ev.type) {
    case 'start': return `Battle mulai! (${ev.first === 'player' ? 'kamu' : 'lawan'} jalan duluan)`;
    case 'cons': return `+${ev.cons} cons untuk tim ${ev.side === 'player' ? 'biru' : 'merah'}`;
    case 'basic': return `${who} menyerang ${ev.target} (-${ev.dmg || 0})${ev.absorbed ? `, ${ev.absorbed} terserap shield` : ''}`;
    case 'skill': return `${who} memakai ${ev.skill || 'skill'} ke ${ev.target} (-${ev.dmg || 0})${ev.crit ? ' CRIT!' : ''}${ev.status && ev.status !== 'none' ? ` [${ev.status}]` : ''}${ev.absorbed ? `, ${ev.absorbed} terserap` : ''}`;
    case 'heal': return `${who} memulihkan ${ev.target} (+${ev.amount || 0})`;
    case 'regen': return `${who} memberi regen ke ${ev.target} (+${ev.amount || 0}/giliran)`;
    case 'hot': return `${ev.target} regen (+${ev.amount || 0})`;
    case 'dot': return `${ev.target} terbakar (-${ev.amount || 0})`;
    case 'ko': return `💀 ${ev.name} KO!`;
    case 'switch': return `🔄 ${ev.forced ? 'Otomatis maju' : 'Ganti'}: ${ev.name}`;
    case 'stun': return `💫 ${ev.name} terkena stun, giliran lewat`;
    case 'timeout': return `⏱ Giliran ${ev.side} habis, auto-ATK`;
    case 'forfeit': return `🏳️ ${who} menyerah (AFK 2 menit)`;
    case 'surrender': return `🏳️ ${who} menyerah`;
    case 'end': return ev.timeout ? `⏱ Waktu habis! Pemenang: ${ev.winner === 'you' ? 'kamu' : 'lawan'}` : `🏆 Pemenang: ${ev.winner === 'you' ? 'kamu' : 'lawan'}`;
    default: return `${ev.type}${ev.name ? `: ${ev.name}` : ''}`;
  }
}

export default function BattlePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [cards, setCards] = useState([]);
  const [arts, setArts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('ai');
  const [difficulty, setDifficulty] = useState('normal');
  const [picked, setPicked] = useState([]);
  const [vanguard, setVanguard] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [pickFlipped, setPickFlipped] = useState(null);
  const [pickQ, setPickQ] = useState('');
  const [pickRole, setPickRole] = useState('All');
  const [pickTier, setPickTier] = useState('All');

  const [presets, setPresets] = useState([]);
  const [history, setHistory] = useState([]);

  const [roomQInput, setRoomQInput] = useState('');
  const [roomQ, setRoomQ] = useState('');
  const [roomPage, setRoomPage] = useState(1);
  const [roomList, setRoomList] = useState([]);
  const [roomTotal, setRoomTotal] = useState(0);
  const [roomTotalPages, setRoomTotalPages] = useState(1);
  const [roomLoading, setRoomLoading] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const MY_ROOM_KEY = 'battle_my_room';
  const PRESET_KEY = 'battle_presets';
  const [myRooms, setMyRooms] = useState([]);

  const [st, setSt] = useState(null);
  const [acting, setActing] = useState(false);
  const [askSurrender, setAskSurrender] = useState(false);
  const [fx, setFx] = useState(null);
  const fxTimer = useRef(null);
  const seenLog = useRef(0);

  // Targeting manual: { type: 'basic'|'skill'|'skill2', kind: 'foe'|'ally', fx: effect }
  const [pending, setPending] = useState(null);
  const [hint, setHint] = useState('');
  const hintTimer = useRef(null);
  const [splash, setSplash] = useState(null);
  const splashTimer = useRef(null);

  function showSplash(title, sub) {
    setSplash({ title, sub });
    clearTimeout(splashTimer.current);
    splashTimer.current = setTimeout(() => setSplash(null), 1600);
  }

  function splashFor(state) {
    if (!state || !state.battle) return;
    const foeName = state.mode === 'ai' ? 'AI' : '@' + (String(state.yourSide) === 'player' ? state.p2Username : state.p1Username);
    showSplash(`${me?.username || 'Kamu'} VS ${foeName}`, state.mode === 'ai' ? `Mode AI` : 'PvP');
  }
  // Ref elemen kartu per sisi engine: `${side}:${index}` -> el (untuk animasi terbang).
  const fighterRefs = useRef({});
  const arenaRef = useRef(null);

  const EFFECT_COLORS = {
    burn: '#f97316', crit: '#facc15', heavy: '#fb923c', double: '#fb923c',
    shield: '#38bdf8', bulwark: '#38bdf8', regen: '#22c55e', heal: '#22c55e',
    energize: '#22c55e', surge: '#a78bfa', weaken: '#a78bfa', focus: '#facc15',
    slam: '#e2e8f0',
  };

  function fireProjectile(fromKey, toKey, color, dur = 420) {
    return new Promise((resolve) => {
      try {
        const arena = arenaRef.current;
        const a = fighterRefs.current[fromKey];
        const b = fighterRefs.current[toKey];
        if (!arena || !a || !b) return resolve();
        const ra = arena.getBoundingClientRect();
        const fa = a.getBoundingClientRect();
        const fb = b.getBoundingClientRect();
        const x1 = fa.left + fa.width / 2 - ra.left;
        const y1 = fa.top + fa.height / 2 - ra.top;
        const x2 = fb.left + fb.width / 2 - ra.left;
        const y2 = fb.top + fb.height / 2 - ra.top;
        const dot = document.createElement('span');
        dot.className = 'projectile';
        dot.style.background = String(color || '#facc15');
        dot.style.boxShadow = `0 0 12px 3px ${String(color || '#facc15')}`;
        dot.style.left = `${x1}px`;
        dot.style.top = `${y1}px`;
        arena.appendChild(dot);
        const anim = dot.animate(
          [
            { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0.5 },
            { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.25 },
            { transform: `translate(calc(-50% + ${x2 - x1}px), calc(-50% + ${y2 - y1}px)) scale(1)`, opacity: 1 },
          ],
          { duration: dur, easing: 'cubic-bezier(0.3,0.7,0.4,1)' }
        );
        anim.onfinish = () => { dot.remove(); resolve(); };
        setTimeout(() => { dot.remove(); resolve(); }, dur + 300);
      } catch {
        resolve();
      }
    });
  }

  function shakeArena() {
    const arena = arenaRef.current;
    if (!arena) return;
    arena.classList.remove('shake-screen');
    void arena.offsetWidth;
    arena.classList.add('shake-screen');
    setTimeout(() => arena.classList.remove('shake-screen'), 550);
  }

  function flashHint(msg) {
    setHint(msg);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 2600);
  }

  function armAction(type) {
    const atk = activeFighter;
    if (!atk) return;
    if (type === 'basic') {
      setPending((p) => (p?.type === 'basic' ? null : { type: 'basic', kind: 'foe', fx: 'basic' }));
      return;
    }
    const slot = type === 'skill2' ? 2 : 1;
    const fxName = slot === 2 ? atk.effect2 : atk.effect;
    const allyKind = atk.role === 'Support' || fxName === 'shield' || fxName === 'bulwark';
    setPending((p) => (p?.type === type ? null : { type, kind: allyKind ? 'ally' : 'foe', fx: fxName || 'skill' }));
  }

  // Kartu teman yang valid untuk pending ally (heal/energize butuh yang terluka).
  function allyValid(f) {
    if (!f?.alive) return false;
    if (pending?.fx === 'heal' || pending?.fx === 'energize') return f.hp < f.maxHp;
    return true;
  }

  function rageMult(battle) {
    return Math.min(1.3, 1 + 0.1 * Math.floor((battle?.turnCount || 0) / 10));
  }

  // Estimasi range damage skill ofensif (tanpa crit).
  function skillDamageRange(fighter, slot, mult) {
    const sk = slot === 2
      ? { dmg: fighter.skill2, effect: fighter.effect2, val: fighter.effectVal2 }
      : { dmg: fighter.skill, effect: fighter.effect, val: fighter.effectVal };
    if (!sk.dmg) return null;
    let m = 1;
    const ef = sk.effect;
    if (ef === 'heavy') m = (sk.val || 100) / 100;
    else if (ef === 'slam') m = 0.9;
    else if (ef === 'bulwark' || ef === 'surge' || ef === 'weaken' || ef === 'focus') m = 0.7;
    else if (ef === 'double') m = ((sk.val || 60) / 100) * 2;
    return {
      lo: Math.max(1, Math.round(sk.dmg * m * 0.9 * mult)),
      hi: Math.max(1, Math.round(sk.dmg * m * 1.1 * mult)),
      crit: ef === 'crit',
    };
  }

  function pendingPreviewForFoe() {
    if (!pending || pending.kind !== 'foe' || !activeFighter || !myTeam) return null;
    const mult = rageMult(st?.battle) * (activeFighter.weaken > 0 ? 0.7 : 1) * (myTeam.lastWasSkill ? 1.25 : 1);
    if (pending.type === 'basic') {
      const lo = Math.max(1, Math.round(activeFighter.basic * 0.9 * mult));
      const hi = Math.max(1, Math.round(activeFighter.basic * 1.1 * mult));
      return `≈${lo}–${hi}`;
    }
    const r = skillDamageRange(activeFighter, pending.type === 'skill2' ? 2 : 1, mult);
    if (!r) return null;
    return `≈${r.lo}–${r.hi}${r.crit ? ' ✦' : ''}`;
  }

  function pendingPreviewForAlly() {
    if (!pending || pending.kind !== 'ally' || !activeFighter || !myTeam) return null;
    const combo = myTeam.lastWasSkill ? 1.25 : 1;
    const slot = pending.type === 'skill2' ? 2 : 1;
    const sk = slot === 2
      ? { dmg: activeFighter.skill2, effect: activeFighter.effect2 }
      : { dmg: activeFighter.skill, effect: activeFighter.effect };
    if (pending.fx === 'regen') return `+${Math.round((sk.dmg || 0) * 0.22 * combo)}/gil`;
    if (pending.fx === 'heal' || pending.fx === 'energize') {
      const m = pending.fx === 'energize' ? 0.45 : 0.7;
      const lo = Math.max(1, Math.round((sk.dmg || 0) * m * 0.9 * combo));
      const hi = Math.max(1, Math.round((sk.dmg || 0) * m * 1.1 * combo));
      return `+${lo}–${hi}`;
    }
    if (pending.fx === 'shield' || pending.fx === 'bulwark') {
      const val = slot === 2 ? activeFighter.effectVal2 : activeFighter.effectVal;
      return `+⛨${Math.round((sk.dmg || 0) * ((val || 50) / 100))}`;
    }
    return null;
  }

  function flyBetween(actorKey, targetKey, dur = 460) {
    return new Promise((resolve) => {
      const a = fighterRefs.current[actorKey];
      const b = fighterRefs.current[targetKey];
      if (!a || !b) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const dx = rb.left + rb.width / 2 - (ra.left + ra.width / 2);
        const dy = rb.top + rb.height / 2 - (ra.top + ra.height / 2);
        a.style.zIndex = '5';
        a.style.transition = `transform ${dur}ms cubic-bezier(0.3,0.7,0.4,1)`;
        requestAnimationFrame(() => {
          a.style.transform = `translate(${dx * 0.82}px, ${dy * 0.82}px) scale(1.18)`;
        });
        setTimeout(() => {
          a.style.transition = 'transform 380ms cubic-bezier(0.6,0,0.7,0.4)';
          a.style.transform = 'translate(0,0) scale(1)';
          setTimeout(() => {
            a.style.transition = '';
            a.style.transform = '';
            a.style.zIndex = '';
            finish();
          }, 400);
        }, dur + 90);
        setTimeout(finish, dur + 900);
      } catch {
        finish();
      }
    });
  }

  function hopCard(key) {
    return new Promise((resolve) => {
      const el = fighterRefs.current[key];
      if (!el) return resolve();
      try {
        el.style.transition = 'transform 220ms ease-out';
        el.style.transform = 'translateY(-16px) scale(1.06)';
        setTimeout(() => {
          el.style.transform = 'translate(0,0) scale(1)';
          setTimeout(() => {
            el.style.transition = '';
            el.style.transform = '';
            resolve();
          }, 240);
        }, 240);
      } catch {
        resolve();
      }
    });
  }

  function foeSideOf(side) {
    return side === 'player' ? 'enemy' : 'player';
  }

  function idxOf(team, name) {
    if (!team) return -1;
    return team.fighters.findIndex((f) => f.name === name);
  }

  // Mainkan animasi untuk 1 event log (terbang untuk serang, hop untuk heal).
  async function animateEvent(state, ev) {
    if (!ev || !state?.battle) return;
    const b = state.battle;
    try {
      if (ev.type === 'basic' || ev.type === 'skill') {
        const ai = idxOf(b[ev.side], ev.name);
        const ti = idxOf(b[foeSideOf(ev.side)], ev.target);
        const isSkill = ev.type === 'skill';
        const color = EFFECT_COLORS[ev.effect] || (isSkill ? '#facc15' : '#e2e8f0');
        if (ai >= 0 && ti >= 0) {
          if (isSkill) {
            await Promise.all([
              flyBetween(`${ev.side}:${ai}`, `${foeSideOf(ev.side)}:${ti}`),
              fireProjectile(`${ev.side}:${ai}`, `${foeSideOf(ev.side)}:${ti}`, color),
            ]);
          } else {
            await flyBetween(`${ev.side}:${ai}`, `${foeSideOf(ev.side)}:${ti}`);
          }
        }
        if (ev.status === 'shield' && ev.allyTarget) {
          const hi = idxOf(b[ev.side], ev.allyTarget);
          if (hi >= 0) await hopCard(`${ev.side}:${hi}`);
        }
        if (ev.crit || (ev.dmg || 0) >= 40 || ev.slot === 2) shakeArena();
      } else if (ev.type === 'heal' || ev.type === 'hot' || ev.type === 'regen') {
        const ai = idxOf(b[ev.side], ev.name);
        const ti = idxOf(b[ev.side], ev.target);
        if (ai >= 0 && ti >= 0) {
          await Promise.all([
            fireProjectile(`${ev.side}:${ai}`, `${ev.side}:${ti}`, '#22c55e', 380),
            hopCard(`${ev.side}:${ti}`),
          ]);
        } else if (ti >= 0) {
          await hopCard(`${ev.side}:${ti}`);
        }
      }
    } catch { /* animasi non-kritis */ }
  }

  // Chat battle sementara
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatAfter = useRef(0);
  const chatBoxRef = useRef(null);
  const resultRef = useRef(null);
  const [autoExitIn, setAutoExitIn] = useState(0);

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
        try {
          const raw = localStorage.getItem(PRESET_KEY);
          if (raw) setPresets(JSON.parse(raw) || []);
        } catch { /* abaikan */ }
        try {
          const hRes = await fetch('/api/battle/history?limit=10');
          const hData = await hRes.json().catch(() => ({}));
          if (hData.success) setHistory(hData.history || []);
        } catch { /* abaikan */ }
        try {
          const mineRes = await fetch('/api/battle/mine');
          const mineData = await mineRes.json().catch(() => ({}));
          if (mineData.success && mineData.rooms?.length) {
            setMyRooms(mineData.rooms);
            const first = mineData.rooms[0];
            seenLog.current = 0;
            applyState(first, { animate: false });
            try { localStorage.setItem(MY_ROOM_KEY, first.code); } catch { /* abaikan */ }
          } else {
            try {
              const saved = localStorage.getItem(MY_ROOM_KEY);
              if (saved) localStorage.removeItem(MY_ROOM_KEY);
            } catch { /* abaikan */ }
          }
        } catch {
          // abaikan
        }
      } catch {
        setError('Tidak bisa menghubungi server.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyState(state, opts = {}) {
    const animate = opts.animate !== false;
    setSt(state);
    const log = state.battle?.log || [];
    if (log.length > seenLog.current) {
      const fresh = log.slice(seenLog.current);
      const ev = log[log.length - 1];
      const num = ev.dmg ?? (ev.amount != null ? -ev.amount : null);
      const target =
        ev.target || (ev.type === 'ko' || ev.type === 'stun' ? ev.name : null);
      const kind =
        ev.type === 'basic' || ev.type === 'skill'
          ? ev.status === 'shield'
            ? 'shield'
            : 'attack'
          : ev.type === 'heal' || ev.type === 'hot' || ev.type === 'regen'
            ? 'heal'
            : ev.type === 'ko'
              ? 'ko'
              : null;
      if (target && kind) {
        const key = `${log.length}-${ev.t}`;
        const selfTarget = ev.type === 'heal' || ev.type === 'hot' || ev.type === 'regen' || ev.type === 'ko' || ev.type === 'stun';
        setFx({ actor: ev.name, side: ev.side, target, targetSide: selfTarget ? ev.side : foeSideOf(ev.side), kind, num, key, allyTarget: ev.allyTarget || null, crit: ev.crit || false, absorbed: ev.absorbed || 0 });
        clearTimeout(fxTimer.current);
        fxTimer.current = setTimeout(() => setFx(null), 1600);
      }
      seenLog.current = log.length;
      // Animasi terbang untuk SEMUA aksi serangan/heal baru (milikmu, lawan, AI).
      if (animate) {
        const events = fresh.filter((e) =>
          e && (e.type === 'basic' || e.type === 'skill' || e.type === 'heal' || e.type === 'hot' || e.type === 'regen'));
        if (events.length > 0) {
          setTimeout(() => {
            (async () => {
              for (const e of events.slice(-3)) await animateEvent(state, e);
            })();
          }, 90);
        }
      }
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

  async function fetchRooms(page = roomPage, q = roomQ) {
    setRoomLoading(true);
    try {
      const res = await fetch(`/api/battle/rooms?q=${encodeURIComponent(q)}&page=${page}`);
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setRoomList(data.rooms || []);
        setRoomTotal(data.pagination?.total || 0);
        setRoomTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      // abaikan
    } finally {
      setRoomLoading(false);
    }
  }

  async function fetchMine(silent = true) {
    try {
      const res = await fetch('/api/battle/mine');
      const data = await res.json().catch(() => ({}));
      if (data.success) setMyRooms(data.rooms || []);
    } catch {
      if (!silent) setError('Gagal memuat room aktifmu.');
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch('/api/battle/history?limit=10');
      const data = await res.json().catch(() => ({}));
      if (data.success) setHistory(data.history || []);
    } catch { /* abaikan */ }
  }

  useEffect(() => {
    if (loading || st) return;
    fetchRooms(roomPage, roomQ);
    fetchMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, st, roomPage, roomQ]);

  useEffect(() => {
    if (loading || st) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setNowTick(Date.now());
      fetchRooms(roomPage, roomQ);
      fetchMine();
    }, 8000);
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, st, roomPage, roomQ]);

  // Chat battle: load awal + polling saat battle ongoing
  useEffect(() => {
    if (!st?.code) {
      setChatMsgs([]);
      chatAfter.current = 0;
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/battle/chat?code=${encodeURIComponent(st.code)}&afterId=0`);
        const data = await res.json().catch(() => ({}));
        if (alive && data.success) {
          setChatMsgs(data.messages || []);
          const last = (data.messages || []).at(-1);
          if (last) chatAfter.current = last.id;
          scrollChat();
        }
      } catch { /* abaikan */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code]);

  useEffect(() => {
    if (!st?.code || st.status === 'finished' || st.battle?.over) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/battle/chat?code=${encodeURIComponent(st.code)}&afterId=${chatAfter.current}`);
        const data = await res.json().catch(() => ({}));
        if (data.success && data.messages?.length) {
          setChatMsgs((prev) => [...prev, ...data.messages].slice(-100));
          chatAfter.current = data.messages.at(-1).id;
          scrollChat();
        }
      } catch { /* abaikan */ }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status, st?.battle?.over]);

  function scrollChat() {
    requestAnimationFrame(() => {
      const el = chatBoxRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function sendBattleChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !st?.code || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch('/api/battle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: st.code, message: text.slice(0, 200) }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.message) {
        setChatMsgs((prev) => [...prev, data.message].slice(-100));
        chatAfter.current = Math.max(chatAfter.current, data.message.id || 0);
        setChatInput('');
        scrollChat();
      }
    } finally {
      setChatSending(false);
    }
  }

  function fmtSisa(expiresAt) {
    const s = Math.max(0, Math.ceil((expiresAt - nowTick) / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function forfeitLeft() {
    if (!st || st.status !== 'ongoing' || st.battle?.over) return null;
    // Hitung dari updatedAt server agar countdown jalan meski state snapshot lama.
    if (st.updatedAt) {
      return Math.max(0, 2 * 60 * 1000 - (nowTick - st.updatedAt));
    }
    if (typeof st.forfeitMsLeft === 'number') return Math.max(0, st.forfeitMsLeft);
    return null;
  }

  async function onPickRoom(code) {
    if (picked.length === 3) {
      setError('');
      setPending(null);
      setHint('');
      setJoinCode(code);
      const data = await api('/api/battle/room/join', { code, team: orderedTeam() });
      if (!data.success) {
        setError(data.message || 'Gagal gabung room.');
        setMode('join');
        fetchRooms(roomPage, roomQ);
        return;
      }
      seenLog.current = 0;
      applyState(data.state);
      splashFor(data.state);
      try { localStorage.setItem(MY_ROOM_KEY, data.state.code); } catch { /* abaikan */ }
      setRoomList((prev) => prev.filter((r) => r.code !== code));
      return;
    }
    setMode('join');
    setJoinCode(code);
    setError('Pilih 3 kartumu dulu, lalu tekan Gabung & Mulai.');
  }

  function onSearchRoom(e) {
    e.preventDefault();
    setRoomPage(1);
    setRoomQ(roomQInput.trim());
  }

  function orderedTeam() {
    if (picked.length !== 3) return picked;
    const first = vanguard && picked.includes(vanguard) ? vanguard : picked[0];
    return [first, ...picked.filter((n) => n !== first)];
  }

  function savePreset() {
    if (picked.length !== 3) {
      setError('Pilih 3 kartu dulu untuk simpan preset.');
      return;
    }
    const name = `Tim ${presets.length + 1}`;
    const next = [...presets, { name, team: orderedTeam() }].slice(-5);
    setPresets(next);
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  }

  function loadPreset(p) {
    setPicked(p.team.filter((n) => cards.some((c) => c.name === n)));
    setVanguard(p.team[0] || '');
  }

  async function startAi() {
    setError('');
    setPending(null);
    setHint('');
    const data = await api('/api/battle/room', { mode: 'ai', team: orderedTeam(), difficulty });
    if (!data.success) {
      setError(data.message || 'Gagal mulai battle.');
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
    splashFor(data.state);
  }

  async function createPvp() {
    setError('');
    setPending(null);
    setHint('');
    const data = await api('/api/battle/room', { mode: 'pvp', team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal buat room.');
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
    try { localStorage.setItem(MY_ROOM_KEY, data.state.code); } catch { /* abaikan */ }
    fetchMine();
  }

  async function joinPvp(e) {
    e.preventDefault();
    setError('');
    setPending(null);
    setHint('');
    if (picked.length !== 3) {
      setError('Pilih 3 kartumu dulu sebelum gabung.');
      return;
    }
    const data = await api('/api/battle/room/join', { code: joinCode, team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal gabung room.');
      fetchRooms(roomPage, roomQ);
      return;
    }
    seenLog.current = 0;
    applyState(data.state);
    splashFor(data.state);
    try { localStorage.setItem(MY_ROOM_KEY, data.state.code); } catch { /* abaikan */ }
    setRoomList((prev) => prev.filter((r) => r.code !== data.state.code));
  }

  function clearMyRoom() {
    try { localStorage.removeItem(MY_ROOM_KEY); } catch { /* abaikan */ }
  }

  async function cancelRoom() {
    if (!st) return;
    setPending(null);
    setHint('');
    setSplash(null);
    try {
      await fetch(`/api/battle/room?code=${encodeURIComponent(st.code)}`, { method: 'DELETE' });
    } catch {
      // abaikan, tetap keluar
    }
    clearMyRoom();
    setSt(null);
    setPicked([]);
    fetchMine();
    fetchRooms(roomPage, roomQ);
  }

  async function surrenderBattle() {
    if (!st) return;
    setError('');
    const data = await api('/api/battle/room/forfeit', { code: st.code });
    setAskSurrender(false);
    if (!data.success) {
      setError(data.message || 'Gagal menyerah.');
      refresh();
      return;
    }
    refresh();
  }

  function exitBattle() {
    clearMyRoom();
    setSt(null);
    setPicked([]);
    setFx(null);
    setPending(null);
    setHint('');
    setSplash(null);
    setAutoExitIn(0);
    fighterRefs.current = {};
    setChatMsgs([]);
    chatAfter.current = 0;
    fetchMine();
    fetchRooms(roomPage, roomQ);
    fetchHistory();
  }

  async function doAct(action) {
    if (!st || acting) return;
    setActing(true);
    setPending(null);
    setHint('');
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
    if (!data.success) {
      clearMyRoom();
      setSt(null);
      setPicked([]);
      setError(data.message || 'Room tidak tersedia lagi.');
      fetchMine();
      fetchRooms(roomPage, roomQ);
      return;
    }
    if (data.state) applyState(data.state);
  }

  useEffect(() => {
    if (!st || st.status === 'finished' || st.battle?.over) return;
    const waiting = st.status === 'waiting';
    const myTurn = st.turn === me?.id;
    if (!waiting && myTurn) return;
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status, st?.turn, st?.battle?.over, me?.id]);

  // Battle selesai: scroll ke hasil + otomatis kembali ke menu pilih tim.
  const battleDone = Boolean(st && (st.status === 'finished' || st.battle?.over));
  useEffect(() => {
    if (!battleDone) {
      setAutoExitIn(0);
      return;
    }
    if (resultRef.current) {
      try { resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* abaikan */ }
    }
    setAutoExitIn(8);
    const tick = setInterval(() => { setAutoExitIn((n) => Math.max(0, n - 1)); }, 1000);
    const to = setTimeout(() => { exitBattle(); }, 8000);
    return () => { clearInterval(tick); clearTimeout(to); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status, st?.battle?.over]);

  const mySide = st?.yourSide || 'player';
  const foeSide = mySide === 'player' ? 'enemy' : 'player';
  const myTeam = st?.battle?.[mySide];
  const foeTeam = st?.battle?.[foeSide];
  const myTurn = st && st.status === 'ongoing' && !st.battle.over && st.turn === me?.id;
  const activeFighter = myTeam?.fighters[myTeam?.active];
  const canSkill = activeFighter && myTeam && activeFighter.alive && myTeam.cons >= activeFighter.cons;
  const hasSkill2 = Boolean(activeFighter?.skill2Name) && (activeFighter?.skill2 || 0) > 0;
  const canSkill2 = activeFighter && myTeam && activeFighter.alive && hasSkill2 && myTeam.cons >= (activeFighter.cons2 ?? 99);
  const fLeft = forfeitLeft();

  function fxFor(name, side) {
    if (!fx || !name) return '';
    if (fx.allyTarget === name && side === fx.side && fx.kind === 'shield') return 'shielded';
    if (side !== fx.targetSide) return '';
    if (fx.target === name && (fx.kind === 'attack' || fx.kind === 'shield')) return 'hit';
    if (fx.target === name && fx.kind === 'heal') return 'healed';
    if (fx.target === name && fx.kind === 'ko') return '';
    return '';
  }

  function floatInfoFor(name, side) {
    if (!fx || fx.target !== name || side !== fx.targetSide || fx.num == null) return null;
    return { num: fx.num, crit: fx.crit, absorbed: fx.absorbed };
  }

  const filteredCards = cards.filter((c) => {
    if (pickRole !== 'All' && c.stats?.role !== pickRole) return false;
    if (pickTier !== 'All' && c.tier !== pickTier) return false;
    if (pickQ.trim() && !`${c.name} ${c.tier}`.toLowerCase().includes(pickQ.trim().toLowerCase())) return false;
    return true;
  });

  const iWon = Boolean(st && (st.status === 'finished' || st.battle?.over) && String(st.winner) === String(me?.id));
  const confetti = useMemo(() => {
    if (!iWon) return null;
    const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
    return Array.from({ length: 28 }).map((_, i) => (
      <i
        key={i}
        style={{
          left: `${(i * 97 + 13) % 100}%`,
          background: colors[i % colors.length],
          animationDelay: `${((i * 137) % 800) / 1000}s`,
          animationDuration: `${1.6 + ((i * 53) % 1200) / 1000}s`,
        }}
      />
    ));
  }, [iWon, st?.code]);

  if (loading) {
    return <PageSkeleton username={me?.username} title="Battle Kartu" />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Battle Kartu</h1>
          </div>
          <ErrorRetry message={error} onRetry={refresh} />

          {!st && myRooms.length > 0 ? (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--link)' }}>
              <div className="section-title">Room aktifmu (bebas pindah page, auto masuk saat lawan gabung)</div>
              {myRooms.map((r) => (
                <div className="user-row" key={r.code}>
                  <span>
                    <span style={{ fontWeight: 800, letterSpacing: 2 }}>{r.code}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--body)' }}>
                      {r.status === 'waiting' ? `menunggu... ${fmtSisa(r.expiresAt)}` : `vs @${r.yourSide === 'player' ? r.p2Username : r.p1Username} — giliran ${r.turn === me?.id ? 'kamu' : 'lawan'}`}
                    </span>
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button
                      className="btn"
                      style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }}
                      onClick={() => {
                        seenLog.current = 0;
                        applyState(r);
                        try { localStorage.setItem(MY_ROOM_KEY, r.code); } catch { /* abaikan */ }
                      }}
                    >
                      Masuk
                    </button>
                    {r.status === 'waiting' ? (
                      <button
                        className="btn btn-ghost"
                        style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }}
                        onClick={async () => {
                          try {
                            await fetch(`/api/battle/room?code=${encodeURIComponent(r.code)}`, { method: 'DELETE' });
                          } catch { /* abaikan */ }
                          fetchMine();
                          fetchRooms(roomPage, roomQ);
                        }}
                      >
                        Batal
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {!st ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Battle aktif ({roomTotal})</div>
              <form onSubmit={onSearchRoom} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  className="input"
                  placeholder="Cari usn / kode..."
                  value={roomQInput}
                  onChange={(e) => setRoomQInput(e.target.value)}
                />
                <button className="btn" type="submit" style={{ width: 'auto', padding: '0 20px' }}>
                  Cari
                </button>
              </form>
              {roomLoading ? <div style={{ fontSize: 13 }}>Memuat...</div> : null}
              {!roomLoading && roomList.length === 0 ? (
                <div style={{ fontSize: 13 }}>Belum ada battle ready.</div>
              ) : null}
              {roomList.map((r) => (
                <div className="user-row" key={r.code}>
                  <span>
                    <strong>@{r.username}</strong>
                    <span style={{ marginLeft: 8, fontWeight: 800, letterSpacing: 2 }}>{r.code}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                      {fmtSisa(r.expiresAt)}
                    </span>
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ width: 'auto', minHeight: 0, padding: '6px 12px', marginLeft: 'auto' }}
                    disabled={r.isMine}
                    onClick={() => onPickRoom(r.code)}
                  >
                    {r.isMine ? 'Milikmu' : 'Gabung'}
                  </button>
                </div>
              ))}
              {roomTotalPages > 1 ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ width: 'auto' }}
                    disabled={roomPage <= 1}
                    onClick={() => setRoomPage((p) => Math.max(1, p - 1))}
                  >
                    Sebelumnya
                  </button>
                  <span style={{ fontSize: 12 }}>
                    {roomPage}/{roomTotalPages}
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ width: 'auto' }}
                    disabled={roomPage >= roomTotalPages}
                    onClick={() => setRoomPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!st ? (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                    <label className="label" htmlFor="battleMode">Mode</label>
                    <select id="battleMode" className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
                      <option value="ai">Lawan AI</option>
                      <option value="create">Buat room PvP (kode angka)</option>
                      <option value="join">Gabung room (kode angka)</option>
                    </select>
                  </div>
                  {mode === 'ai' ? (
                    <div className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                      <label className="label" htmlFor="difficulty">Difficulty AI</label>
                      <select id="difficulty" className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        <option value="easy">Easy</option>
                        <option value="normal">Normal</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  ) : null}
                  {mode === 'join' ? (
                    <form id="joinForm" onSubmit={joinPvp} className="field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
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
                    </form>
                  ) : null}
                </div>
                <div className="section-title">Pilih 3 kartumu</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', minHeight: 0, padding: '8px 14px' }}
                    disabled={cards.length === 0}
                    onClick={() => {
                      const team = pickAutoTeam(cards);
                      setPicked(team);
                      setVanguard(team[0] || '');
                    }}
                    title="Otomatis: 1 Tank + 1 Support + kartu terkuat"
                  >
                    ⚡ Auto Tim
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Cari kartu..." value={pickQ} onChange={(e) => setPickQ(e.target.value)} aria-label="Cari kartu battle" />
                  <select className="select" style={{ width: 130 }} value={pickRole} onChange={(e) => setPickRole(e.target.value)} aria-label="Filter role">
                    {['All', 'Damage', 'Tank', 'Support', 'Assist'].map((r) => (
                      <option key={r} value={r}>{r === 'All' ? 'Semua role' : r}</option>
                    ))}
                  </select>
                  <select className="select" style={{ width: 130 }} value={pickTier} onChange={(e) => setPickTier(e.target.value)} aria-label="Filter tier">
                    {['All', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common'].map((t) => (
                      <option key={t} value={t}>{t === 'All' ? 'Semua tier' : t}</option>
                    ))}
                  </select>
                </div>
                {presets.length > 0 ? (
                  <div className="chip-row" style={{ marginBottom: 12 }}>
                    {presets.map((p, i) => (
                      <button key={i} type="button" className="chip" onClick={() => loadPreset(p)} title={p.team.join(', ')}>
                        {p.name}: {p.team.length}/3
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="pick-grid">
                  {filteredCards.map((c) => {
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
                              <img className="card-art" src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" />
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
                {filteredCards.length === 0 ? <div style={{ fontSize: 13, marginTop: 8 }}>Tidak ada kartu cocok. Ubah filter.</div> : null}
                {picked.length === 3 ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                      <label className="label" htmlFor="vanguard">Yang maju duluan</label>
                      <select id="vanguard" className="select" value={vanguard} onChange={(e) => setVanguard(e.target.value)}>
                        {picked.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={savePreset}>
                      Simpan preset
                    </button>
                  </div>
                ) : null}
                {cards.length === 0 ? (
                  <div style={{ fontSize: 13 }}>Kamu belum punya kartu. Gacha dulu.</div>
                ) : null}
              </div>

              {history.length > 0 ? (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-title">Riwayat battle (10 terakhir)</div>
                  {history.map((h, i) => (
                    <div className="user-row" key={`${h.code}-${i}`}>
                      <span>
                        <b style={{ color: h.won ? 'var(--success)' : 'var(--body)' }}>{h.won ? 'Menang' : 'Kalah'}</b>
                        {' '}vs @{h.foe} [{h.mode}] <span style={{ color: 'var(--muted)', fontSize: 11 }}>{h.reason}</span>
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{h.code}</span>
                    </div>
                  ))}
                </div>
              ) : null}

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
                  {mode === 'ai' ? `Mulai vs AI ${difficulty} (${picked.length}/3)` : `Buat Kode Room (${picked.length}/3)`}
                </button>
              )}
            </div>
            </div>
          ) : st.status === 'waiting' ? (
            <div className="card waiting-card">
              <div className="section-title">Room {st.code}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="waiting-art pulse"
                src="/battle-waiting.png"
                alt="Menunggu lawan"
                width={768}
                height={429}
                decoding="async"
              />
              <div className="trade-code-big">{st.code}</div>
              <div className="trade-hint">Bagikan kode ini ke lawan. Menunggu gabung... (hangus dalam 5 menit)</div>
              <button className="btn btn-ghost" onClick={refresh}>
                Cek Lagi
              </button>{' '}
              <button
                className="btn btn-ghost"
                onClick={cancelRoom}
              >
                Batal
              </button>
            </div>
          ) : (
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>Room {st.code} • {st.mode === 'ai' ? `AI (${difficulty})` : 'PvP'}</span>
                  {fLeft != null && !st.battle.over ? (
                    <span className={fLeft < 30000 ? 'turn-badge danger' : 'turn-badge'} title="2 menit tanpa aksi = menyerah otomatis">
                      ⏱ {fmtClock(fLeft)}
                    </span>
                  ) : null}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {!st.battle.over ? (
                      <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={() => setAskSurrender(true)}>
                        Menyerah
                      </button>
                    ) : null}
                    <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={refresh}>
                      Refresh
                    </button>
                  </span>
                </div>
                {fLeft != null && !st.battle.over ? (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Diam 2 menit = otomatis menyerah dan battle berakhir.
                  </div>
                ) : null}
              </div>

              <div ref={arenaRef} className="arena">
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="arena-side-title">
                  {st.mode === 'ai' ? 'Lawan (AI)' : `@${mySide === 'player' ? st.p2Username : st.p1Username}`}
                  {st.turn !== me?.id && st.status === 'ongoing' && !st.battle.over ? (
                    <span className="turn-badge">Giliran lawan</span>
                  ) : null}
                </div>
                <div className="fighters">
                  {foeTeam?.fighters.map((f, i) => {
                    const isActiveFoe = foeTeam.active === i;
                    const armedFoe = Boolean(myTurn && !acting && pending?.kind === 'foe' && isActiveFoe && f.alive);
                    const hintable = Boolean(myTurn && !acting && isActiveFoe && f.alive && !armedFoe);
                    return (
                      <FighterCard
                        key={f.name}
                        f={f}
                        active={isActiveFoe}
                        art={arts[f.name.toLowerCase()]}
                        fx={fxFor(f.name, foeSide)}
                        foe={floatInfoFor(f.name, foeSide)}
                        tappable={armedFoe || hintable}
                        selectTone={armedFoe ? 'targetable-foe' : ''}
                        preview={armedFoe ? pendingPreviewForFoe() : null}
                        refCb={(el) => { if (el) fighterRefs.current[`${foeSide}:${i}`] = el; }}
                        onTap={() => {
                          if (armedFoe) {
                            doAct({ type: pending.type, target: i });
                          } else if (hintable) {
                            flashHint(pending ? 'Skill ini hanya untuk timmu. Ketuk kartu timmu.' : 'Pilih ATK / Skill dulu, lalu ketuk kartu aktif lawan.');
                          }
                        }}
                      />
                    );
                  })}
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
                    const armingAlly = Boolean(myTurn && !acting && pending?.kind === 'ally');
                    const validAlly = armingAlly && allyValid(f);
                    const switchable = Boolean(myTurn && !acting && !pending && f.alive && i !== myTeam.active);
                    const isSource = Boolean(pending && i === myTeam.active && f.alive);
                    return (
                      <FighterCard
                        key={f.name}
                        f={f}
                        active={myTeam.active === i}
                        art={arts[f.name.toLowerCase()]}
                        fx={fxFor(f.name, mySide)}
                        foe={floatInfoFor(f.name, mySide)}
                        tappable={validAlly || switchable}
                        selectTone={validAlly ? 'targetable-ally' : isSource ? 'pending-source' : ''}
                        preview={validAlly ? pendingPreviewForAlly() : null}
                        refCb={(el) => { if (el) fighterRefs.current[`${mySide}:${i}`] = el; }}
                        onTap={() => {
                          if (validAlly) {
                            doAct({ type: pending.type, ally: i, target: foeTeam?.active });
                          } else if (armingAlly) {
                            flashHint(pending?.fx === 'heal' || pending?.fx === 'energize' ? 'Pilih teman yang HP-nya belum penuh.' : 'Pilih teman yang masih hidup.');
                          } else if (switchable) {
                            doAct({ type: 'switch', to: i });
                          }
                        }}
                      />
                    );
                  })}
                </div>
                <ConsPips value={myTeam?.cons || 0} />
                {hint ? (
                  <div className="action-hint">{hint}</div>
                ) : null}
                {myTurn && !acting ? (
                  <div className="action-bar">
                    <button
                      className={pending?.type === 'basic' ? 'btn armed' : 'btn'}
                      style={{ width: 'auto' }}
                      onClick={() => armAction('basic')}
                    >
                      ATK ({activeFighter?.basic})
                    </button>
                    <button
                      className={pending?.type === 'skill' ? 'btn armed' : 'btn'}
                      style={{ width: 'auto' }}
                      disabled={!canSkill}
                      onClick={() => armAction('skill')}
                      title={activeFighter ? (canSkill ? `${activeFighter.skillName} — ${activeFighter.cons} cons` : `Butuh ${activeFighter.cons} cons (kamu ${myTeam?.cons || 0})`) : ''}
                    >
                      Skill ({activeFighter?.cons} cons)
                    </button>
                    {hasSkill2 ? (
                      <button
                        className={pending?.type === 'skill2' ? 'btn armed' : 'btn'}
                        style={{ width: 'auto' }}
                        disabled={!canSkill2}
                        onClick={() => armAction('skill2')}
                        title={activeFighter ? (canSkill2 ? `${activeFighter.skill2Name} — ${activeFighter.cons2} cons (★5)` : `Butuh ${activeFighter.cons2} cons (kamu ${myTeam?.cons || 0})`) : ''}
                      >
                        Skill2 ({activeFighter?.cons2} cons)
                      </button>
                    ) : null}
                    {pending ? (
                      <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => { setPending(null); setHint(''); }}>
                        Batal
                      </button>
                    ) : null}
                    <div style={{ width: '100%', fontSize: 11, color: 'var(--body)' }}>
                      {pending?.kind === 'foe'
                        ? '🎯 Ketuk kartu AKTIF lawan untuk menyerang.'
                        : pending?.kind === 'ally'
                          ? '💚 Ketuk kartu timmu untuk heal / shield.'
                          : '1) Pilih ATK/Skill, 2) ketuk kartu aktif lawan. Skill heal/shield → ketuk teman. Ketuk kartu cadangan untuk ganti.'}
                    </div>
                  </div>
                ) : null}
                {myTurn && !acting && myTeam?.lastWasSkill ? (
                  <div className="combo-badge">🔥 COMBO — skill berikutnya +25%</div>
                ) : null}
                {st.turn && !myTurn && st.status === 'ongoing' && !st.battle.over ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--body)' }}>
                    Menunggu lawan... (menyerah otomatis bila 2 menit diam)
                  </div>
                ) : null}
              </div>
              </div>

              {st.status === 'finished' || st.battle.over ? (
                <div className="card result-card" ref={resultRef} style={{ marginBottom: 16 }}>
                  {iWon ? <div className="confetti" aria-hidden="true">{confetti}</div> : null}
                  <div className="section-title">
                    {iWon ? '🏆 Menang!' : st.winner === 'AI' && st.mode === 'ai' ? 'Kalah' : 'Kalah'}
                    {st.result?.reason ? <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({st.result.reason})</span> : null}
                  </div>
                  {(() => {
                    const winSide = st.battle?.winner === 'you' ? mySide : foeSide;
                    const winTeam = st.battle?.[winSide];
                    const mvp = winTeam?.fighters ? [...winTeam.fighters].sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp))[0] : null;
                    return mvp ? (
                      <div style={{ fontSize: 12, color: 'var(--body)', marginBottom: 8 }}>
                        ⭐ MVP: <b>{mvp.name}</b> ({mvp.hp}/{mvp.maxHp} HP{mvp.alive ? '' : ', KO'})
                      </div>
                    ) : null;
                  })()}
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {st.result?.xp?.[me?.id] ? (
                      <span>
                        <CountUp value={st.result.xp[me.id].gain} />
                        {st.result.xp[me.id].capped ? ' (jatah harian habis)' : st.mode === 'pvp' ? ' (PvP: menang +XP, kalah +XP kecil)' : ''}
                      </span>
                    ) : (
                      <span>{st.mode === 'ai' ? 'Mode latihan vs AI: tanpa XP.' : 'Battle selesai.'}</span>
                    )}
                  </div>
                  <button
                    className="btn"
                    style={{ marginTop: 12 }}
                    onClick={exitBattle}
                  >
                    Main Lagi
                  </button>
                  {autoExitIn > 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      Otomatis kembali dalam {autoExitIn} dtk…
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">Jalannya battle ({st.battle?.turnCount || 0} giliran)</div>
                <div style={{ maxHeight: 160, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  {(st.battle?.log || []).slice(-8).reverse().map((ev, i) => (
                    <div key={`${ev.t}-${i}`} style={{ color: ev.type === 'ko' || ev.type === 'end' ? 'var(--ink)' : 'var(--body)', fontWeight: ev.type === 'ko' || ev.type === 'end' ? 800 : 400 }}>
                      <span style={{ color: 'var(--muted)', marginRight: 6 }}>#{ev.t}</span>{describeLog(ev)}
                    </div>
                  ))}
                  {(st.battle?.log || []).length === 0 ? <div style={{ color: 'var(--muted)' }}>Belum ada aksi.</div> : null}
                </div>
              </div>

              <div className="card">
                <div className="section-title">Chat battle (sementara, hanya room ini)</div>
                <div ref={chatBoxRef} style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, background: 'var(--hairline-soft)', borderRadius: 8, padding: 10 }}>
                  {chatMsgs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Belum ada chat. Sapa lawanmu!</div>
                  ) : chatMsgs.map((m) => (
                    <div key={m.id} style={{ fontSize: 12, textAlign: m.isMine ? 'right' : 'left' }}>
                      <span style={{ fontWeight: 800, color: m.isMine ? 'var(--link)' : 'var(--body)' }}>@{m.username}</span>
                      <div style={{ display: 'inline-block', marginLeft: 6, background: m.isMine ? '#d9fdd3' : 'var(--surface)', border: '1px solid var(--hairline-strong)', borderRadius: 8, padding: '4px 8px', maxWidth: '80%' }}>
                        {m.message}
                      </div>
                    </div>
                  ))}
                </div>
                {!st.battle.over ? (
                  <form onSubmit={sendBattleChat} style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      placeholder="Chat lawan..."
                      value={chatInput}
                      maxLength={200}
                      onChange={(e) => setChatInput(e.target.value)}
                      aria-label="Chat battle"
                    />
                    <button className="btn" type="submit" disabled={!chatInput.trim() || chatSending} style={{ width: 'auto', padding: '0 20px' }}>
                      Kirim
                    </button>
                  </form>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Chat ditutup karena battle selesai.</div>
                )}
              </div>
            </div>
          )}
          {askSurrender ? (
            <ConfirmModal
              title="Menyerah?"
              message="Battle langsung berakhir dan lawan menang."
              confirmLabel="Menyerah"
              onCancel={() => setAskSurrender(false)}
              onConfirm={surrenderBattle}
            />
          ) : null}
          {splash ? (
            <div className="vs-overlay" aria-hidden="true">
              <div className="vs-title">{splash.title}</div>
              {splash.sub ? <div className="vs-sub">{splash.sub}</div> : null}
              <div className="vs-fight">FIGHT!</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
