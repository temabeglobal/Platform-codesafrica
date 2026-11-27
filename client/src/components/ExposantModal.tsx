import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { standSizes, type Lead, type StandSize } from '../demo';
import { Field, Shell, input } from './WmtModals';

/* Ajout direct d'un exposant. Un exposant est un sponsor dont le paiement est reçu :
   il est donc aussi ajouté aux sponsors (confirmé, paiement reçu). Maquette : rien n'est encore enregistré en base. */

const pill = (on: boolean) => `px-4 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

export default function ExposantModal({ open, eventName, existing, onClose, onSubmit }: {
  open: boolean;
  eventName: string;
  /** Noms des sponsors déjà présents, pour éviter les doublons. */
  existing: string[];
  onClose: () => void;
  onSubmit: (l: Lead) => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [stand, setStand] = useState<StandSize | ''>('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<{ name?: string; budget?: string }>({});
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setContact(''); setStand(''); setBudget(''); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const submit = () => {
    const n = name.trim();
    const e: typeof errors = {};
    if (!n) e.name = 'Le nom de l’exposant est requis.';
    else if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) e.name = `« ${n} » est déjà dans les sponsors : passez sa facturation à « Paiement reçu » pour qu’il apparaisse ici.`;
    const amount = budget.trim() ? Number(budget.replace(/\s/g, '').replace(',', '.')) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) e.budget = 'Indiquez un montant valide, en dollars.';
    setErrors(e);
    if (e.name) { first.current?.focus(); return; }
    if (e.budget) return;
    onSubmit({
      name: n, contact: contact.trim() || 'Contact à préciser', stage: 'Confirmé', billing: 'Paiement reçu',
      stand: stand || undefined, budget: amount ? Math.round(amount) : undefined,
    });
  };

  return (
    <Shell open={open} id="exposant-modal-title" title="Ajouter un exposant" subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel="Ajouter l’exposant" submitIcon={<Plus size={16} />}>
      <Field label="Nom de l’exposant" required error={errors.name}>
        <input ref={first} className={input(errors.name)} placeholder="ex. Cimenterie du Katanga" value={name}
          onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} />
      </Field>
      <Field label="Contact">
        <input className={input()} placeholder="Nom, téléphone ou e-mail (facultatif)" value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field label="Stand">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Taille du stand">
          {standSizes.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={stand === s} onClick={() => setStand(s)} className={pill(stand === s)}>{s}</button>
          ))}
          <button type="button" role="radio" aria-checked={stand === ''} onClick={() => setStand('')} className={pill(stand === '')}>À définir</button>
        </div>
      </Field>
      <Field label="Budget sponsoring" error={errors.budget}>
        <div className="relative">
          <input inputMode="decimal" aria-label="Budget sponsoring, en dollars" className={`${input(errors.budget)} pr-10`} placeholder="ex. 5000 (facultatif)" value={budget}
            onChange={(e) => { setBudget(e.target.value); setErrors((x) => ({ ...x, budget: undefined })); }} />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-500" aria-hidden>$</span>
        </div>
      </Field>
      <p className="text-xs text-ink-500">L’exposant est aussi ajouté aux sponsors, comme « Confirmé » avec le paiement reçu.</p>
    </Shell>
  );
}
