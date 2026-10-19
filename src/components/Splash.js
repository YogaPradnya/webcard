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
        <img src="/icon-192.png" alt="" width={56} height={56} />
        <div className="splash-title">Book Kartu Animein</div>
        <span className="splash-bar"><i /></span>
      </div>
    </div>
  );
}
