import LegalNav from './LegalNav';
import PublicShell from './PublicShell';

export default function LegalPage({ title, updated, intro, active, children }) {
  return (
    <PublicShell>
      <div className="public-page legal-page">
        <div className="brand">
          <h1>{title}</h1>
        </div>

        <div className="card legal-intro">
          <div className="legal-updated">Terakhir diperbarui: {updated}</div>
          <div className="legal-intro-text">{intro}</div>
        </div>

        <LegalNav active={active} />
        <div className="legal-sections">{children}</div>
      </div>
    </PublicShell>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section className="card legal-section">
      <h2 className="section-title">{title}</h2>
      <div className="legal-body">{children}</div>
    </section>
  );
}
