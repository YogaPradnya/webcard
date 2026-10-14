'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { PageSkeleton } from '@/components/PageState';
import ConfirmModal from '@/components/ConfirmModal';

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function avatarColor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 60% 45%)`;
}

export default function ChatPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState([]);
  const [reply, setReply] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const boxRef = useRef(null);
  const lastIdRef = useRef(0);
  const stickRef = useRef(true);
  const failCount = useRef(0);
  const pressTimer = useRef(null);

  function startPress(m) {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setReply(m);
      try { navigator.vibrate?.(20); } catch { /* abaikan */ }
    }, 500);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

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
        const [chatRes, onRes] = await Promise.all([
          fetch('/api/chat?limit=30'),
          fetch('/api/chat/online'),
        ]);
        const data = await chatRes.json().catch(() => ({}));
        if (data.success) {
          setMessages(data.messages || []);
          const last = (data.messages || []).at(-1);
          if (last) lastIdRef.current = last.id;
        }
        const onData = await onRes.json().catch(() => ({}));
        if (onData.success) setOnline(onData.online || []);
      } catch {
        setError('Tidak bisa menghubungi server.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (loading) return;
    let alive = true;
    const tick = async () => {
      if (!alive || document.hidden) return;
      try {
        const res = await fetch(`/api/chat?afterId=${lastIdRef.current}&limit=50`);
        const data = await res.json().catch(() => ({}));
        if (data.success && data.messages?.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const add = data.messages.filter((m) => !seen.has(m.id));
            return [...prev, ...add].slice(-200);
          });
          lastIdRef.current = data.messages.at(-1).id;
          failCount.current = 0;
        }
        // online setiap ~15 detik
        if (Math.random() < 0.2) {
          const onRes = await fetch('/api/chat/online');
          const onData = await onRes.json().catch(() => ({}));
          if (alive && onData.success) setOnline(onData.online || []);
        }
      } catch {
        failCount.current += 1;
      }
    };
    const base = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(base); };
  }, [loading]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function onSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.slice(0, 500), replyToId: reply?.id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal kirim.');
        return;
      }
      setInput('');
      setReply(null);
      stickRef.current = true;
      if (data.message) {
        setMessages((prev) => [...prev, data.message].slice(-200));
        lastIdRef.current = Math.max(lastIdRef.current, data.message.id || 0);
      }
    } finally {
      setSending(false);
    }
  }

  async function doDelete() {
    if (!delTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chat/delete?id=${delTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal hapus pesan.');
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== delTarget.id));
    } finally {
      setDeleting(false);
      setDelTarget(null);
    }
  }

  async function retry() {    setError('');
    try {
      const res = await fetch(`/api/chat?afterId=${lastIdRef.current}&limit=50`);
      const data = await res.json().catch(() => ({}));
      if (data.success && data.messages?.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const add = data.messages.filter((m) => !seen.has(m.id));
          return [...prev, ...add].slice(-200);
        });
        lastIdRef.current = data.messages.at(-1).id;
      }
    } catch {
      setError('Tidak bisa menghubungi server.');
    }
  }

  if (loading) {
    return <PageSkeleton username={me?.username} title="Chat Global" lines={[40, 90, 70]} />;
  }

  return (
    <div className="layout">
      <Sidebar username={me?.username} />
      <div className="layout-main">
        <div className="page">
          <div className="brand">
            <h1>Chat Global</h1>
          </div>
          {error ? (
            <div className="alert-error">
              {error}{' '}
              <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '4px 12px' }} onClick={retry}>
                Coba lagi
              </button>
            </div>
          ) : null}
          <div className="card wa-card">
            <div className="wa-header">
              <div className="wa-avatar" style={{ background: avatarColor('Grup') }}>A</div>
              <div>
                <div className="wa-title">Grup Animein</div>
                <div className="wa-sub">@{me?.username || ''} • {online.length > 0 ? `${online.length} online: ${online.slice(0, 3).join(', ')}${online.length > 3 ? '...' : ''}` : 'online'}</div>
              </div>
            </div>
            <div className="wa-box" ref={boxRef} onScroll={onScroll}>
              {messages.length === 0 ? (
                <div className="wa-empty">Belum ada pesan. Jadilah yang pertama menyapa!</div>
              ) : null}
              <div className="wa-hint">Tahan lama chat untuk balas.</div>
              {messages.map((m) => (
                <div key={m.id} className={m.isMine ? 'wa-row mine' : 'wa-row'}>
                  <div className="wa-mini-avatar" style={{ background: avatarColor(m.username) }}>
                    {String(m.username || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div
                    className="wa-bubble"
                    onContextMenu={(e) => { e.preventDefault(); setReply(m); }}
                    onTouchStart={() => startPress(m)}
                    onTouchEnd={cancelPress}
                    onTouchMove={cancelPress}
                    onDoubleClick={() => setReply(m)}
                    title="Tahan untuk balas"
                  >
                    <div className="wa-namerow">
                      <span className="wa-name">
                        {m.username}
                        {m.title ? (
                          <span className="wa-title-pill">
                            {m.titleIcon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.titleIcon} alt="" width={14} height={14} className="wa-title-ico" loading="lazy" decoding="async" />
                            ) : null}
                            {m.title}
                          </span>
                        ) : null}
                      </span>
                      <span className="wa-time">
                        {fmtTime(m.createdAt)}
                        {m.isMine ? (
                          <button type="button" className="wa-del" onClick={(e) => { e.stopPropagation(); setDelTarget(m); }}>
                            hapus
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {m.replyUsername ? (
                      <div className="wa-quote">
                        <b>@{m.replyUsername}</b>
                        <span>{String(m.replyMessage || '').slice(0, 120)}</span>
                      </div>
                    ) : null}
                    <div className="wa-text">{m.message}</div>
                  </div>
                </div>
              ))}
            </div>
            {reply ? (
              <div className="wa-replybar">
                <span>Membalas <b>@{reply.username}</b>: {String(reply.message).slice(0, 80)}</span>
                <button type="button" className="btn btn-ghost" style={{ width: 'auto', minHeight: 0, padding: '4px 10px' }} onClick={() => setReply(null)}>
                  Batal
                </button>
              </div>
            ) : null}
            <form className="wa-inputbar" onSubmit={onSend}>
              <input
                className="input"
                placeholder="Ketik pesan..."
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Ketik pesan"
              />
              <button className="btn wa-sendbtn" type="submit" disabled={!input.trim() || sending} aria-label="Kirim">
                ➤
              </button>
            </form>
          </div>
          {delTarget ? (
            <ConfirmModal
              title="Hapus pesan?"
              message={`"${String(delTarget.message).slice(0, 100)}"`}
              confirmLabel="Hapus"
              busy={deleting}
              onCancel={() => setDelTarget(null)}
              onConfirm={doDelete}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
