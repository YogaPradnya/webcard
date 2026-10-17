/* Maskot "Rara": karakter kartu neo-brutalist (garis tebal, 2 warna + lime).
   Dipakai di empty state / 404. SVG inline, tanpa aset eksternal.
   Ganti isi SVG kapan saja kalau mau desain lain — kontrak props tetap. */
export default function Rara({ size = 96, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* bayangan */}
      <ellipse cx="48" cy="87" rx="23" ry="4.5" fill="#0a0a0a" opacity="0.12" />
      {/* badan kartu */}
      <rect x="27" y="15" width="42" height="66" rx="9" fill="#fffff6" stroke="#0a0a0a" strokeWidth="3" />
      {/* tangan mungil melambai */}
      <circle cx="17" cy="48" r="5.5" fill="#fffff6" stroke="#0a0a0a" strokeWidth="3" />
      <circle cx="79" cy="42" r="5.5" fill="#fffff6" stroke="#0a0a0a" strokeWidth="3" />
      {/* wajah */}
      <circle cx="41" cy="41" r="2.7" fill="#0a0a0a" />
      <circle cx="55" cy="41" r="2.7" fill="#0a0a0a" />
      <path d="M42 50c2.2 2.7 9.8 2.7 12 0" stroke="#0a0a0a" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="33.5" cy="48" r="3.2" fill="#ffb3c7" />
      <circle cx="62.5" cy="48" r="3.2" fill="#ffb3c7" />
      {/* baris "deskripsi" di kartu */}
      <path d="M37 64h22M37 70h14" stroke="#0a0a0a" strokeWidth="2.4" strokeLinecap="round" opacity="0.22" />
      {/* kilau lime di pojok */}
      <path d="M74 13l2.3 6.4 6.4 2.3-6.4 2.3L74 30.4l-2.3-6.4-6.4-2.3 6.4-2.3z" fill="#a3e636" stroke="#0a0a0a" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}
