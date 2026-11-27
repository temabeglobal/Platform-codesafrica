import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useEvents } from '../events';
import NameSuggest, { teamNames } from './NameSuggest';

/* Création ou modification d'une équipe : son nom et son responsable. Les membres se gèrent dans le dossier de l'équipe.
   Maquette : rien n'est encore enregistré en base. */

interface Props {
  open: boolean;
  eventName: string;
  existing: string[];
  /** Équipe à modifier ; absente = création. */
  initial?: { name: string; lead: string };
  onClose: () => void;
  onCreate: (name: string, lead: string) => void;
}

export default function NewTeamModal({ open, eventName, existing, initial, onClose, onCreate }: Props) {
  const editing = !!initial;
  const [name, setName] = useState('');
  const [lead, setLead] = useState('');
  const { data } = useEvents();
  const people = useMemo(() => teamNames(data.teams, true), [data.teams]);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ''); setLead(initial?.lead ?? ''); setError('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow; // une autre fenêtre peut déjà bloquer le défilement
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const n = name.trim();
    if (!n) { setError('Le nom de l’équipe est requis.'); nameRef.current?.focus(); return; }
    if (existing.some((e) => e.toLowerCase() === n.toLowerCase() && e.toLowerCase() !== initial?.name.toLowerCase())) { setError(`L’équipe « ${n} » existe déjà.`); nameRef.current?.focus(); return; }
    onCreate(n, lead.trim());
  };

  const field = 'h-11 w-full min-w-0 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 transition focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="new-team-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="new-team-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier l’équipe' : 'Nouvelle équipe'}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">{eventName}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <form className="flex-1 overflow-y-auto px-6 py-5 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4 space-y-3">
            <label className="block">
              <span className="block text-xs font-semibold text-ink-600 mb-1.5">Nom de l’équipe *</span>
              <input ref={nameRef} autoFocus className={field} placeholder="ex. Accueil, Sécurité, Protocole" value={name}
                aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(''); }} />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-ink-600 mb-1.5">Responsable</span>
              <NameSuggest className={field} placeholder="ex. M. Kalonji (facultatif)" label="Responsable" options={people} value={lead} onChange={setLead} />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {!editing && <p className="text-xs text-ink-500">Vous pourrez ajouter les membres et leurs responsabilités juste après.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-2xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
            <button type="submit" className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
              {editing ? <><Check size={16} /> Enregistrer</> : <><Plus size={16} /> Créer l’équipe</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
