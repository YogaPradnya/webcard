import { SITE_NAME } from '@/lib/site';

/*
 * Splash pembuka saat pertama buka web.
 * Murni CSS: auto-fade ±0.65 dtk lalu hilang sendiri (tetap hilang walau JS
 * gagal), pointer-events: none supaya tidak menghalangi klik.
 */
export default function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" width={64} height={46} />
        <div className="splash-title">{SITE_NAME}</div>
        <span className="splash-bar"><i /></span>
      </div>
    </div>
  );
}
