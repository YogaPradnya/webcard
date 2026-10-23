'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/fetchJson';
import { CS_HOURS, CS_EMAIL, CS_EMAIL_URL, CS_WHATSAPP, CS_WHATSAPP_URL } from '@/lib/contact';
import { LEGAL_LINKS } from '@/lib/legal';

const TNC_KEY = 'kartuyogaa-tnc-ok';
const LOGIN_TOKEN_KEY = 'kartuyogaa-login-token';
const LOGIN_TIMEOUT_MS = 30000;
const CODE_POLL_MS = 2000;

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

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tnc, setTnc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeStatus, setCodeStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkingCode, setCheckingCode] = useState(true);
  const [checkingNow, setCheckingNow] = useState(false);
  const claimedRef = useRef(false);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;

  function completeLogin() {
    if (claimedRef.current) return;
    claimedRef.current = true;
    writeClientToken('');
    setCode('');
    setExpiresAt(0);
    router.replace('/book');
  }

  function clearCode(message) {
    writeClientToken('');
    setCode('');
    setExpiresAt(0);
    setCopied(false);
    setCodeError(message);
    setCodeStatus('');
  }

  useEffect(() => {
    try {
      if (localStorage.getItem(TNC_KEY) === '1') setTnc(true);
    } catch { /* abaikan */ }

    let cancelled = false;
    (async () => {
      try {
        const { ok, data } = await fetchJson('/api/auth/me', { ms: 10000, cache: 'no-store' });
        if (!cancelled && ok && data?.success) {
          router.replace('/book');
          return;
        }
      } catch { /* belum login / server sibuk */ }

      try {
        const { data } = await fetchJson('/api/auth/code/status', {
          ms: 10000,
          headers: loginHeaders(),
          cache: 'no-store',
        }).catch(() => ({ data: {} }));
        if (cancelled) return;
        if (data?.status === 'claimed') {
          completeLogin();
          return;
        }
        if (data?.status === 'pending' && data.code) {
          setCode(String(data.code));
          setExpiresAt(Number(data.expiresAt) || 0);
          setNow(Date.now());
          setMode('code');
          return;
        }
        if (data?.status === 'unregistered') {
          setMode('code');
          setCodeError('Akun bot ini belum terdaftar. Ketik .daftar di chat, lalu buat kode baru.');
        }
      } catch { /* abaikan: tampilkan tombol buat kode */ }
      finally {
        if (!cancelled) setCheckingCode(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!code || !expiresAt) return;
    const tick = () => {
      if (Date.now() >= expiresAt) {
        setCode('');
        setExpiresAt(0);
        setCodeError('Kode kedaluwarsa. Buat kode baru.');
        setCodeStatus('');
        return;
      }
      setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [code, expiresAt]);

  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let inFlight = false;
    let pollTimer = null;

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
        if (data?.status === 'claimed') {
          completeLogin();
          return;
        }
        if (data?.status === 'expired') {
          clearCode('Kode kedaluwarsa. Buat kode baru.');
          return;
        }
        if (data?.status === 'unregistered') {
          clearCode('Akun bot ini belum terdaftar. Ketik .daftar di chat, lalu buat kode baru.');
          return;
        }
      } catch {
        // coba lagi setelah jeda berikut
      } finally {
        inFlight = false;
      }
      if (!stopped && !claimedRef.current) pollTimer = setTimeout(poll, CODE_POLL_MS);
    };

    // Saat pengguna kembali dari chat bot ke browser, cek langsung.
    // Timer di tab background sering ditunda oleh browser mobile.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !claimedRef.current) {
        clearTimeout(pollTimer);
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    pollTimer = setTimeout(poll, 600);
    return () => {
      stopped = true;
      clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function onToggleTnc(v) {
    setTnc(v);
    try {
      if (v) localStorage.setItem(TNC_KEY, '1');
      else localStorage.removeItem(TNC_KEY);
    } catch { /* abaikan */ }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setCodeError('');
    setCodeStatus('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!tnc) {
      setError('Centang persetujuan Syarat & Ketentuan dulu.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, tnc: true }),
        ms: LOGIN_TIMEOUT_MS,
        cache: 'no-store',
      });
      if (!ok || !data?.success) {
        setError(data?.message || 'Login gagal. Coba lagi.');
        return;
      }
      router.replace(data.redirect || '/book');
    } catch (err) {
      setError(
        err?.name === 'AbortError'
          ? 'Server terlalu lama merespons. Coba lagi beberapa saat lagi.'
          : 'Tidak bisa menghubungi server.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function makeCode() {
    if (!tnc) {
      setCodeError('Centang persetujuan Syarat & Ketentuan dulu.');
      return;
    }
    setCodeError('');
    setCodeStatus('');
    setCode('');
    setExpiresAt(0);
    setCopied(false);
    setCodeLoading(true);
    claimedRef.current = false;

    const clientToken = newClientToken();
    if (clientToken) writeClientToken(clientToken);

    try {
      const { ok, data } = await fetchJson('/api/auth/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tnc: true, ...(clientToken ? { clientToken } : {}) }),
        ms: LOGIN_TIMEOUT_MS,
        cache: 'no-store',
      });
      if (!ok || !data?.success) {
        setCodeError(data?.message || 'Gagal buat kode.');
        return;
      }
      setCode(String(data.code || ''));
      setExpiresAt(Number(data.expiresAt) || 0);
      setNow(Date.now());
      setMode('code');
    } catch {
      setCodeError('Tidak bisa menghubungi server.');
    } finally {
      setCodeLoading(false);
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
      setCodeError('Gagal salin otomatis. Salin manual: ' + text);
    }
  }

  async function checkNow() {
    if (!code) return;
    setCheckingNow(true);
    setCodeStatus('');
    try {
      const { data } = await fetchJson('/api/auth/code/status', {
        ms: 10000,
        headers: loginHeaders(),
        cache: 'no-store',
      }).catch(() => ({ data: {} }));
      if (claimedRef.current) return;
      if (data?.status === 'claimed') {
        completeLogin();
        return;
      }
      if (data?.status === 'expired') {
        clearCode('Kode kedaluwarsa. Buat kode baru.');
        return;
      }
      if (data?.status === 'unregistered') {
        clearCode('Akun bot ini belum terdaftar. Ketik .daftar di chat, lalu buat kode baru.');
        return;
      }
      setCodeStatus(`Kode ${code} belum diklaim. Kirim .login ${code} ke bot.`);
    } catch {
      setCodeStatus('Gagal cek status. Coba lagi.');
    } finally {
      setCheckingNow(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="brand login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-brand-logo" src="/logo.png" alt="" width={245} height={275} />
        <h1 className="visually-hidden">KartuYogaa</h1>
      </div>
      <div className="card">
        <div className="login-tabs" role="tablist" aria-label="Metode login">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'password'}
            className={`login-tab${mode === 'password' ? ' active' : ''}`}
            onClick={() => switchMode('password')}
          >
            Username & Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'code'}
            className={`login-tab${mode === 'code' ? ' active' : ''}`}
            onClick={() => switchMode('code')}
          >
            Kode Login
          </button>
        </div>

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
            KartuYogaa.
          </span>
        </label>

        {mode === 'password' ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--body)', marginBottom: 20 }}>
              Masuk dengan akun yang sudah terdaftar di KartuYogaa. Password hanya
              dipakai untuk verifikasi dan tidak disimpan. Jangan pernah mengirim
              password lewat chat atau ke CS.
            </p>
            {error ? <div className="alert-error" role="alert">{error}</div> : null}
            <form onSubmit={onSubmit}>
              <div className="field">
                <label className="label" htmlFor="login-username">Username atau Email</label>
                <input
                  id="login-username"
                  className="input"
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={200}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="login-password">Password</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="login-password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    maxLength={256}
                    style={{ minWidth: 0 }}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', minWidth: 74, padding: '10px 12px' }}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? 'Tutup' : 'Lihat'}
                  </button>
                </div>
              </div>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Memeriksa akun...' : 'Masuk'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--body)', marginBottom: 20 }}>
              Buat kode di web, lalu kirim <strong>.login KODE</strong> ke bot
              Animein dari akun yang sudah <strong>.daftar</strong>. Kode berlaku
              5 menit dan sekali pakai.
            </p>
            {codeError ? <div className="alert-error" role="alert">{codeError}</div> : null}
            {checkingCode && !code ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Memeriksa kode...</div>
            ) : !code ? (
              <button className="btn" type="button" onClick={makeCode} disabled={codeLoading}>
                {codeLoading ? 'Membuat...' : 'Dapatkan Kode'}
              </button>
            ) : (
              <div>
                <div className="trade-code-big">{code}</div>
                <div className="trade-hint">
                  {codeStatus || `Kirim .login ${code} ke bot. Menunggu klaim...`}
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  Sisa waktu: {formatRemaining(remainingMs)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="button" onClick={copyCode} style={{ flex: 1 }}>
                    {copied ? 'Tersalin!' : 'Salin .login'}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={makeCode} disabled={codeLoading} style={{ flex: 1 }}>
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
          </>
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
