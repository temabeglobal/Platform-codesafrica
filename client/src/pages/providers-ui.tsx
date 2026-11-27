import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { ProviderStage } from '../demo';

/* Éléments partagés par la liste des prestataires et leur dossier. */

export const stageStyle: Record<ProviderStage, { chip: string; dot: string }> = {
  'À contacter': { chip: 'bg-ink-100 text-ink-700', dot: 'bg-ink-400' },
  Contacté: { chip: 'bg-[#7b5cd6]/10 text-[#5b3fb0]', dot: 'bg-[#7b5cd6]' },
  'Devis reçu': { chip: 'bg-brand-500/10 text-brand-700', dot: 'bg-brand-500' },
  Confirmé: { chip: 'bg-accent-500/15 text-accent-700', dot: 'bg-accent-500' },
  Payé: { chip: 'bg-royal-400/25 text-royal-700', dot: 'bg-royal-500' },
};

/** Couleur d'un statut de pièce : validé (vert), en cours (doré) ou refusé (rouge). */
export function docStatusStyle(status: string) {
  if (/refus|annul/i.test(status)) return 'bg-red-100 text-red-800';
  if (/^(accepté|confirmée|livrée|payée)$/i.test(status)) return 'bg-accent-500/15 text-accent-700';
  return 'bg-royal-300/40 text-royal-700';
}

/** Pastille cliquable qui ouvre un petit menu de choix (statut, étape…). */
export function ChipMenu({ value, options, onChange, chip, label, align = 'left' }: {
  value: string; options: readonly string[]; onChange: (v: string) => void;
  chip: (v: string) => string; label: string; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number; right: number; side: 'left' | 'right' }>({ top: 0, left: 0, right: 0, side: align });
  const ref = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  // Le menu s'affiche par-dessus la page (jamais coupé par sa carte) ; il se ferme au clic dehors, à Échap ou au défilement.
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    // Le côté demandé, sauf si le menu (≈ 200 px) sortirait de l'écran : on prend alors l'autre côté.
    if (r) setAt({ top: r.bottom + 6, left: r.left, right: window.innerWidth - r.right,
      side: align === 'left' ? (r.left + 200 > window.innerWidth - 8 ? 'right' : 'left') : (r.right - 200 < 8 ? 'left' : 'right') });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { const t = e.target as Node; if (!ref.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const away = () => setOpen(false);
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    window.addEventListener('scroll', away, true); window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => { place(); setOpen((o) => !o); }} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} : ${value}. Changer`}
        className={`flex items-center gap-1 text-[11px] font-semibold pl-2.5 pr-1.5 py-1 rounded-full transition hover:brightness-95 ${chip(value)}`}>
        {value} <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <span ref={menu} role="listbox" aria-label={label} onClick={(e) => e.stopPropagation()}
          style={{ top: at.top, ...(at.side === 'right' ? { right: at.right } : { left: at.left }) }}
          className="sonia-rise fixed z-[60] min-w-[180px] p-1.5 rounded-2xl bg-white ring-1 ring-ink-100 shadow-[0_18px_40px_-16px_rgba(1,33,43,.45)]">
          {options.map((o) => (
            <button key={o} type="button" role="option" aria-selected={o === value} onClick={() => { onChange(o); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-left hover:bg-ink-50">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip(o)}`}>{o}</span>
              {o === value && <Check size={14} className="ml-auto text-brand-600" />}
            </button>
          ))}
        </span>, document.body,
      )}
    </span>
  );
}

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const money = (n: number) => `${n.toLocaleString('fr-FR')} $`;
/** Liens de contact directs (ouverts par l'utilisatrice elle-même). */
export const contactLinks = (phone: string, email: string) => {
  const digits = phone.replace(/[^\d]/g, '');
  return {
    whatsapp: digits ? `https://wa.me/${digits}` : undefined,
    sms: digits ? `sms:+${digits}` : undefined,
    mail: email ? `mailto:${email}` : undefined,
  };
};
