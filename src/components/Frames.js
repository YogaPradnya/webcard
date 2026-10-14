import { frameDefsSvg, frameSymbolId } from '@/lib/frames';

// Defs sprite: render SEKALI per halaman (book/battle/gacha).
export function FrameDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute' }}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: frameDefsSvg() }}
    />
  );
}

// Overlay bingkai di atas art kartu (pointer-events none agar klik tembus).
export function FrameOverlay({ tier }) {
  return (
    <svg className="frame-overlay" viewBox="0 0 280 400" aria-hidden="true" focusable="false">
      <use href={`#${frameSymbolId(tier)}`} />
    </svg>
  );
}
