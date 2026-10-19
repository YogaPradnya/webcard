import Link from 'next/link';
import { LEGAL_LINKS } from '@/lib/legal';
import {
  CS_EMAIL,
  CS_EMAIL_URL,
  CS_HOURS,
  CS_WHATSAPP,
  CS_WHATSAPP_URL,
} from '@/lib/contact';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="site-footer-title">{SITE_NAME}</div>
          <p>{SITE_DESCRIPTION}</p>
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Dokumen Legal</div>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </div>

        <div className="site-footer-col">
          <div className="site-footer-heading">Bantuan</div>
          <a href={CS_EMAIL_URL}>{CS_EMAIL}</a>
          <a href={CS_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            WhatsApp {CS_WHATSAPP}
          </a>
          <span className="site-footer-note">{CS_HOURS}</span>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} {SITE_NAME}. Hak cipta dilindungi undang-undang.</span>
        <span>Seluruh produk bersifat digital, tanpa pengiriman fisik.</span>
      </div>
    </footer>
  );
}
