'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ConfirmModal from '@/components/ConfirmModal';

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
        <img className="fighter-img" src={art} alt={f.name} loading="lazy" decoding="async" />
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

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
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

  // Chat battle sementara
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatAfter = useRef(0);
  const chatBoxRef = useRef(null);

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
            applyState(first);
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
    }, 5000);
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
    if (!st?.code || st.status === 'finished') return;
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
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.code, st?.status]);

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
    const data = await api('/api/battle/room', { mode: 'ai', team: orderedTeam(), difficulty });
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
    try { localStorage.setItem(MY_ROOM_KEY, data.state.code); } catch { /* abaikan */ }
    fetchMine();
  }

  async function joinPvp(e) {
    e.preventDefault();
    setError('');
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
    try { localStorage.setItem(MY_ROOM_KEY, data.state.code); } catch { /* abaikan */ }
    setRoomList((prev) => prev.filter((r) => r.code !== data.state.code));
  }

  function clearMyRoom() {
    try { localStorage.removeItem(MY_ROOM_KEY); } catch { /* abaikan */ }
  }

  async function cancelRoom() {
    if (!st) return;
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
    setChatMsgs([]);
    chatAfter.current = 0;
    fetchMine();
    fetchRooms(roomPage, roomQ);
    fetchHistory();
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
    if (!st || st.status === 'finished') return;
    const waiting = st.status === 'waiting';
    const myTurn = st.turn === me?.id;
    if (!waiting && myTurn) return;
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 2500);
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
  const hasSkill2 = Boolean(activeFighter?.skill2Name) && (activeFighter?.skill2 || 0) > 0;
  const canSkill2 = activeFighter && myTeam && activeFighter.alive && hasSkill2 && myTeam.cons >= (activeFighter.cons2 ?? 99);
  const fLeft = forfeitLeft();

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

  const filteredCards = cards.filter((c) => {
    if (pickRole !== 'All' && c.stats?.role !== pickRole) return false;
    if (pickTier !== 'All' && c.tier !== pickTier) return false;
    if (pickQ.trim() && !`${c.name} ${c.tier}`.toLowerCase().includes(pickQ.trim().toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">
              <div className="skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton-line" style={{ width: '80%' }} />
            </div>
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
                </div>
                <div className="section-title">Pilih 3 kartumu</div>
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
                              <img className="card-art" src={c.imageUrl} alt={c.name} loading="lazy" decoding="async" />
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
                    {hasSkill2 ? (
                      <button
                        className="btn"
                        style={{ width: 'auto' }}
                        disabled={!canSkill2}
                        onClick={() => doAct({ type: 'skill2' })}
                        title={activeFighter ? `${activeFighter.skill2Name} - ${activeFighter.cons2} cons (★5)` : ''}
                      >
                        Skill2 ({activeFighter?.cons2} cons)
                      </button>
                    ) : null}
                    <div style={{ width: '100%', fontSize: 11, color: 'var(--body)' }}>
                      Ketuk kartu cadanganmu untuk ganti (1 giliran).
                    </div>
                  </div>
                ) : null}
                {st.turn && !myTurn && st.status === 'ongoing' && !st.battle.over ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--body)' }}>
                    Menunggu lawan... (menyerah otomatis bila 2 menit diam)
                  </div>
                ) : null}
              </div>

              {st.status === 'finished' || st.battle.over ? (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-title">
                    {String(st.winner) === String(me?.id) ? 'Menang!' : st.winner === 'AI' && st.mode === 'ai' ? 'Kalah' : 'Kalah'}
                    {st.result?.reason ? <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>({st.result.reason})</span> : null}
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
                    onClick={exitBattle}
                  >
                    Main Lagi
                  </button>
                </div>
              ) : null}

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
        </div>
      </div>
    </div>
  );
}
