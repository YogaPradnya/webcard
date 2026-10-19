'use client';

/*
 * Transisi masuk antar halaman.
 * Sengaja hanya animasi opacity: konten halaman memuat bottomnav
 * (position: fixed), jadi jangan pakai transform/translate/filter di wrapper
 * ini karena akan merusak posisi fixed tersebut.
 */
export default function Template({ children }) {
  return <div className="route-fade">{children}</div>;
}
