import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { BADGE_CATEGORIES, badgeStyle, readPhoto, type Badge, type BadgeCategory, type BadgeTheme } from '../accreditation';
import BadgeCard from './BadgeCard';

/* Création ou modification d'un badge : catégorie, nom, fonction et photo (facultative), avec l'aperçu en direct.
   Maquette : rien n'est encore enregistré en base. */

export type BadgeDraft = Pick<Badge, 'name' | 'category' | 'org' | 'photo'>;

interface Props {
  open: boolean;
  event: { name: string; dates: string; place: string };
  /** Habillage de l'événement, pour l'aperçu. */
  theme?: BadgeTheme;
  /** Badge à modifier ; absent = création. */
  initial?: Badge;
  /** Numéro que recevra le nouveau badge (pour l'aperçu). */
  number: number;
  onClose: () => void;
  onSubmit: (b: BadgeDraft) => void;
}

export default function BadgeModal({ open, event, theme, initial, number, onClose, onSubmit }: Props) {
  const editing = !!initial;
  const [category, setCategory] = useState<BadgeCategory>('Staff');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(initial?.category ?? 'Staff'); setName(initial?.name ?? ''); setOrg(initial?.org ?? '');
    setPhoto(initial?.photo); setError(''); setPhotoError('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const pick = async (file?: File) => {
    if (!file) return;
    setPhotoError('');
    try { setPhoto(await readPhoto(file)); } catch (e) { setPhotoError((e as Error).message); }
  };
  const submit = () => {
    const n = name.trim();
    if (!n) { setError('Le nom est requis.'); nameRef.current?.focus(); return; }
    onSubmit({ name: n, category, org: org.trim(), photo });
  };

  const field = 'h-11 w-full min-w-0 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 transition focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="badge-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="badge-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier le badge' : 'Nouveau badge'}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">{event.name}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <form className="flex-1 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="grid md:grid-cols-[1fr_220px] gap-5">
            <div className="space-y-4 min-w-0">
              <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4">
                <span id="badge-cat" className="block text-xs font-semibold text-ink-600 mb-2">Catégorie *</span>
                <div role="radiogroup" aria-labelledby="badge-cat" className="flex flex-wrap gap-1.5">
                  {BADGE_CATEGORIES.map((c) => {
                    const on = c === category;
                    return (
                      <button key={c} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c)}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold ring-1 transition ${on ? 'text-white' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}
                        style={on ? { backgroundColor: badgeStyle[c].color, ['--tw-ring-color' as string]: badgeStyle[c].color } : undefined}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4 space-y-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-ink-600 mb-1.5">Nom et prénom *</span>
                  <input ref={nameRef} autoFocus className={field} placeholder="ex. M. Kalonji" value={name}
                    aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-ink-600 mb-1.5">Fonction ou organisation</span>
                  <input className={field} placeholder="ex. Journaliste, Radio Okapi (facultatif)" value={org} onChange={(e) => setOrg(e.target.value)} />
                </label>
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              </div>

              <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4">
                <span className="block text-xs font-semibold text-ink-600 mb-2">Photo <span className="font-normal text-ink-500">(facultative)</span></span>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choisir une photo"
                  onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                {photo ? (
                  <div className="flex items-center gap-3">
                    <img src={photo} alt="Photo du badge" className="w-14 h-14 rounded-full object-cover ring-1 ring-ink-200" />
                    <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-xl text-sm font-semibold ring-1 ring-ink-200 hover:bg-ink-50">Changer</button>
                    <button type="button" onClick={() => setPhoto(undefined)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={15} /> Retirer</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-5 text-sm font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700">
                    <ImagePlus size={18} /> Ajouter une photo
                  </button>
                )}
                {photoError && <p role="alert" className="text-sm text-red-700 mt-2">{photoError}</p>}
                <p className="text-xs text-ink-500 mt-2">Sans photo, le badge affiche les initiales. La photo est recadrée en carré.</p>
              </div>
            </div>

            <div className="order-first md:order-none">
              <span className="block text-xs font-semibold text-ink-600 mb-2">Aperçu</span>
              <BadgeCard badge={{ name, category, org, photo, number: initial?.number ?? number }} event={event} theme={theme} className="w-[180px] md:w-full mx-auto shadow-lg rounded-[8px]" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
            <button type="submit" className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
              {editing ? <><Check size={16} /> Enregistrer</> : <><Plus size={16} /> Créer le badge</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
