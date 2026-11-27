import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { providerStages, type ProviderStage } from '../demo';
import { Field, Shell, input } from './WmtModals';
import NameSuggest from './NameSuggest';

/* Ajout d'un prestataire à l'événement actif : nom, catégorie, téléphone, e-mail et étape du suivi.
   Les devis, commandes et factures s'ajoutent ensuite dans son dossier. */

const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

const COMMON = ['Restauration', 'Photo & vidéo', 'Son & éclairage', 'Transport', 'Hébergement', 'Impression', 'Décoration', 'Sécurité', 'Location de matériel', 'Traduction'];

export interface NewProvider { name: string; category: string; phone: string; email: string; status: ProviderStage }

export default function ProviderModal({ open, eventName, existing, categories, onClose, onSubmit }: {
  open: boolean;
  eventName: string;
  /** Noms déjà présents, pour éviter les doublons. */
  existing: string[];
  /** Catégories déjà utilisées dans l'événement, proposées en premier. */
  categories: string[];
  onClose: () => void;
  onSubmit: (p: NewProvider) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<ProviderStage>(providerStages[0]);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const first = useRef<HTMLInputElement>(null);

  const catOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...categories, ...COMMON].filter((c) => {
      const k = c.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    }).map((c) => ({ name: c, detail: categories.includes(c) ? 'Déjà utilisée dans cet événement' : 'Catégorie courante' }));
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    setName(''); setCategory(''); setPhone(''); setEmail(''); setStatus(providerStages[0]); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const submit = () => {
    const n = name.trim(), m = email.trim();
    const e: typeof errors = {};
    if (!n) e.name = 'Le nom du prestataire est requis.';
    else if (existing.some((x) => x.trim().toLowerCase() === n.toLowerCase())) e.name = `« ${n} » est déjà dans la liste.`;
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) e.email = 'Cette adresse e-mail ne semble pas valide.';
    setErrors(e);
    if (e.name) { first.current?.focus(); return; }
    if (e.email) return;
    onSubmit({ name: n, category: category.trim(), phone: phone.trim(), email: m, status });
  };

  return (
    <Shell open={open} id="provider-modal-title" title="Ajouter un prestataire" subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel="Ajouter le prestataire" submitIcon={<Plus size={16} />}>
      <Field label="Nom du prestataire" required error={errors.name}>
        <input ref={first} className={input(errors.name)} placeholder="ex. Traiteur Soleil" value={name}
          onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} />
      </Field>
      <Field label="Catégorie">
        <NameSuggest className={input()} placeholder="ex. Restauration, Transport (facultatif)" label="Catégorie" icon={Tag} options={catOptions} value={category} onChange={setCategory} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Téléphone">
          <input type="tel" inputMode="tel" className={input()} placeholder="+243 … (facultatif)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <input type="email" inputMode="email" className={input(errors.email)} placeholder="contact@… (facultatif)" value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} />
        </Field>
      </div>
      <Field label="Étape du suivi">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Étape du suivi">
          {providerStages.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={pill(status === s)}>{s}</button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-ink-500">Le téléphone sert aux boutons WhatsApp et SMS, l’e-mail au bouton E-mail. Les devis, commandes et factures s’ajoutent ensuite dans le dossier du prestataire.</p>
    </Shell>
  );
}
