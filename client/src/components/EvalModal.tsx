import { useEffect, useState } from 'react';
import { Check, Star, X } from 'lucide-react';
import { AGAIN, fmtScore, kindDef, scoreColor, scoreOf, verdict, type Again, type EvalEntry, type Subject } from '../evaluation';

/* Fiche d'évaluation d'une équipe, d'un intervenant, d'un prestataire ou d'un partenaire :
   une note de 1 à 5 par critère, « à reconduire ? » et un commentaire. Tout est facultatif. */

const WORDS = ['Très insuffisant', 'Insuffisant', 'Moyen', 'Bon', 'Excellent'];

/** Cinq étoiles cliquables ; recliquer sur la note choisie l'efface. */
export function Stars({ value, onChange, label, size = 22 }: { value?: number; onChange?: (n: number | undefined) => void; label: string; size?: number }) {
  if (!onChange) {
    return (
      <span className="inline-flex" role="img" aria-label={value ? `${label} : ${fmtScore(value)} sur 5` : `${label} : non noté`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} className={value && n <= Math.round(value) ? 'text-royal-400 fill-royal-400' : 'text-ink-200 fill-ink-100'} />
        ))}
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = !!value && n <= value;
        return (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sur 5 — ${WORDS[n - 1]}`} title={WORDS[n - 1]}
            onClick={() => onChange(value === n ? undefined : n)}
            className="p-0.5 rounded-md hover:scale-110 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
            <Star size={size} className={on ? 'text-royal-400 fill-royal-400' : 'text-ink-300'} />
          </button>
        );
      })}
    </span>
  );
}

interface Props {
  subject: Subject | null;
  initial?: EvalEntry;
  eventName: string;
  onClose: () => void;
  onSubmit: (e: EvalEntry) => void;
}

export default function EvalModal({ subject, initial, eventName, onClose, onSubmit }: Props) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [again, setAgain] = useState<Again | undefined>();
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!subject) return;
    setScores(initial?.scores ?? {}); setAgain(initial?.again); setComment(initial?.comment ?? '');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, onClose]);

  if (!subject) return null;
  const def = kindDef(subject.kind);
  const score = scoreOf({ scores, comment });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="eval-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-xl max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow text-accent-400">Évaluation · {def.one}</div>
              <h2 id="eval-title" className="font-display text-3xl tracking-wide mt-1 truncate">{subject.name}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">{subject.detail || eventName}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <form className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSubmit({ scores, again, comment: comment.trim(), updatedAt: new Date().toISOString() }); }}>
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-semibold text-ink-600">Notes par critère <span className="font-normal text-ink-500">(de 1 à 5)</span></span>
              <span className="text-sm font-semibold" style={{ color: scoreColor(score) }}>{score === undefined ? 'Non noté' : `${fmtScore(score)} / 5 · ${verdict(score)}`}</span>
            </div>
            <ul className="divide-y divide-ink-100">
              {def.criteria.map((c) => (
                <li key={c} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">{c}</span>
                  <Stars label={c} value={scores[c]} onChange={(n) => setScores(({ [c]: _old, ...rest }) => (n ? { ...rest, [c]: n } : rest))} />
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4">
            <span id="eval-again" className="block text-xs font-semibold text-ink-600 mb-2">À reconduire pour la prochaine édition ?</span>
            <div role="radiogroup" aria-labelledby="eval-again" className="flex flex-wrap gap-1.5">
              {AGAIN.map((a) => {
                const on = a === again;
                const tone = a === 'Oui' ? 'bg-emerald-600 ring-emerald-600' : a === 'Non' ? 'bg-red-600 ring-red-600' : 'bg-amber-600 ring-amber-600';
                return (
                  <button key={a} type="button" role="radio" aria-checked={on} onClick={() => setAgain(on ? undefined : a)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold ring-1 transition ${on ? `${tone} text-white` : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-400'}`}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block bg-white rounded-2xl ring-1 ring-ink-200 p-4">
            <span className="block text-xs font-semibold text-ink-600 mb-1.5">Commentaire</span>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Ce qui a bien marché, ce qui est à revoir…"
              className="w-full rounded-xl bg-[var(--sand)] px-4 py-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500 resize-y" />
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
            <button type="submit" className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
              <Check size={16} /> Enregistrer l’évaluation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
