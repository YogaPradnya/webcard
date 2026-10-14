'use client';

function MissionRow({ m, period, claiming, onClaim }) {
  const pct = Math.min(100, Math.round((m.count / Math.max(1, m.target)) * 100));
  return (
    <div className="user-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700 }}>{m.claimed ? '✅' : m.done ? '🎉' : '📌'} {m.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {m.count}/{m.target} • +{m.xp} XP
        </span>
      </div>
      <div className="progress-bar" style={{ width: '100%' }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {m.canClaim ? (
        <button
          type="button"
          className="btn"
          style={{ width: 'auto', minHeight: 0, padding: '6px 16px', fontSize: 12 }}
          disabled={claiming === `${period}:${m.id}`}
          onClick={() => onClaim(period, m.id)}
        >
          {claiming === `${period}:${m.id}` ? '...' : `Klaim +${m.xp} XP`}
        </button>
      ) : m.claimed ? (
        <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 800 }}>Sudah diklaim ✓</div>
      ) : null}
    </div>
  );
}

export default function MissionList({ items, period, claiming, onClaim }) {
  return (
    <>
      {(items || []).map((m) => (
        <MissionRow key={m.id} m={m} period={period} claiming={claiming} onClaim={onClaim} />
      ))}
    </>
  );
}
