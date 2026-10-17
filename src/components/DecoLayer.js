/* Lapisan hiasan global: bentuk hiasan statis + washi tape + tema musiman.
   SENGAJA tanpa animasi (bob/fall dihapus) agar tidak membebani render.
   Murni dekoratif (aria-hidden, pointer-events:none) dan posisinya di belakang
   konten via z-index di deco.css. Musim diatur script kecil di layout.js
   lewat atribut [data-season] di <html>. Animasi awan/ikan khusus halaman
   login ada di components.css (decoFloat/decoSwim) — tidak terpengaruh. */
export default function DecoLayer() {
  return (
    <div className="deco-layer" aria-hidden="true">
      {/* Bentuk dasar (tampil di semua musim, kecuali sakura) */}
      <span className="deco-shape deco-star" style={{ top: '15%', left: '7%' }} />
      <span className="deco-shape deco-star" style={{ top: '64%', left: '3%', width: 11, height: 11 }} />
      <span className="deco-shape deco-star" style={{ top: '30%', right: '6%' }} />
      <span className="deco-shape deco-plus" style={{ top: '46%', left: '12%' }} />
      <span className="deco-shape deco-plus" style={{ bottom: '18%', right: '10%' }} />
      <span className="deco-shape deco-bubble" style={{ top: '22%', right: '14%' }} />
      <span className="deco-shape deco-bubble" style={{ bottom: '28%', left: '7%', width: 13, height: 13 }} />
      <span className="deco-shape deco-bubble" style={{ top: '78%', right: '18%' }} />
      <span className="deco-shape deco-diamond" style={{ top: '8%', left: '38%' }} />
      <span className="deco-shape deco-diamond" style={{ bottom: '12%', left: '30%', width: 10, height: 10 }} />

      {/* Kelopak sakura (21 Mar - 20 Apr) — sebaran statis */}
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={`pt${i}`} className="deco-shape deco-petal" style={{ left: `${4 + i * 14}%`, top: `${6 + ((i * 13) % 74)}%` }} />
      ))}

      {/* Salju natal (Desember) — sebaran statis */}
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={`sn${i}`} className="deco-shape deco-snow" style={{ left: `${9 + i * 13}%`, top: `${5 + ((i * 17) % 76)}%` }} />
      ))}

      {/* Washi tape di tepi layar (desktop saja) */}
      <span className="deco-tape t1" />
      <span className="deco-tape t2" />
    </div>
  );
}
