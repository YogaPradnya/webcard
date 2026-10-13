'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const pollTimer = useRef(null);

  async function makeCode() {
    setError('');
    setCode('');
    setCopied(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
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

  useEffect(() => {
    if (!code) return;
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/code/status');
        const data = await res.json().catch(() => ({}));
        if (data.status === 'claimed') {
          clearInterval(pollTimer.current);
          router.push('/book');
        } else if (data.status === 'expired') {
          clearInterval(pollTimer.current);
          setCode('');
          setError('Kode kedaluwarsa. Buat kode baru.');
        }
      } catch {
        // coba lagi interval berikut
      }
    }, 2000);
    return () => clearInterval(pollTimer.current);
  }, [code, router]);

  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <div className="brand">
        <h1>Book Kartu Animein</h1>
      </div>
      <div className="card">
        <p style={{ fontSize: 13, color: 'var(--body)', marginBottom: 20 }}>
          Tekan tombol di bawah untuk dapat kode, lalu ketik <strong>.login KODE</strong> di
          chat Animein dari akunmu. Tanpa password.
        </p>
        {error ? <div className="alert-error">{error}</div> : null}
        {!code ? (
          <button className="btn" onClick={makeCode} disabled={loading}>
            {loading ? 'Membuat...' : 'Dapatkan Kode'}
          </button>
        ) : (
          <div>
            <div className="trade-code-big">{code}</div>
            <div className="trade-hint">Ketik .login {code} di chat. Menunggu klaim...</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={copyCode} type="button" style={{ flex: 1 }}>
                {copied ? 'Tersalin!' : 'Salin .login'}
              </button>
              <button className="btn btn-ghost" onClick={makeCode} disabled={loading} type="button" style={{ flex: 1 }}>
                Kode Baru
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
        Dengan masuk, Anda menyetujui{' '}
        <a href="/terms" style={{ color: 'var(--link)', textDecoration: 'underline' }}>
          Syarat & Ketentuan
        </a>{' '}
        Animein.
      </div>
    </div>
  );
}
