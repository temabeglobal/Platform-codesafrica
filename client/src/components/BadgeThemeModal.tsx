import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import { hasTheme, readBackground, readLogo, type Badge, type BadgeTheme } from '../accreditation';
import BadgeCard from './BadgeCard';

/* Habillage des badges d'un événement : image de fond et logo, tous deux facultatifs.
   Il s'applique à tous les badges de l'événement (écran, impression et PDF).
   Maquette : rien n'est encore enregistré en base. */

interface Props {
  open: boolean;
  event: { name: string; dates: string; place: string };
  initial: BadgeTheme;
  /** Badge montré dans l'aperçu. */
  sample: Pick<Badge, 'name' | 'category' | 'org' | 'photo' | 'number'>;
  onClose: () => void;
  onSubmit: (t: BadgeTheme) => void;
}

function Slot({ label, hint, value, onPick, onClear, error, wide }: {
  label: string; hint: string; value?: string; onPick: (f: File) => void; onClear: () => void; error: string; wide?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4">
      <span className="block text-xs font-semibold text-ink-600 mb-2">{label} <span className="font-normal text-ink-500">(facultatif)</span></span>
      <input ref={ref} type="file" accept="image/*" className="sr-only" aria-label={`Choisir : ${label}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          <img src={value} alt={label} className={`${wide ? 'h-12 max-w-[140px] object-contain bg-[var(--sand)] p-1' : 'w-12 h-[72px] object-cover'} rounded-lg ring-1 ring-ink-200`} />
          <button type="button" onClick={() => ref.current?.click()} className="px-4 py-2 rounded-xl text-sm font-semibold ring-1 ring-ink-200 hover:bg-ink-50">Changer</button>
          <button type="button" onClick={onClear} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={15} /> Retirer</button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-4 text-sm font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700">
          <ImagePlus size={18} /> Ajouter
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
      <p className="text-xs text-ink-500 mt-2">{hint}</p>
    </div>
  );
}

export default function BadgeThemeModal({ open, event, initial, sample, onClose, onSubmit }: Props) {
  const [theme, setTheme] = useState<BadgeTheme>({});
  const [errors, setErrors] = useState({ background: '', logo: '' });

  useEffect(() => {
    if (!open) return;
    setTheme(initial); setErrors({ background: '', logo: '' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const pick = (key: 'background' | 'logo') => async (f: File) => {
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const v = key === 'background' ? await readBackground(f) : await readLogo(f);
      setTheme((t) => ({ ...t, [key]: v }));
    } catch (err) { setErrors((e) => ({ ...e, [key]: (err as Error).message })); }
  };
  const clear = (key: 'background' | 'logo') => () => setTheme(({ [key]: _gone, ...rest }) => rest);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="badge-theme-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="badge-theme-title" className="font-display text-3xl tracking-wide">Habillage des badges</h2>
              <p className="text-sm text-white/75 mt-1 truncate">{event.name}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <form className="flex-1 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); onSubmit(theme); }}>
          <div className="grid md:grid-cols-[1fr_220px] gap-5">
            <div className="space-y-4 min-w-0">
              <p className="text-sm text-ink-600">
                Habillez les badges aux couleurs de l’événement. C’est facultatif : sans habillage, les badges gardent le modèle standard.
                L’habillage s’applique à tous les badges de cet événement, à l’écran, à l’impression et dans le PDF.
              </p>
              <Slot label="Image de fond" value={theme.background} onPick={pick('background')} onClear={clear('background')} error={errors.background}
                hint="Visuel de l’événement (affiche, motif…). Il est recadré au format du badge, 9 × 13,5 cm ; le texte reste sur des cartouches blancs pour être lisible." />
              <Slot wide label="Logo de l’événement" value={theme.logo} onPick={pick('logo')} onClear={clear('logo')} error={errors.logo}
                hint="Affiché en haut du badge, à côté du logo CODES Africa. Un PNG à fond transparent donne le meilleur résultat." />
            </div>
            <div className="order-first md:order-none">
              <span className="block text-xs font-semibold text-ink-600 mb-2">Aperçu</span>
              <BadgeCard badge={sample} event={event} theme={theme} className="w-[180px] md:w-full mx-auto shadow-lg rounded-[8px]" />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2 mt-5">
            <button type="button" disabled={!hasTheme(theme)} onClick={() => setTheme({})}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold text-ink-700 hover:bg-ink-100 disabled:opacity-40">
              <RotateCcw size={16} /> Modèle standard
            </button>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
              <button type="submit" className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
                <Check size={16} /> Appliquer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
