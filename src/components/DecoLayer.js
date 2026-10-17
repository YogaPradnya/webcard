/* Lapisan hiasan global: bentuk mengapung + washi tape + tema musiman.
   Murni dekoratif (aria-hidden, pointer-events:none) dan posisinya di belakang
   konten via z-index di deco.css. Musim diatur script kecil di layout.js
   lewat atribut [data-season] di <html>. */
export default function DecoLayer() {
  return (
    <div className="deco-layer" aria-hidden="true">
      {/* Bentuk dasar (tampil di semua musim, kecuali sakura) */}
      <span className="deco-shape deco-star" style={{ top: '15%', left: '7%' }} />
      <span className="deco-shape deco-star" style={{ top: '64%', left: '3%', width: 11, height: 11, animationDelay: '1.1s' }} />
      <span className="deco-shape deco-star" style={{ top: '30%', right: '6%', animationDelay: '2.3s' }} />
      <span className="deco-shape deco-plus" style={{ top: '46%', left: '12%', animationDelay: '0.6s' }} />
      <span className="deco-shape deco-plus" style={{ bottom: '18%', right: '10%', animationDelay: '1.7s' }} />
      <span className="deco-shape deco-bubble" style={{ top: '22%', right: '14%', animationDelay: '0.9s' }} />
      <span className="deco-shape deco-bubble" style={{ bottom: '28%', left: '7%', width: 13, height: 13, animationDelay: '2.6s' }} />
      <span className="deco-shape deco-bubble" style={{ top: '78%', right: '18%', animationDelay: '1.4s' }} />
      <span className="deco-shape deco-diamond" style={{ top: '8%', left: '38%', animationDelay: '3s' }} />
      <span className="deco-shape deco-diamond" style={{ bottom: '12%', left: '30%', width: 10, height: 10, animationDelay: '0.4s' }} />

      {/* Kelopak sakura (21 Mar - 20 Apr) */}
      {Array.from({ length: 7 }).map((_, i) => (
        <span
          key={`pt${i}`}
          className="deco-shape deco-petal"
          style={{ left: `${4 + i * 14}%`, animationDelay: `${i * 1.4}s`, animationDuration: `${9 + (i % 3) * 2.4}s` }}
        />
      ))}

      {/* Salju natal (Desember) */}
      {Array.from({ length: 7 }).map((_, i) => (
        <span
          key={`sn${i}`}
          className="deco-shape deco-snow"
          style={{ left: `${9 + i * 13}%`, animationDelay: `${i * 1.1}s`, animationDuration: `${10 + (i % 3) * 2.8}s` }}
        />
      ))}

      {/* Washi tape di tepi layar (desktop saja) */}
      <span className="deco-tape t1" />
      <span className="deco-tape t2" />
    </div>
  );
}
