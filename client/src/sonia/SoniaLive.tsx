import { useEffect, useRef } from 'react';
import { COLS, FRAMES, ROWS, face, sonia } from './live';

/* Portrait animé de Sonia : uniquement ses vraies images, enchaînées dans l'ordre de la vidéo.
   Deux images voisines sont superposées et fondues l'une dans l'autre pour un mouvement continu. */
const SHEET = '/sonia/mouvements.webp';

function place(el: HTMLDivElement, i: number) {
  const c = i % COLS, r = Math.floor(i / COLS);
  el.style.backgroundPosition = `${(c / (COLS - 1)) * 100}% ${(r / (ROWS - 1)) * 100}%`;
}

export default function SoniaLive({ size, zoom = 1 }: { size: number; zoom?: number }) {
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  useEffect(() => face.on((p) => {
    if (!a.current || !b.current) return;
    const i = Math.floor(p), f = p - i;
    place(a.current, i);
    place(b.current, (i + 1) % FRAMES);
    b.current.style.opacity = f.toFixed(3);
  }), []);
  const layer: React.CSSProperties = {
    position: 'absolute', inset: 0, backgroundImage: `url(${SHEET})`,
    backgroundSize: `${COLS * 100}% ${ROWS * 100}%`, backgroundRepeat: 'no-repeat',
  };
  /* Au survol, elle sourit (sauf si elle est en train de répondre ou de réfléchir). */
  const smile = () => {
    if (['repos', 'ecoute', 'accueil'].includes(sonia.mood)) sonia.set('joie', sonia.mood === 'ecoute' ? 'ecoute' : 'repos');
  };
  return (
    <span onMouseEnter={smile} className="relative block overflow-hidden rounded-full bg-[#2a2320]" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 block" style={{ transform: `scale(${zoom})`, transformOrigin: '50% 38%' }}>
        <div ref={a} style={layer} />
        <div ref={b} style={{ ...layer, opacity: 0 }} />
      </span>
    </span>
  );
}
