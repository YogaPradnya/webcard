'use client';

// Modal konfirmasi custom (pengganti confirm() native agar konsisten di mobile).
export default function ConfirmModal({ title, message, confirmLabel = 'Ya', busy = false, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">{title}</div>
        <div style={{ fontSize: 13, color: 'var(--body)', marginBottom: 16 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={onCancel}>
            Batal
          </button>
          <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={onConfirm}>
            {busy ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
