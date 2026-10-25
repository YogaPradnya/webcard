'use client';

import { useEffect, useState } from 'react';
import { optImg, srcSetImg, IMG_SIZES_CARD } from '@/lib/images';

export function CountUp({ value }) {
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

export function HpBar({ hp, maxHp }) {
  const pct = Math.max(0, Math.round((hp / Math.max(1, maxHp)) * 100));
  const color = pct > 50 ? 'var(--role-heal)' : pct > 20 ? 'var(--link)' : 'var(--role-dmg)';
  // Bar putih ala fighting game: tertinggal 0,6 dtk di belakang damage (heal langsung snap).
  const [ghost, setGhost] = useState(pct);
  useEffect(() => {
    if (pct >= ghost) {
      setGhost(pct);
      return;
    }
    const t = setTimeout(() => setGhost(pct), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  return (
    <div style={{ position: 'relative', background: 'var(--hairline)', borderRadius: 9999, height: 6, overflow: 'hidden' }} className={pct <= 20 && hp > 0 ? 'hp-low' : ''}>
      <div className="hp-ghost" style={{ position: 'absolute', inset: 0, right: 'auto', width: `${ghost}%`, background: '#ffffff', opacity: 0.85, transition: 'width 0.3s' }} />
      <div style={{ position: 'absolute', inset: 0, right: 'auto', width: `${pct}%`, background: color, transition: 'width 0.5s' }} />
    </div>
  );
}

export function ConsPips({ value }) {
  const max = 20;
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>Cons {value}/{max}</span>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FighterCard({ f, active, art, fx, foe, onTap, tappable, selectTone, refCb, preview }) {
  const cls = ['fighter', active ? 'active' : '', !f.alive ? 'ko' : '', fx || '', selectTone || ''].filter(Boolean).join(' ');
  return (
    <div
      ref={refCb}
      className={cls}
      onClick={tappable ? onTap : undefined}
      style={tappable ? { cursor: 'pointer' } : undefined}
      title={f.name}
    >
      <div className="fighter-art">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="fighter-img" src={optImg(art, 200)} srcSet={srcSetImg(art)} sizes={IMG_SIZES_CARD} alt={f.name} loading="lazy" decoding="async" />
        ) : (
          <div className="fighter-img fighter-img-empty" aria-hidden="true" />
        )}
      </div>
      <div className="fighter-body">
        <div className="fighter-name">{f.name}</div>
        <div className="fighter-hp">
          {f.hp}/{f.maxHp}
        </div>
        <HpBar hp={f.hp} maxHp={f.maxHp} />
        <div className="status-row">
          {f.shield > 0 ? <span className="status-badge st-shield">SHD {f.shield}</span> : null}
          {f.burn ? <span className="status-badge st-burn">BURN</span> : null}
          {f.regen ? <span className="status-badge st-heal">REGEN</span> : null}
          {f.stun ? <span className="status-badge st-stun">STUN</span> : null}
          {f.silenced > 0 ? <span className="status-badge st-silence">SILENCE</span> : null}
          {f.weaken > 0 ? <span className="status-badge">WEAK</span> : null}
          {f.focus ? <span className="status-badge st-focus">FOKUS</span> : null}
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
      {f.alive && f.silenced > 0 ? <span className="fx-silence" aria-hidden="true">🔇</span> : null}
      {f.alive && f.regen ? <span className="fx-regen" aria-hidden="true">+{f.regen.amount || ''}</span> : null}
      {!f.alive ? <span className="ko-stamp">KO</span> : null}
    </div>
  );
}
