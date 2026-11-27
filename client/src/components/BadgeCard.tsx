import { useMemo } from 'react';
import { CODES_LOGO, badgeCode, badgeStyle, initialsOf, qrPayload, type Badge, type BadgeTheme } from '../accreditation';
import { qrMatrix } from '../qr';

/* Un badge d'accréditation, au format portrait 2:3.
   Toutes les tailles sont en `cqw` (pourcentage de la largeur du badge) : le même dessin sert à l'aperçu
   à l'écran et à l'impression (9 × 13,5 cm). Le PDF (badgePdf.ts) reproduit ce dessin.
   Habillage facultatif : image de fond (le texte reste sur des cartouches blancs, pour rester lisible)
   et logo de l'événement, affiché à côté du logo CODES Africa. */

interface Props {
  badge: Pick<Badge, 'name' | 'category' | 'org' | 'photo' | 'number'> & Partial<Pick<Badge, 'id' | 'token'>>;
  event: { name: string; dates: string; place: string; reference?: string };
  theme?: BadgeTheme;
  className?: string;
}

export default function BadgeCard({ badge, event, theme, className = '' }: Props) {
  const { color } = badgeStyle[badge.category];
  const name = badge.name.trim() || 'Nom et prénom';
  const bg = theme?.background;
  // QR code unique : référence de l'événement, n° et jeton du badge (aperçu d'un nouveau badge : jeton provisoire).
  const payload = qrPayload({ id: badge.id ?? 'apercu', token: badge.token ?? (badge.id ? undefined : 'APERCU'), category: badge.category, number: badge.number }, event.reference ?? '');
  const qr = useMemo(() => qrMatrix(payload), [payload]);
  const path = useMemo(() => qr.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join(''), [qr]);
  const longCat = badge.category.length > 9;
  return (
    <div className={`badge-card [container-type:inline-size] ${className}`}>
      <div className="relative isolate aspect-[2/3] w-full flex flex-col bg-white overflow-hidden rounded-[4cqw] ring-1 ring-ink-200">
        {bg && <img src={bg} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover" />}
        {/* En-tête : logo et événement */}
        <div className={`text-center ${bg ? 'mx-[5cqw] mt-[3cqw] mb-[1.5cqw] px-[2cqw] pt-[3cqw] pb-[2.5cqw] rounded-[3cqw] bg-white/90' : 'px-[7cqw] pt-[6cqw] pb-[4cqw]'}`}>
          <div className={`h-[11cqw] mb-[3cqw] flex items-center justify-center gap-[3cqw]`}>
            <img src={CODES_LOGO} alt="CODES Africa" className={`h-full object-contain ${theme?.logo ? 'max-w-[40cqw]' : 'max-w-[50cqw]'}`} />
            {theme?.logo && <>
              <span className="w-px self-stretch bg-ink-200" aria-hidden="true" />
              <img src={theme.logo} alt={`Logo ${event.name}`} className="h-full max-w-[40cqw] object-contain" />
            </>}
          </div>
          <div className="font-semibold text-ink-900 text-[5cqw] leading-tight truncate">{event.name}</div>
          <div className="text-ink-500 text-[3.6cqw] leading-tight truncate">{[event.dates, event.place].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: '4cqw', backgroundColor: color }} />

        {/* Photo (facultative) ou initiales */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-[5cqw] text-center">
          <div className="w-[42cqw] h-[42cqw] rounded-full p-[1.2cqw] shrink-0" style={{ backgroundColor: color }}>
            {badge.photo
              ? <img src={badge.photo} alt="" className="w-full h-full rounded-full object-cover bg-white" />
              : <div className="w-full h-full rounded-full grid place-items-center bg-white font-display text-[15cqw] tracking-wide" style={{ color }}>{initialsOf(name)}</div>}
          </div>
          <div className={`mt-[5cqw] max-w-full ${bg ? 'bg-white/90 rounded-[3cqw] px-[3cqw] pt-[1.5cqw] pb-[2cqw]' : 'px-[2cqw]'}`}>
            <div className={`font-display tracking-wide leading-[1.05] text-[8.5cqw] line-clamp-2 break-words ${badge.name.trim() ? 'text-ink-900' : 'text-ink-300'}`}>{name}</div>
            {badge.org.trim() && <div className="mt-[1.5cqw] text-ink-600 text-[4.2cqw] leading-snug line-clamp-2">{badge.org}</div>}
          </div>
        </div>

        {/* Bande de la catégorie */}
        <div className="shrink-0 h-[24cqw] flex items-center gap-[3cqw] px-[4cqw] text-white" style={{ backgroundColor: color }}>
          <div className="flex-1 min-w-0 text-center">
            <div className={`font-display uppercase tracking-[0.1em] leading-none whitespace-nowrap ${longCat ? 'text-[7cqw]' : 'text-[8.5cqw]'}`}>{badge.category}</div>
            <div className="mt-[1.8cqw] text-[3.4cqw] tracking-[0.2em] text-white/80">N° {badgeCode(badge)}</div>
          </div>
          <div className="shrink-0 w-[20cqw] h-[20cqw] p-[1.5cqw]" title={payload}>
            <svg viewBox={`0 0 ${qr.length} ${qr.length}`} className="w-full h-full block" shapeRendering="crispEdges" role="img" aria-label={`QR code du badge ${badgeCode(badge)}`}>
              <path d={path} fill="#fff" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
