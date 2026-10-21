'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { FrameDefs, FrameOverlay } from '@/components/Frames';
import { PageSkeleton, ErrorRetry } from '@/components/PageState';
import ConfirmModal from '@/components/ConfirmModal';
import { optImg } from '@/lib/images';
import { fetchJson } from '@/lib/fetchJson';
import { readBattleCardsCache, writeBattleCardsCache } from '@/lib/battleLobby';
import { fmtClock, effectTone } from '@/lib/format';
import { useMe } from '@/hooks/useMe';
import { ConsPips, FighterCard, CountUp } from '@/components/BattleCards';

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
  const { me, loading: meLoading } = useMe();
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
  // Loading progresif per seksi (anti flicker full-page): shell tampil setelah auth,
  // kartu/rooms/mine mengisi susulan tanpa menahan satu sama lain.
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState('');
  const [roomsInitLoading, setRoomsInitLoading] = useState(true);
  const [mineRestoring, setMineRestoring] = useState(true);
  const [visibleCount, setVisibleCount] = useState(24);

  const [roomQInput, setRoomQInput] = useState('');
  const [roomQ, setRoomQ] = useState('');
  const [roomPage, setRoomPage] = useState(1);
  const [roomList, setRoomList] = useState([]);
  const [roomTotal, setRoomTotal] = useState(0);
  const [roomTotalPages, setRoomTotalPages] = useState(1);
  const [roomLoading, setRoomLoading] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [streamOn, setStreamOn] = useState(false);
  const [streamFail, setStreamFail] = useState(false);
  const [online, setOnline] = useState([]);
  const [rematchOffer, setRematchOffer] = useState(null);
  const [notice, setNotice] = useState('');
  const [foeBanner, setFoeBanner] = useState(null);
  const [vibe, setVibe] = useState(null);
  const [speed, setSpeed] = useState(() => {
    try {
      if (typeof window === 'undefined') return '1';
      return localStorage.getItem('battle_speed') || '1';
    } catch { return '1'; }
  });
  const [autoBattle, setAutoBattle] = useState(false);
  const esRef = useRef(null);
  const speedRef = useRef('1');
  const vibeTimer = useRef(null);
  const foeBannerTimer = useRef(null);

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
    splashTimer.current = setTimeout(() => setSplash(null), Math.round(1600 * SPD()));
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
    burn: '#ea580c', crit: '#65a30d', heavy: '#ea580c', double: '#ea580c',
    shield: '#2c67e9', bulwark: '#2c67e9', regen: '#15803d', heal: '#15803d',
    energize: '#15803d', surge: '#65a30d', weaken: '#7c5cd6', focus: '#b8860b',
    slam: '#0a0a0a',
  };

  function fireProjectile(fromKey, toKey, color, dur = 420) {
    const D = Math.max(60, Math.round(dur * SPD()));
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
        const tone = String(color || '#a3e636');
        dot.className = 'projectile';
        dot.style.background = tone;
        dot.style.boxShadow = `0 0 14px ${tone}, 0 0 3px #ffffff`;
        dot.style.left = `${x1}px`;
        dot.style.top = `${y1}px`;
        arena.appendChild(dot);
        const anim = dot.animate(
          [
            { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0.5 },
            { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.25 },
            { transform: `translate(calc(-50% + ${x2 - x1}px), calc(-50% + ${y2 - y1}px)) scale(1)`, opacity: 1 },
          ],
          { duration: D, easing: 'cubic-bezier(0.3,0.7,0.4,1)' }
        );
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          dot.remove();
          impactBurst(x2, y2, color);
          resolve();
        };
        anim.onfinish = finish;
        setTimeout(finish, dur + 300);
      } catch {
        resolve();
      }
    });
  }

  // Ledakan kecil di titik target: shockwave + percikan, tanpa library.
  function impactBurst(x, y, color) {
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const arena = arenaRef.current;
      if (!arena) return;
      const tone = String(color || '#a3e636');
      const ring = document.createElement('span');
      ring.className = 'impact-ring';
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      ring.style.borderColor = tone;
      arena.appendChild(ring);
      setTimeout(() => ring.remove(), 650);

      for (let i = 0; i < 8; i++) {
        const spark = document.createElement('i');
        spark.className = 'impact-spark';
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        spark.style.background = tone;
        spark.style.color = tone;
        arena.appendChild(spark);
        const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.35;
        const distance = 16 + Math.random() * 22;
        spark.animate(
          [
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
            {
              transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0.15)`,
              opacity: 0,
            },
          ],
          { duration: 360 + Math.random() * 220, easing: 'cubic-bezier(.2,.8,.25,1)' }
        ).onfinish = () => spark.remove();
      }
    } catch { /* efek dekoratif, jangan ganggu battle */ }
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
    // P4.2: jangan arm skill bila cons kurang — beri tahu kebutuhan, bukan diam.
    const okCons = type === 'skill2' ? canSkill2 : canSkill;
    if (!okCons) {
      const need = type === 'skill2' ? (atk.cons2 ?? 99) : atk.cons;
      flashHint(`Butuh ${need} cons (kamu ${myTeam?.cons || 0}). Pakai ATK dulu.`);
      return;
    }
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

  // Pengali durasi animasi (speed 2x = separuh waktu).
  const SPD = () => (speedRef.current === '2' ? 0.5 : 1);

  useEffect(() => {
    speedRef.current = speed;
    try { localStorage.setItem('battle_speed', speed); } catch { /* abaikan */ }
  }, [speed]);

  // Warna tombol skill mengikuti efeknya (A2).
  function toneForEffect(fx) {
    if (['heal', 'regen', 'energize'].includes(fx)) return 'tone-heal';
    if (['shield', 'bulwark'].includes(fx)) return 'tone-shield';
    if (['burn', 'heavy', 'crit', 'double', 'slam'].includes(fx)) return 'tone-atk';
    if (['surge', 'weaken', 'focus'].includes(fx)) return 'tone-arcane';
    return '';
  }

  // Warna baris log mengikuti tipenya (A5).
  function logTone(ev) {
    if (!ev) return {};
    if (ev.type === 'ko' || ev.type === 'end') return { color: 'var(--ink)', fontWeight: 800 };
    if (ev.type === 'heal' || ev.type === 'hot' || ev.type === 'regen') return { color: 'var(--success)', fontWeight: 700 };
    if ((ev.type === 'basic' || ev.type === 'skill') && ev.crit) return { color: 'var(--error)', fontWeight: 700 };
    if (ev.type === 'basic' || ev.type === 'skill') return { color: 'var(--body)' };
    return { color: 'var(--muted)' };
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
      const D = Math.max(80, Math.round(dur * SPD()));
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
        a.style.transition = `transform ${D}ms cubic-bezier(0.3,0.7,0.4,1)`;
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
          }, Math.max(80, Math.round(400 * SPD())));
        }, D + Math.max(30, Math.round(90 * SPD())));
        setTimeout(finish, D + Math.max(200, Math.round(900 * SPD())));
      } catch {
        finish();
      }
    });
  }

  function hopCard(key) {
    return new Promise((resolve) => {
      const el = fighterRefs.current[key];
      if (!el) return resolve();
      const up = Math.max(60, Math.round(220 * SPD()));
      const down = Math.max(60, Math.round(240 * SPD()));
      try {
        el.style.transition = `transform ${up}ms ease-out`;
        el.style.transform = 'translateY(-16px) scale(1.06)';
        setTimeout(() => {
          el.style.transform = 'translate(0,0) scale(1)';
          setTimeout(() => {
            el.style.transition = '';
            el.style.transform = '';
            resolve();
          }, down);
        }, up);
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
        const color = EFFECT_COLORS[ev.effect] || (isSkill ? '#a3e636' : '#0a0a0a');
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
            fireProjectile(`${ev.side}:${ai}`, `${ev.side}:${ti}`, '#15803d', 380),
            hopCard(`${ev.side}:${ti}`),
          ]);
        } else if (ti >= 0) {
          await hopCard(`${ev.side}:${ti}`);
        }
      }
    } catch { /* animasi non-kritis */ }
  }

  const resultRef = useRef(null);
  const [autoExitIn, setAutoExitIn] = useState(0);

  // Nomor urut request lobby agar hasil basi (race search/polling) tidak menimpa state baru.
  // Mencegah flicker: hanya response terbaru yang boleh setRoomList/setMyRooms.
  const roomsSeq = useRef(0);
  const mineSeq = useRef(0);
  const stRef = useRef(null);
  useEffect(() => { stRef.current = st; }, [st]);

  // Bootstrap progresif anti-flicker:
  // Fase 1: auth saja -> shell langsung tampil (setLoading false cepat).
  // Fase 2: cards/mine/history/rooms paralel non-blocking, masing-masing punya
  // state loading sendiri. AbortError = silent (tidak jadi error fatal).
  useEffect(() => {
    if (meLoading) return;
    if (!me) return; // useMe menendang ke /login bila belum login
    setLoading(false); // shell langsung tampil (fase 1 instan via useMe)
    let cancelled = false;
    (async () => {
      // Fase 2a: preset lokal (instan, tanpa flicker).
      try {
        const raw = localStorage.getItem(PRESET_KEY);
        if (raw && !cancelled) setPresets(JSON.parse(raw) || []);
      } catch { /* abaikan */ }
      // Fase 2b: data pelengkap paralel.
      const tasks = [
        loadCards(),
        (async () => {
          try {
            const { ok, data } = await fetchJson('/api/battle/history?limit=10', { ms: 12000 });
            if (!cancelled && ok && data.success) setHistory(data.history || []);
          } catch { /* silent: history pelengkap */ } 
        })(),
        (async () => {
          const seq = ++mineSeq.current;
          try {
            const { ok, data } = await fetchJson('/api/battle/mine', { ms: 12000 });
            if (cancelled || seq !== mineSeq.current) return;
            if (ok && data.success && data.rooms?.length) {
              setMyRooms(data.rooms);
              // Auto-restore hanya bila user belum masuk room (hindari rebut state aktif -> flicker).
              if (!stRef.current) {
                const first = data.rooms[0];
                seenLog.current = 0;
                applyState(first, { animate: false });
                try { localStorage.setItem(MY_ROOM_KEY, first.code); } catch { /* abaikan */ }
              }
            } else {
              setMyRooms((prev) => (prev.length ? [] : prev));
              try {
                const saved = localStorage.getItem(MY_ROOM_KEY);
                if (saved && !stRef.current) localStorage.removeItem(MY_ROOM_KEY);
              } catch { /* abaikan */ }
            }
          } catch { /* silent */ } finally {
            if (!cancelled && seq === mineSeq.current) setMineRestoring(false);
          }
        })(),
        (async () => {
          await fetchLobby(1, '', true);
          if (!cancelled) setRoomsInitLoading(false);
        })(),
      ];
      await Promise.allSettled(tasks);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, me]);

  // Soft retry tanpa reload page (anti fresh/flicker): dipakai ErrorRetry.
  async function retryBootstrap() {
    setError('');
    setCardsError('');
    setCardsLoading(true);
    setRoomsInitLoading(true);
    setLoading(false);
    await Promise.allSettled([
      loadCards(),
      fetchLobby(roomPageRef.current, roomQRef.current, true).finally(() => setRoomsInitLoading(false)),
      fetchMine(),
    ]);
  }

  function applyState(state, opts = {}) {
    const animate = opts.animate !== false;
    setSt(state);
    const log = state.battle?.log || [];
    // Server cap log (300): panjang menyusut -> sinkronkan basis diff.
    if (log.length < seenLog.current) seenLog.current = log.length;
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
        fxTimer.current = setTimeout(() => setFx(null), Math.round(1600 * SPD()));
      }
      // Banner aksi musuh (A3) + vibe arena (A4).
      if (animate) {
        const foeActs = fresh.filter((e) => (e.type === 'basic' || e.type === 'skill') && e.side && e.side !== state.yourSide);
        if (foeActs.length > 0) {
          const last = foeActs[foeActs.length - 1];
          const label = last.type === 'skill' ? (last.skill || 'Skill') : 'ATK';
          setFoeBanner({ text: `${last.name || 'Lawan'}: ${label}${last.crit ? ' CRIT!' : ''}`, key: `${log.length}-${last.t}` });
          clearTimeout(foeBannerTimer.current);
          foeBannerTimer.current = setTimeout(() => setFoeBanner(null), Math.round(2200 * SPD()));
        }
        const vibeEv = [...fresh].reverse().find((e) => ['burn', 'regen', 'heal', 'energize', 'shield', 'bulwark'].includes(e.effect));
        if (vibeEv) {
          setVibe(vibeEv.effect === 'burn' ? 'burn' : (vibeEv.effect === 'shield' || vibeEv.effect === 'bulwark') ? 'shield' : 'heal');
          clearTimeout(vibeTimer.current);
          vibeTimer.current = setTimeout(() => setVibe(null), Math.round(1600 * SPD()));
        }
      }
      seenLog.current = log.length;
      // Animasi terbang untuk SEMUA aksi serangan/heal baru (milikmu, lawan, AI).
      if (animate) {
        const events = fresh.filter((e) =>
          e && (e.type === 'basic' || e.type === 'skill' || e.type === 'heal' || e.type === 'hot' || e.type === 'regen'));
        if (events.length > 0) {
          const wait = Math.max(30, Math.round(90 * SPD()));
          setTimeout(() => {
            (async () => {
              for (const e of events.slice(-3)) await animateEvent(state, e);
            })();
          }, wait);
        }
      }
    }
  }

  // P1.3: timeout dibedakan GET vs POST. POST mutasi tidak pernah auto-retry
  // (polling/refresh hanya memanggil GET) agar aksi tidak terkirim dobel.
  const GET_TIMEOUT_MS = 10000;
  const POST_TIMEOUT_MS = 20000;
  async function api(path, body, ms) {
    const timeout = ms ?? (body ? POST_TIMEOUT_MS : GET_TIMEOUT_MS);
    try {
      const { ok, data } = await fetchJson(
        path,
        body
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ms: timeout }
          : { ms: timeout }
      );
      if (!ok) return data && typeof data === 'object' ? data : { success: false };
      return data || {};
    } catch (e) {
      if (e?.name === 'AbortError') return { success: false, message: 'Server lambat (timeout). Coba lagi.' };
      return { success: false, message: 'Tidak bisa menghubungi server.' };
    }
  }

  // P1.1: backoff lobby — gagal beruntun 3x -> jeda 60 dtk + tombol manual.
  // Mencegah baris merah menumpuk saat network putus / server down.
  const lobbyFail = useRef(0);
  const [lobbyPaused, setLobbyPaused] = useState(false);
  const lobbyPausedRef = useRef(false);
  const lobbyResumeTimer = useRef(null);
  useEffect(() => { lobbyPausedRef.current = lobbyPaused; }, [lobbyPaused]);
  useEffect(() => () => { clearTimeout(lobbyResumeTimer.current); }, []);

  function noteLobbySuccess() {
    lobbyFail.current = 0;
    if (lobbyPausedRef.current) {
      clearTimeout(lobbyResumeTimer.current);
      setLobbyPaused(false);
    }
  }

  function noteLobbyFail() {
    lobbyFail.current += 1;
    if (lobbyFail.current >= 3 && !lobbyPausedRef.current) {
      setLobbyPaused(true);
      clearTimeout(lobbyResumeTimer.current);
      lobbyResumeTimer.current = setTimeout(() => {
        lobbyFail.current = 0;
        setLobbyPaused(false);
        fetchLobby(roomPageRef.current, roomQRef.current, false, true);
      }, 60000);
    }
  }

  function retryLobbyNow() {
    lobbyFail.current = 0;
    clearTimeout(lobbyResumeTimer.current);
    setLobbyPaused(false);
    fetchLobby(roomPageRef.current, roomQRef.current, false, true);
  }

  async function fetchRooms(page = roomPage, q = roomQ, initial = false) {
    const seq = ++roomsSeq.current;
    // Anti flicker spinner: hanya tampilkan loading saat list masih kosong (awal).
    // Polling background 15 dtk jalan silent agar "Memuat..." tidak kedip tiap interval.
    if (initial) {
      setRoomList((prev) => prev);
      if (roomListRef.current.length === 0) setRoomLoading(true);
    } else if (roomListRef.current.length === 0) {
      setRoomLoading(true);
    }
    try {
      const { ok, data } = await fetchJson(`/api/battle/rooms?q=${encodeURIComponent(q)}&page=${page}`, { ms: 12000 });
      if (seq !== roomsSeq.current) return true; // hasil basi -> buang, cegah flicker list
      if (ok && data.success) {
        setRoomList(data.rooms || []);
        setRoomTotal(data.pagination?.total || 0);
        setRoomTotalPages(data.pagination?.totalPages || 1);
        return true;
      }
      // Gagal/AbortError: pertahankan list lama (stale), jangan kosongkan -> no flicker.
      return false;
    } catch {
      // silent: rooms pelengkap, error inline ditangani pemanggil bila perlu
      return false;
    } finally {
      if (seq === roomsSeq.current) setRoomLoading(false);
    }
  }

  async function fetchMine(silent = true) {
    const seq = ++mineSeq.current;
    try {
      const { ok, data } = await fetchJson('/api/battle/mine', { ms: 12000 });
      if (seq !== mineSeq.current) return true;
      if (ok && data.success) {
        setMyRooms(data.rooms || []);
        return true;
      }
      if (!silent) setError('Gagal memuat room aktifmu.');
      return false;
    } catch (e) {
      if (!silent && e?.name !== 'AbortError') setError('Gagal memuat room aktifmu.');
      return false;
    }
  }

  async function fetchHistory() {
    try {
      const { ok, data } = await fetchJson('/api/battle/history?limit=10', { ms: 12000 });
      if (ok && data.success) setHistory(data.history || []);
    } catch { /* abaikan */ }
  }

  // P2.2: cache kartu owned 5 menit (stale-while-revalidate). Buka-ulang instan,
  // offline tetap tampil stale + tombol muat ulang. Helper di lib agar testable.
  function applyCardsList(all) {
    const owned = (all || []).filter((c) => c.owned ?? true);
    setCards(owned);
    setArts((prev) => {
      const artMap = { ...prev };
      for (const c of all || []) {
        if (!c.imageUrl) continue;
        const key = String(c.name || '').toLowerCase();
        if (key && !artMap[key]) artMap[key] = c.imageUrl;
      }
      return artMap;
    });
  }
  async function loadCards() {
    let hadStale = false;
    try {
      const cached = readBattleCardsCache();
      if (cached && cached.length) {
        hadStale = true;
        applyCardsList(cached);
        setCardsLoading(false);
      }
    } catch { /* abaikan */ }
    try {
      const { ok, data } = await fetchJson('/api/cards?owned=1', { ms: 12000 });
      if (ok && data.success) {
        applyCardsList(data.cards || []);
        writeBattleCardsCache(data.cards || []);
        setCardsError('');
      } else if (!hadStale) {
        setCardsError('Gagal memuat kartu. Tekan muat ulang.');
      } else {
        setCardsError('Gagal memperbarui (offline). Menampilkan data tersimpan.');
      }
    } catch (e) {
      if (hadStale) {
        setCardsError('Gagal memperbarui (offline). Menampilkan data tersimpan.');
      } else if (e?.name !== 'AbortError') {
        setCardsError('Gagal memuat kartu (timeout). Tekan muat ulang.');
      }
    } finally {
      setCardsLoading(false);
    }
  }

  // P1.2: 1 request lobby (rooms + mine). Fallback ke 2 endpoint lama bila gagal.
  // Return true bila salah satu sumber sukses (cukup untuk reset backoff).
  async function fetchLobby(page = roomPage, q = roomQ, initial = false, force = false) {
    if (lobbyPausedRef.current && !force) return false;
    // Fencing: hasil lobby basi tidak boleh menimpa fetchRooms/fetchMine yang lebih baru.
    roomsSeq.current += 1;
    mineSeq.current += 1;
    const roomsSeqNow = roomsSeq.current;
    const mineSeqNow = mineSeq.current;
    if (initial && roomListRef.current.length === 0) setRoomLoading(true);
    else if (roomListRef.current.length === 0) setRoomLoading(true);
    try {
      const { ok, data } = await fetchJson(
        `/api/battle/bootstrap?q=${encodeURIComponent(q)}&page=${page}`,
        { ms: 12000 }
      );
      if (ok && data.success) {
        if (roomsSeqNow === roomsSeq.current) {
          setRoomList(data.rooms || []);
          setRoomTotal(data.pagination?.total || 0);
          setRoomTotalPages(data.pagination?.totalPages || 1);
        }
        if (mineSeqNow === mineSeq.current) setMyRooms(data.mine || []);
        noteLobbySuccess();
        return true;
      }
    } catch { /* fallback legacy di bawah */ } finally {
      setRoomLoading(false);
    }
    // Fallback: endpoint lama (tetap dipertahankan agar tidak breaking).
    const [rOk, mOk] = await Promise.all([
      fetchRooms(page, q, initial),
      fetchMine(true),
    ]);
    const okAny = Boolean(rOk || mOk);
    if (okAny) noteLobbySuccess();
    else noteLobbyFail();
    return okAny;
  }

  // Mirror page/q ke ref agar interval stabil (tidak recreate tiap ketik -> no refetch badai).
  const roomPageRef = useRef(roomPage);
  const roomQRef = useRef(roomQ);
  const roomListRef = useRef(roomList);
  useEffect(() => { roomPageRef.current = roomPage; }, [roomPage]);
  useEffect(() => { roomQRef.current = roomQ; }, [roomQ]);
  useEffect(() => { roomListRef.current = roomList; }, [roomList]);

  // Debounce search rooms: cegah request tiap tombol Cari dobel + race.
  // Lewat fetchLobby (1 request) + hormati backoff pause.
  useEffect(() => {
    if (loading || st || lobbyPaused) return;
    const t = setTimeout(() => { fetchLobby(roomPage, roomQ); }, roomQ ? 150 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, st, roomPage, roomQ, lobbyPaused]);

  useEffect(() => {
    if (loading || st) return;
    // Polling lobby hemat: 15 dtk, pause saat hidden / backoff. Silent anti kedip.
    const t = setInterval(() => {
      if (document.hidden || lobbyPausedRef.current) return;
      fetchLobby(roomPageRef.current, roomQRef.current);
    }, 15000);
    // Countdown 1 dtk hanya bila ada yang perlu dihitung (waiting/ongoing) -> hemat render.
    const needTick = myRooms.length > 0 || roomList.length > 0 || (st && st.status !== 'finished' && !st.battle?.over);
    if (!needTick) return () => clearInterval(t);
    const tick = setInterval(() => {
      if (!document.hidden) setNowTick(Date.now());
    }, 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, st?.code, st?.status, roomPage, roomQ, myRooms.length, roomList.length]);


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
        fetchLobby(roomPageRef.current, roomQRef.current, false, true);
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
    setNotice('');
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
    setNotice('');
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
    setNotice('');
    setPending(null);
    setHint('');
    if (picked.length !== 3) {
      setError('Pilih 3 kartumu dulu sebelum gabung.');
      return;
    }
    const data = await api('/api/battle/room/join', { code: joinCode, team: orderedTeam() });
    if (!data.success) {
      setError(data.message || 'Gagal gabung room.');
      fetchLobby(roomPageRef.current, roomQRef.current, false, true);
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
    const cur = stRef.current;
    if (!cur) return;
    setPending(null);
    setHint('');
    setSplash(null);
    setRematchOffer(null);
    setOnline([]);
    try {
      await fetchJson(`/api/battle/room?code=${encodeURIComponent(cur.code)}`, { method: 'DELETE', ms: 12000 });
    } catch {
      // abaikan, tetap keluar
    }
    clearMyRoom();
    setSt(null);
    setFx(null);
    setPending(null);
    // picked dipertahankan agar user tidak mengulang pilih 3 kartu (anti flicker/kerja ulang).
    fetchLobby(roomPageRef.current, roomQRef.current, false, true);
  }

  async function surrenderBattle() {
    const cur = stRef.current;
    if (!cur) return;
    setError('');
    const data = await api('/api/battle/room/forfeit', { code: cur.code }, 15000);
    setAskSurrender(false);
    if (!data.success) {
      setError(data.message || 'Gagal menyerah.');
      refresh(true);
      return;
    }
    refresh(true);
  }

  function exitToJoin(code) {
    clearMyRoom();
    setSt(null);
    // picked dipertahankan agar rematch tidak memaksa pilih ulang dari nol.
    setFx(null);
    setPending(null);
    setHint('');
    setSplash(null);
    setRematchOffer(null);
    setOnline([]);
    setFoeBanner(null);
    setVibe(null);
    setAutoBattle(false);
    setJoinCode(code);
    setMode('join');
    setNotice('Pilih 3 kartumu lalu tekan Gabung & Mulai untuk menerima rematch.');
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* abaikan */ }
  }

  async function offerRematch() {
    if (!st) return;
    setError('');
    const data = await api('/api/battle/room/rematch', { code: st.code });
    if (!data.success || !data.code) {
      setError(data.message || 'Gagal membuat rematch.');
      return;
    }
    const r = await api(`/api/battle/room?code=${encodeURIComponent(data.code)}`);
    if (r.success && r.state) {
      clearMyRoom();
      setSt(null);
      setRematchOffer(null);
      setOnline([]);
      seenLog.current = 0;
      applyState(r.state, { animate: false });
      try { localStorage.setItem(MY_ROOM_KEY, r.state.code); } catch { /* abaikan */ }
      setNotice('Room rematch dibuat. Bagikan kode ke lawan / tunggu lawan menerima.');
    } else {
      exitToJoin(data.code);
    }
  }

  function acceptRematch() {
    if (!rematchOffer?.code) return;
    exitToJoin(rematchOffer.code);
  }

  function exitBattle() {
    clearMyRoom();
    setSt(null);
    // picked dipertahankan (tim terakhir) agar tombol Main Lagi tidak memaksa pilih ulang.
    setFx(null);
    setPending(null);
    setHint('');
    setSplash(null);
    setRematchOffer(null);
    setOnline([]);
    setFoeBanner(null);
    setVibe(null);
    setAutoBattle(false);
    setAutoExitIn(0);
    fighterRefs.current = {};
    fetchLobby(roomPageRef.current, roomQRef.current, false, true);
    fetchHistory();
  }

  async function doAct(action) {
    const cur = stRef.current;
    if (!cur || acting) return;
    setActing(true);
    setPending(null);
    setHint('');
    setError('');
    const data = await api('/api/battle/room/act', { code: cur.code, action }, 15000);
    setActing(false);
    if (!data.success) {
      // Transient (timeout/500): jangan tendang ke lobby -> anti flicker. Refresh silent.
      setError(data.message || 'Aksi gagal.');
      refresh(true);
      return;
    }
    if (data.battle) {
      const base = stRef.current || cur;
      applyState({ ...base, battle: data.battle, result: data.result || base.result });
      if (data.finished) refresh(true);
    }
  }

  function isRoomGone(data) {
    const msg = String(data?.message || '').toLowerCase();
    return /tidak tersedia|tidak ditemukan|hangus|kedaluwarsa|expired|404/.test(msg);
  }

  async function refresh(silent = false) {
    const cur = stRef.current;
    if (!cur) return;
    const data = await api(`/api/battle/room?code=${encodeURIComponent(cur.code)}`, null, 10000);
    if (!data.success) {
      // Hanya keluar ke lobby bila room benar-benar gone. Selain itu tahan state (no flicker).
      if (isRoomGone(data)) {
        clearMyRoom();
        setSt(null);
        setError(data.message || 'Room tidak tersedia lagi.');
        fetchLobby(roomPageRef.current, roomQRef.current, false, true);
      } else if (!silent) {
        setError(data.message || 'Gagal sinkron battle.');
      }
      return;
    }
    if (data.state) applyState(data.state);
  }

  // Realtime PvP via SSE; fallback polling bila stream gagal. AI sinkron penuh.
  useEffect(() => {
    if (!st || st.mode !== 'pvp' || st.status === 'finished' || st.battle?.over) return;
    setRematchOffer(null);
    setOnline([]);
    let es = null;
    try {
      es = new EventSource(`/api/battle/room/stream?code=${encodeURIComponent(st.code)}`);
    } catch {
      setStreamFail(true);
    }
    if (es) {
      esRef.current = es;
      setStreamFail(false);
      es.addEventListener('ready', () => setStreamOn(true));
      es.addEventListener('state', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (Array.isArray(data.online)) setOnline(data.online);
          if (data.rematch) setRematchOffer(data.rematch);
          if (data.state) applyState(data.state);
        } catch { /* abaikan */ }
      });
      es.addEventListener('gone', () => {
        try { es.close(); } catch { /* abaikan */ }
        esRef.current = null;
        setStreamOn(false);
        refresh(true);
      });
      es.onerror = () => {
        setStreamFail(true);
        setStreamOn(false);
        try { es.close(); } catch { /* abaikan */ }
        esRef.current = null;
      };
    }
    return () => {
      try { es?.close(); } catch { /* abaikan */ }
      esRef.current = null;
      setStreamOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code]);

  // Fallback polling hemat: PvP 5 dtk hanya bila stream gagal; AI 30 dtk (cukup untuk forfeit/timeout).
  // Silent agar tidak menimpa error aksi user dan tidak flicker.
  useEffect(() => {
    if (!st || st.status === 'finished' || st.battle?.over) return;
    if (st.mode === 'pvp' && streamOn && !streamFail) return;
    const ms = st.mode === 'pvp' ? 5000 : 30000;
    const t = setInterval(() => { if (!document.hidden) refresh(true); }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status, st?.turn, st?.battle?.over, me?.id, streamOn, streamFail]);

  // Battle selesai: scroll ke hasil + otomatis kembali ke menu pilih tim.
  const battleDone = Boolean(st && (st.status === 'finished' || st.battle?.over));
  useEffect(() => {
    if (!battleDone) {
      setAutoExitIn(0);
      return;
    }
    // Beri waktu menerima rematch: jangan auto-keluar saat ada tawaran.
    if (rematchOffer) {
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
  }, [st?.code, st?.status, st?.battle?.over, rematchOffer]);

  // Auto-battle vs AI: mainkan giliranmu otomatis (A5).
  useEffect(() => {
    if (!autoBattle || !myTurn || acting || !st || st.mode !== 'ai' || st.battle?.over) return;
    const t = setTimeout(() => {
      const tgt = foeTeam?.active;
      if (canSkill2) doAct({ type: 'skill2', target: tgt });
      else if (canSkill) doAct({ type: 'skill', target: tgt });
      else doAct({ type: 'basic', target: tgt });
    }, Math.max(300, Math.round(700 * SPD())));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

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

  const filteredCards = useMemo(() => cards.filter((c) => {
    if (pickRole !== 'All' && c.stats?.role !== pickRole) return false;
    if (pickTier !== 'All' && c.tier !== pickTier) return false;
    if (pickQ.trim() && !`${c.name} ${c.tier}`.toLowerCase().includes(pickQ.trim().toLowerCase())) return false;
    return true;
  }), [cards, pickRole, pickTier, pickQ]);

  // Paginasi grid: render 24 pertama saja agar first paint ringan (no jank).
  // useMemo agar slice tidak dihitung ulang tiap tick countdown (anti flicker).
  const visibleCards = useMemo(() => filteredCards.slice(0, visibleCount), [filteredCards, visibleCount]);
  const hasMoreCards = filteredCards.length > visibleCards.length;
  useEffect(() => { setVisibleCount(24); }, [pickQ, pickRole, pickTier, cards.length]);

  const iWon = Boolean(st && (st.status === 'finished' || st.battle?.over) && String(st.winner) === String(me?.id));
  const confetti = useMemo(() => {
    if (!iWon) return null;
    const colors = ['#a3e636', '#e5484d', '#2c67e9', '#eab308', '#a855f7'];
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

  const winBurstRef = useRef(false);
  useEffect(() => {
    if (!iWon) {
      winBurstRef.current = false;
      return;
    }
    if (winBurstRef.current) return;
    winBurstRef.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    import('canvas-confetti')
      .then(({ default: fireConfetti }) => {
        if (cancelled) return;
        const colors = ['#a3e636', '#ffd94a', '#ffb7d5', '#7fb0ec'];
        fireConfetti({
          particleCount: 110,
          spread: 78,
          startVelocity: 38,
          origin: { y: 0.58 },
          colors,
          scalar: 1.05,
          ticks: 180,
          zIndex: 90,
        });
        setTimeout(() => {
          if (!cancelled) {
            fireConfetti({
              particleCount: 60,
              angle: 60,
              spread: 55,
              origin: { x: 0, y: 0.7 },
              colors,
              zIndex: 90,
            });
            fireConfetti({
              particleCount: 60,
              angle: 120,
              spread: 55,
              origin: { x: 1, y: 0.7 },
              colors,
              zIndex: 90,
            });
          }
        }, 220);
      })
      .catch(() => { /* fallback: confetti DOM tetap tampil */ });
    return () => { cancelled = true; };
  }, [iWon, st?.code]);

  if (loading) {
    return <PageSkeleton username={me?.username} title="Battle Kartu" />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <FrameDefs />
          <div className="brand">
            <h1>Battle Kartu</h1>
          </div>
          <ErrorRetry message={error} onRetry={() => (stRef.current ? refresh(true) : retryBootstrap())} />
          {notice ? <div className="trade-fair ok" role="status" style={{ marginBottom: 16 }}>{notice}</div> : null}

          {!st && myRooms.length > 0 ? (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--link)' }}>
              <div className="section-title">Room aktifmu (bebas pindah page, auto masuk saat lawan gabung)</div>
              {myRooms.map((r) => {
                // P4.3: badge lawan aktif dari data existing (tanpa query tambahan).
                const foeActive = r.status !== 'waiting' && r.updatedAt && (nowTick - r.updatedAt < 30000);
                return (
                <div className="user-row" key={r.code}>
                  <span>
                    <span style={{ fontWeight: 800, letterSpacing: 2 }}>{r.code}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--body)' }}>
                      {r.status === 'waiting' ? `menunggu... ${fmtSisa(r.expiresAt)}` : `vs @${r.yourSide === 'player' ? r.p2Username : r.p1Username} — giliran ${r.turn === me?.id ? 'kamu' : 'lawan'}`}
                    </span>
                    {foeActive ? <span className="online-dot online" style={{ marginLeft: 8 }}>● lawan aktif</span> : null}
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
                            await fetchJson(`/api/battle/room?code=${encodeURIComponent(r.code)}`, { method: 'DELETE', ms: 12000 });
                          } catch { /* abaikan */ }
                          fetchLobby(roomPageRef.current, roomQRef.current, false, true);
                        }}
                      >
                        Batal
                      </button>
                    ) : null}
                  </span>
                </div>
                );
              })}
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
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button className="btn" type="submit" style={{ width: 'auto', padding: '0 20px' }}>
                  Cari
                </button>
              </form>
              {roomLoading && roomList.length === 0 ? <div style={{ fontSize: 13 }}>Memuat...</div> : null}
              {lobbyPaused ? (
                <div className="trade-fair" role="status" style={{ marginBottom: 8 }}>
                  Koneksi lobby lambat — auto-refresh dijeda 60 dtk.{' '}
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '4px 12px' }} onClick={retryLobbyNow}>
                    Coba sekarang
                  </button>
                </div>
              ) : null}
              {!roomLoading && !roomsInitLoading && roomList.length === 0 ? (
                <div style={{ fontSize: 13 }}>Belum ada battle ready.</div>
              ) : null}
              {roomsInitLoading && roomList.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Memuat battle aktif…</div>
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
                  {picked.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ width: 'auto', minHeight: 0, padding: '8px 14px' }}
                      onClick={() => {
                        setPicked([]);
                        setVanguard('');
                      }}
                      title="Kosongkan pilihan tim"
                    >
                      Ganti tim
                    </button>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Cari kartu..." value={pickQ} onChange={(e) => setPickQ(e.target.value)} aria-label="Cari kartu battle" />
                  <select className="select" style={{ width: 130, flexShrink: 0 }} value={pickTier} onChange={(e) => setPickTier(e.target.value)} aria-label="Filter tier">
                    {['All', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Common'].map((t) => (
                      <option key={t} value={t}>{t === 'All' ? 'Semua tier' : t}</option>
                    ))}
                  </select>
                </div>
                <div className="chip-row" style={{ marginBottom: 12 }} role="radiogroup" aria-label="Filter role">
                  {['All', 'Damage', 'Tank', 'Support', 'Assist'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={pickRole === r}
                      className={pickRole === r ? 'chip active' : 'chip'}
                      onClick={() => setPickRole(r)}
                    >
                      {r !== 'All' ? <span className={`role-dot dot-${r}`} aria-hidden="true" /> : null}
                      {r === 'All' ? 'Semua role' : r}
                    </button>
                  ))}
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
                {cardsLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Memuat kartumu… (halaman tetap bisa dipakai)</div>
                ) : null}
                {cardsError ? (
                  <div className="alert-error" style={{ marginBottom: 8 }}>
                    {cardsError}{' '}
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '4px 12px' }} onClick={retryBootstrap}>
                      Muat ulang
                    </button>
                  </div>
                ) : null}
                <div className="pick-grid" style={{ minHeight: 180 }}>
                  {visibleCards.map((c) => {
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
                            <div className="framed-art">
                              {c.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={optImg(c.imageUrl, 300)} alt={c.name} loading="lazy" decoding="async" />
                              ) : (
                                <div className="framed-blank" />
                              )}
                              <FrameOverlay tier={c.tier} />
                            </div>
                            <div className="card-meta">
                              <span className={`pick-role role-${c.stats?.role || 'Damage'}`}>{c.stats?.role || '-'}</span>
                              <div className="card-name">{c.name}</div>
                              <div className="card-anime">{c.tier}</div>
                            </div>
                          </div>
                          <div className="flip-back">
                            {c.stats ? (
                              <>
                                <span className={`flip-role role-${c.stats.role}`}>{c.stats.role}</span>
                                <div className="flip-stat">
                                  HP <b>{c.stats.hp}</b>
                                </div>
                                <div className="flip-stat">
                                  ATK <b className="fx-dmg">{c.stats.basic}</b>
                                </div>
                                <div className="flip-stat">{c.stats.skillName}</div>
                                <div className="flip-stat">
                                  Skill <b>{c.stats.skill}</b> / Cons <b>{c.stats.cons}</b>
                                </div>
                                <div className="flip-stat">
                                  Efek <b className={effectTone(c.stats.effect)}>{c.stats.effect}</b>
                                </div>
                              </>
                            ) : (
                              <div className="flip-stat" style={{ color: 'var(--muted)' }}>Stat belum tersedia.</div>
                            )}
                          </div>
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
                {hasMoreCards ? (
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', marginTop: 8 }} onClick={() => setVisibleCount((n) => n + 24)}>
                    Muat lagi ({visibleCards.length}/{filteredCards.length})
                  </button>
                ) : null}
                {!cardsLoading && filteredCards.length === 0 ? <div style={{ fontSize: 13, marginTop: 8 }}>Tidak ada kartu cocok. Ubah filter.</div> : null}
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
                {!cardsLoading && cards.length === 0 && !cardsError ? (
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

            <div style={{ height: 150 }} />
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
                loading="lazy"
                decoding="async"
              />
              <div className="trade-code-big">{st.code}</div>
              <div className="trade-hint">Bagikan kode ini ke lawan. Menunggu gabung... (hangus dalam 5 menit)</div>
              <button className="btn btn-ghost" onClick={() => refresh()}>
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
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={() => setSpeed((s) => (s === '2' ? '1' : '2'))} title="Kecepatan animasi battle" suppressHydrationWarning>
                      ⏩ {speed}x
                    </button>
                    {st.mode === 'ai' && !st.battle.over ? (
                      <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={() => setAutoBattle((v) => !v)} title="Mainkan giliranmu otomatis (vs AI)">
                        🤖 {autoBattle ? 'ON' : 'OFF'}
                      </button>
                    ) : null}
                    {!st.battle.over ? (
                      <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={() => setAskSurrender(true)}>
                        Menyerah
                      </button>
                    ) : null}
                    <button className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '6px 12px' }} onClick={() => refresh()}>
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

              <div ref={arenaRef} className={vibe ? `arena vibe-${vibe}` : 'arena'}>
              {foeBanner ? <div key={foeBanner.key} className="foe-banner" role="status">⚔ {foeBanner.text}</div> : null}
              <div className="card side-card side-foe" style={{ marginBottom: 16 }}>
                <div className="arena-side-title">
                  <span className="side-tag side-tag-foe">LAWAN</span>
                  {st.mode === 'ai' ? 'Lawan (AI)' : `@${mySide === 'player' ? st.p2Username : st.p1Username}`}
                  {st.turn !== me?.id && st.status === 'ongoing' && !st.battle.over ? (
                    <span className="turn-badge">Giliran lawan</span>
                  ) : null}
                  {st.mode === 'pvp' && !st.battle.over ? (
                    online.some((id) => String(id) !== String(me?.id))
                      ? <span className="online-dot online">● online</span>
                      : <span className="online-dot">○ offline</span>
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

              <div className="card side-card side-me" style={{ marginBottom: 16 }}>
                <div className="arena-side-title">
                  <span className="side-tag side-tag-me">KAMU</span>
                  Timmu
                  {myTurn ? <span className="turn-badge mine">Giliranmu</span> : null}
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
                      className={`${pending?.type === 'skill' ? 'btn armed' : 'btn'} ${toneForEffect(activeFighter?.effect)}`}
                      style={{ width: 'auto' }}
                      disabled={!canSkill}
                      onClick={() => armAction('skill')}
                      title={activeFighter ? (canSkill ? `${activeFighter.skillName} — ${activeFighter.cons} cons` : `Butuh ${activeFighter.cons} cons (kamu ${myTeam?.cons || 0})`) : ''}
                    >
                      Skill ({activeFighter?.cons} cons)
                    </button>
                    {hasSkill2 ? (
                      <button
                        className={`${pending?.type === 'skill2' ? 'btn armed' : 'btn'} ${toneForEffect(activeFighter?.effect2)}`}
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
                    {st.mode === 'pvp' && online.some((id) => String(id) !== String(me?.id))
                      ? 'Lawan sedang memilih…'
                      : 'Menunggu lawan... (menyerah otomatis bila 2 menit diam)'}
                  </div>
                ) : null}
              </div>
              </div>

              {st.status === 'finished' || st.battle.over ? (
                <div className={`card result-card ${iWon ? 'result-win' : 'result-lose'}`} ref={resultRef} style={{ marginBottom: 16 }}>
                  {iWon ? <div className="confetti" aria-hidden="true">{confetti}</div> : null}
                  <div className="section-title result-title">
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
                  {st.mode === 'pvp' ? (
                    rematchOffer?.code ? (
                      <div className="trade-fair ok" role="status" style={{ marginTop: 12 }}>
                        ⚔ @{rematchOffer.from || 'lawan'} menantang rematch! (kode {rematchOffer.code})
                        <div style={{ marginTop: 8 }}>
                          <button className="btn" style={{ width: 'auto' }} onClick={acceptRematch}>
                            Terima & Pilih Tim
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        style={{ marginTop: 8 }}
                        onClick={offerRematch}
                      >
                        🔁 Rematch
                      </button>
                    )
                  ) : null}
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
                    <div key={`${ev.t}-${i}`} style={logTone(ev)}>
                      <span style={{ color: 'var(--muted)', marginRight: 6 }}>#{ev.t}</span>{describeLog(ev)}
                    </div>
                  ))}
                  {(st.battle?.log || []).length === 0 ? <div style={{ color: 'var(--muted)' }}>Belum ada aksi.</div> : null}
                </div>
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
