'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CS_HOURS, CS_EMAIL, CS_EMAIL_URL, CS_WHATSAPP, CS_WHATSAPP_URL } from '@/lib/contact';
import { LEGAL_LINKS } from '@/lib/legal';

const TNC_KEY = 'kartuyogaa-tnc-ok';
const LOGIN_TIMEOUT_MS = 30000;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tnc, setTnc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      if (localStorage.getItem(TNC_KEY) === '1') setTnc(true);
    } catch { /* abaikan */ }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok && !cancelled) router.replace('/book');
      } catch { /* belum login / server sibuk */ }
    })();
    return () => { cancelled = true; };
  }, [router]);

  function onToggleTnc(v) {
    setTnc(v);
    try {
      if (v) localStorage.setItem(TNC_KEY, '1');
      else localStorage.removeItem(TNC_KEY);
    } catch { /* abaikan */ }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!tnc) {
      setError('Centang persetujuan Syarat & Ketentuan dulu.');
      return;
    }
    setError('');
    setLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, tnc: true }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || 'Login gagal. Coba lagi.');
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
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <div className="page deco-wrap" style={{ maxWidth: 420 }}>
      <span className="deco-cloud" style={{ top: 24, left: -8 }} aria-hidden="true" />
      <span className="deco-cloud" style={{ top: 64, right: -4, animationDelay: '1.2s' }} aria-hidden="true" />
      <span className="deco-fish" style={{ top: 150, left: -16 }} aria-hidden="true" />
      <span className="deco-fish" style={{ top: 210, right: -12, animationDelay: '2s' }} aria-hidden="true" />
      <div className="brand login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-brand-logo" src="/logo.png" alt="" width={245} height={275} />
        <h1 className="visually-hidden">KartuYogaa</h1>
      </div>
      <div className="card">
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
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Memeriksa akun...' : 'Masuk'}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 14 }}>
          Belum terdaftar? Gunakan akun yang sudah pernah berinteraksi dengan
          bot terlebih dahulu.
        </p>
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
