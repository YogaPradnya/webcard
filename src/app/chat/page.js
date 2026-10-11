'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

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
  const boxRef = useRef(null);
  const lastIdRef = useRef(0);
  const stickRef = useRef(true);

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
        const res = await fetch('/api/chat?limit=30');
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          setMessages(data.messages || []);
          const last = (data.messages || []).at(-1);
          if (last) lastIdRef.current = last.id;
        }
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
    const t = setInterval(async () => {
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
        // abaikan
      }
    }, 3000);
    return () => clearInterval(t);
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
        body: JSON.stringify({ message: text.slice(0, 500) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal kirim.');
        return;
      }
      setInput('');
      stickRef.current = true;
      if (data.message) {
        setMessages((prev) => [...prev, data.message].slice(-200));
        lastIdRef.current = Math.max(lastIdRef.current, data.message.id || 0);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="layout">
        <Sidebar username={me?.username} />
        <div className="layout-main">
          <div className="page">
            <div className="card">Memuat chat...</div>
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
            <h1>Grup Chat</h1>
          </div>
          {error ? <div className="alert-error">{error}</div> : null}
          <div className="card wa-card">
            <div className="wa-header">
              <div className="wa-avatar" style={{ background: avatarColor('Grup') }}>A</div>
              <div>
                <div className="wa-title">Grup Animein</div>
                <div className="wa-sub">@{me?.username || ''} • online</div>
              </div>
            </div>
            <div className="wa-box" ref={boxRef} onScroll={onScroll}>
              {messages.length === 0 ? (
                <div className="wa-empty">Belum ada pesan. Jadilah yang pertama menyapa!</div>
              ) : null}
              {messages.map((m) => (
                <div key={m.id} className={m.isMine ? 'wa-row mine' : 'wa-row'}>
                  {!m.isMine ? (
                    <div className="wa-mini-avatar" style={{ background: avatarColor(m.username) }}>
                      {String(m.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                  ) : null}
                  <div className={m.isMine ? 'wa-bubble mine' : 'wa-bubble'}>
                    {!m.isMine ? <div className="wa-name">@{m.username}</div> : null}
                    <div className="wa-text">{m.message}</div>
                    <div className="wa-time">{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
            <form className="wa-inputbar" onSubmit={onSend}>
              <input
                className="input"
                placeholder="Ketik pesan..."
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn" type="submit" disabled={!input.trim() || sending} style={{ width: 'auto', padding: '0 20px' }}>
                Kirim
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
