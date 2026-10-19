import Link from 'next/link';
import { LEGAL_LINKS } from '@/lib/legal';

export default function LegalNav({ active = '' }) {
  return (
    <nav className="legal-nav" aria-label="Dokumen legal">
      {LEGAL_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`legal-nav-link${active === link.href ? ' active' : ''}`}
          aria-current={active === link.href ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
