import { useEffect, useRef, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { billingStatuses, stagesFor, type Billing, type Lead, type Stage } from '../demo';
import { Field, Shell, input } from './WmtModals';

/* Ajout ou modification d'un partenaire ou d'un sponsor : nom, contact, étape du suivi, note,
   et pour un sponsor le statut de sa facture. Maquette : rien n'est encore enregistré en base. */

const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

export default function LeadModal({ open, kind, eventName, existing, initial, onClose, onSubmit }: {
  open: boolean;
  kind: 'partenaires' | 'sponsors';
  eventName: string;
  /** Noms déjà présents, pour éviter les doublons. */
  existing: string[];
  /** Contact à modifier ; absent = ajout. */
  initial?: Lead;
  onClose: () => void;
  onSubmit: (l: Lead) => void;
}) {
  const one = kind === 'partenaires' ? 'partenaire' : 'sponsor';
  const stages = stagesFor(kind);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [stage, setStage] = useState<Stage>(stages[0]);
  const [billing, setBilling] = useState<Billing | ''>('');
  const [note, setNote] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ''); setContact(initial && initial.contact !== 'Contact à préciser' ? initial.contact : '');
    // Une ancienne étape qui n'existe plus pour ce suivi (ex. « Prospect » chez les sponsors) revient à la première.
    setStage(initial && stages.includes(initial.stage) ? initial.stage : stages[0]);
    setBilling(initial?.billing ?? ''); setNote(initial?.note ?? ''); setBudget(initial?.budget ? String(initial.budget) : ''); setError(''); setBudgetError('');
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const submit = () => {
    const n = name.trim();
    if (!n) { setError(`Le nom du ${one} est requis.`); first.current?.focus(); return; }
    if (existing.some((e) => e.toLowerCase() === n.toLowerCase() && e.toLowerCase() !== initial?.name.toLowerCase())) {
      setError(`« ${n} » est déjà dans la liste.`); first.current?.focus(); return;
    }
    const amount = budget.trim() ? Number(budget.replace(/\s/g, '').replace(',', '.')) : undefined;
    if (kind === 'sponsors' && amount !== undefined && (!Number.isFinite(amount) || amount < 0)) { setBudgetError('Indiquez un montant valide, en dollars.'); return; }
    onSubmit({
      name: n, contact: contact.trim() || 'Contact à préciser', stage, note: note.trim() || undefined,
      billing: kind === 'sponsors' && billing ? billing : undefined,
      budget: kind === 'sponsors' && amount ? Math.round(amount) : undefined,
      stand: kind === 'sponsors' ? initial?.stand : undefined, // la taille du stand se gère dans « Exposants »
    });
  };

  return (
    <Shell open={open} id="lead-modal-title" title={initial ? `Modifier le ${one}` : `Ajouter un ${one}`} subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel={initial ? 'Enregistrer' : `Ajouter le ${one}`} submitIcon={initial ? <Save size={16} /> : <Plus size={16} />}>
      <Field label={`Nom du ${one}`} required error={error}>
        <input ref={first} className={input(error)} placeholder={kind === 'partenaires' ? 'ex. Université de Lubumbashi' : 'ex. Banque du Katanga'} value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }} />
      </Field>
      <Field label="Contact">
        <input className={input()} placeholder="Nom, téléphone ou e-mail (facultatif)" value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="Étape du suivi">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Étape du suivi">
          {stages.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={stage === s} onClick={() => setStage(s)} className={pill(stage === s)}>{s}</button>
          ))}
        </div>
      </Field>
      {kind === 'sponsors' && (
        <Field label="Budget sponsoring" error={budgetError}>
          <div className="relative">
            <input inputMode="decimal" className={`${input(budgetError)} pr-10`} placeholder="ex. 10000 (facultatif)" value={budget}
              aria-label="Budget sponsoring, en dollars" onChange={(e) => { setBudget(e.target.value); setBudgetError(''); }} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500" aria-hidden>$</span>
          </div>
          <p className="text-xs text-ink-500">Montant apporté par ce sponsor. Il reste séparé du budget de l’événement.</p>
        </Field>
      )}
      {kind === 'sponsors' && (
        <Field label="Facturation">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Facturation">
            {(['', ...billingStatuses] as const).map((b) => (
              <button key={b || 'aucune'} type="button" role="radio" aria-checked={billing === b} onClick={() => setBilling(b)} className={pill(billing === b)}>{b || 'Pas encore facturé'}</button>
            ))}
          </div>
          {billing && stage !== 'Confirmé' && <p className="text-xs text-royal-700">Ce sponsor n’est pas encore confirmé : vérifiez avant de le facturer.</p>}
        </Field>
      )}
      <Field label="Note">
        <input className={input()} placeholder="ex. Intéressé par le stand principal (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Shell>
  );
}
