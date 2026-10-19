'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/fetchJson';
import { CS_HOURS, CS_EMAIL, CS_EMAIL_URL, CS_WHATSAPP, CS_WHATSAPP_URL } from '@/lib/contact';
import { LEGAL_LINKS } from '@/lib/legal';

const TNC_KEY = 'animein-tnc-ok';
const LOGIN_TOKEN_KEY = 'animein-login-token';

function newClientToken() {
  try {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

function readClientToken() {
  try {
    const t = sessionStorage.getItem(LOGIN_TOKEN_KEY) || '';
    return /^[a-f0-9]{64}$/i.test(t) ? t : '';
  } catch {
    return '';
  }
}

function writeClientToken(token) {
  try {
    if (token) sessionStorage.setItem(LOGIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(LOGIN_TOKEN_KEY);
  } catch { /* abaikan */ }
}

function loginHeaders() {
  const token = readClientToken();
  return token ? { 'X-Login-Token': token } : undefined;
}

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkingNow, setCheckingNow] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [tnc, setTnc] = useState(false);
  const pollTimer = useRef(null);
  const claimedRef = useRef(false);

  async function makeCode() {
    if (!tnc) {
      setError('Centang persetujuan Syarat & Ketentuan dulu.');
      return;
    }
    setError('');
    setStatusMsg('');
    setCode('');
    setCopied(false);
    setLoading(true);
    claimedRef.current = false;
    const clientToken = newClientToken();
    if (clientToken) writeClientToken(clientToken);
    try {
      const { ok, data } = await fetchJson('/api/auth/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tnc: true, ...(clientToken ? { clientToken } : {}) }),
      });
      if (!ok || !data.success) {
        setError(data.message || 'Gagal buat kode.');
        return;
      }
      setCode(data.code);
      setExpiresAt(data.expiresAt);
    } catch {
      setError('Tidak bisa menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    const text = `.login ${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select manual
      setError('Gagal salin otomatis. Salin manual: ' + text);
    }
  }

  function completeLogin() {
    if (claimedRef.current) return;
    claimedRef.current = true;
    writeClientToken('');
    router.replace('/book');
  }

  async function checkNow() {
    if (!code) return;
    setCheckingNow(true);
    setStatusMsg('');
    try {
      const { data } = await fetchJson('/api/auth/code/status', {
        ms: 10000,
        headers: loginHeaders(),
        cache: 'no-store',
      }).catch(() => ({ data: {} }));
      if (claimedRef.current) return;
      if (data.status === 'claimed') {
        completeLogin();
        return;
      }
      if (data.status === 'expired') {
        setCode('');
        setError('Kode kedaluwarsa. Buat kode baru.');
        return;
      }
      setStatusMsg(`Kode ${code} belum diklaim. Pastikan .login ${code} sudah terkirim ke bot Animein.`);
    } catch {
      setStatusMsg('Gagal cek status. Coba lagi.');
    } finally {
      setCheckingNow(false);
    }
  }

  useEffect(() => {
    // Muat status centang TnC + pulihkan kode yang belum diklaim
    // (cookie/token login tetap ada walau browser di-refresh).
    try {
      if (localStorage.getItem(TNC_KEY) === '1') setTnc(true);
    } catch { /* abaikan */ }
    (async () => {
      try {
        const { data } = await fetchJson('/api/auth/code/status', {
          ms: 10000,
          headers: loginHeaders(),
          cache: 'no-store',
        }).catch(() => ({ data: {} }));
        if (data.status === 'claimed') {
          completeLogin();
          return;
        }
        if (data.status === 'pending' && data.code) {
          setCode(data.code);
          setExpiresAt(data.expiresAt || 0);
        }
      } catch { /* abaikan: tampilkan tombol buat kode */ }
      finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onToggleTnc(v) {
    setTnc(v);
    try {
      if (v) localStorage.setItem(TNC_KEY, '1');
      else localStorage.removeItem(TNC_KEY);
    } catch { /* abaikan */ }
  }

  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let inFlight = false;

    // Poll rekursif: request berikutnya baru dijadwalkan SETELAH respons datang,
    // jadi tidak ada tumpukan request saat server lambat (dulu setInterval 2 dtk).
    const poll = async () => {
      if (stopped || inFlight || claimedRef.current) return;
      inFlight = true;
      try {
        const { data } = await fetchJson('/api/auth/code/status', {
          ms: 10000,
          headers: loginHeaders(),
          cache: 'no-store',
        }).catch(() => ({ data: {} }));
        if (stopped || claimedRef.current) return;
        if (data.status === 'claimed') {
          completeLogin();
          return;
        }
        if (data.status === 'expired') {
          setCode('');
          setError('Kode kedaluwarsa. Buat kode baru.');
          return;
        }
      } catch {
        // coba lagi setelah jeda berikut
      } finally {
        inFlight = false;
      }
      if (!stopped && !claimedRef.current) pollTimer.current = setTimeout(poll, 2000);
    };

    // Saat pengguna kembali dari chat bot ke browser, cek langsung.
    // Timer di tab background sering ditunda oleh browser mobile.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !claimedRef.current) {
        clearTimeout(pollTimer.current);
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    pollTimer.current = setTimeout(poll, 600);
    return () => {
      stopped = true;
      clearTimeout(pollTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="page deco-wrap" style={{ maxWidth: 420 }}>
      <span className="deco-cloud" style={{ top: 24, left: -8 }} aria-hidden="true" />
      <span className="deco-cloud" style={{ top: 64, right: -4, animationDelay: '1.2s' }} aria-hidden="true" />
      <span className="deco-fish" style={{ top: 150, left: -16 }} aria-hidden="true" />
      <span className="deco-fish" style={{ top: 210, right: -12, animationDelay: '2s' }} aria-hidden="true" />
      <div className="brand">
        <h1>Book Kartu Animein</h1>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--body)', marginBottom: 20 }}>
          Tekan tombol di bawah untuk dapat kode, lalu ketik <strong>.login KODE</strong> di
          chat Animein dari akunmu. Tanpa password.
        </p>
        {error ? <div className="alert-error">{error}</div> : null}
        {checking ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Memeriksa sesi...</div>
        ) : !code ? (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--body)', marginBottom: 16, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={tnc}
                onChange={(e) => onToggleTnc(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--link)' }}
              />
              <span>
                Saya menyetujui{' '}
                <Link href="/terms" style={{ color: 'var(--link)', textDecoration: 'underline' }}>
                  Syarat & Ketentuan
                </Link>{' '}
                dan{' '}
                <Link href="/privacy" style={{ color: 'var(--link)', textDecoration: 'underline' }}>
                  Kebijakan Privasi
                </Link>{' '}
                Animein.
              </span>
            </label>
            <button className="btn" onClick={makeCode} disabled={loading || !tnc}>
              {loading ? 'Membuat...' : 'Dapatkan Kode'}
            </button>
          </>
        ) : (
          <div>
            <div className="trade-code-big">{code}</div>
            <div className="trade-hint">
              {statusMsg || `Ketik .login ${code} di chat. Menunggu klaim...`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={copyCode} type="button" style={{ flex: 1 }}>
                {copied ? 'Tersalin!' : 'Salin .login'}
              </button>
              <button className="btn btn-ghost" onClick={makeCode} disabled={loading} type="button" style={{ flex: 1 }}>
                Kode Baru
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 8 }}
              onClick={checkNow}
              disabled={checkingNow}
            >
              {checkingNow ? 'Memeriksa...' : 'Sudah kirim .login? Cek status'}
            </button>
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} style={{ color: 'var(--link)', textDecoration: 'underline', fontWeight: 700 }}>
              {link.label}
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          CS: <a href={CS_EMAIL_URL} style={{ color: 'var(--link)' }}>{CS_EMAIL}</a>
          {' • '}
          <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)' }}>WhatsApp {CS_WHATSAPP}</a>
          {' • '}
          {CS_HOURS}
        </div>
      </div>
    </div>
  );
}
