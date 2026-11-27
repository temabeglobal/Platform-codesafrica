import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, ReceiptText, Save, Truck, X } from 'lucide-react';
import { useEvents } from '../events';
import NameSuggest, { norm, type NameOption } from './NameSuggest';
import { detailOf, paymentStatuses, uid, type BudgetLine, type Expense, type PaymentStatus } from '../demo';

/* Ajouter une dépense au budget de l'événement actif : sur un poste existant ou sur un nouveau poste.
   Maquette : rien n'est encore enregistré en base. */

interface Props {
  open: boolean;
  eventName: string;
  lines: BudgetLine[];
  /** Poste déjà choisi (ouverture depuis le détail d'un poste). */
  poste?: string;
  /** Dépense existante : la fenêtre passe en mode « Modifier ». */
  initial?: Expense;
  onClose: () => void;
  onSubmit: (poste: string, e: Expense, planned?: number) => void;
}

const NEW = '__nouveau__';
type Errors = Partial<Record<'label' | 'qty' | 'unit' | 'date' | 'poste' | 'planned' | 'paidOn' | 'provider', string>>;
const today = () => new Date().toISOString().slice(0, 10);
const toNumber = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const round = (n: number) => Math.round(n * 100) / 100;

export default function ExpenseModal({ open, eventName, lines, poste: initialPoste, initial, onClose, onSubmit }: Props) {
  const editing = !!initial;
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [date, setDate] = useState('');
  const [poste, setPoste] = useState('');
  const [newPoste, setNewPoste] = useState('');
  const [planned, setPlanned] = useState('');
  const [payment, setPayment] = useState<PaymentStatus>('Payé');
  const [paidOn, setPaidOn] = useState('');
  const [provider, setProvider] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  /* Prestataire (facultatif) : on tape, la liste des prestataires du menu Prestataires se filtre. */
  const { data } = useEvents();
  const providerOptions = useMemo<NameOption[]>(() => data.providers.map((p) => ({ name: p.name, detail: [p.category, p.status].filter(Boolean).join(' · ') })), [data.providers]);
  const providerOf = (name: string) => data.providers.find((p) => norm(p.name) === norm(name));
  const first = useRef<HTMLInputElement>(null);
  const plannedOf = (label?: string) => { const l = lines.find((x) => x.label === label); return l ? String(l.planned) : ''; };
  const choose = (label: string) => { setPoste(label); setPlanned(label === NEW ? '' : plannedOf(label)); clear('poste'); clear('planned'); };

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? ''); setQty(initial ? String(detailOf(initial).qty) : '1'); setUnit(initial ? String(detailOf(initial).unit) : ''); setDate(initial?.date ?? today()); setPoste(initialPoste ?? (lines.length ? '' : NEW)); setNewPoste(''); setPlanned(plannedOf(initialPoste)); setPayment(initial?.payment ?? 'Payé'); setPaidOn(initial?.paidOn ?? initial?.date ?? today()); setProvider(data.providers.find((p) => p.id === initial?.provider)?.name ?? ''); setErrors({});
    const t = setTimeout(() => first.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const clear = (k: keyof Errors) => setErrors((x) => ({ ...x, [k]: undefined }));
  const submit = () => {
    const e: Errors = {};
    const q = toNumber(qty), u = toNumber(unit);
    // Champ vide : 0 pour un nouveau poste, budget inchangé pour un poste existant.
    const p = planned.trim() ? toNumber(planned) : poste === NEW ? 0 : undefined;
    const name = poste === NEW ? newPoste.trim() : poste;
    if (!label.trim()) e.label = 'Décrivez la dépense.';
    if (!qty.trim() || !Number.isFinite(q) || q <= 0) e.qty = 'Indiquez une quantité supérieure à 0.';
    if (!unit.trim() || !Number.isFinite(u) || u <= 0) e.unit = 'Indiquez un prix supérieur à 0.';
    if (!date) e.date = 'La date est requise.';
    if (!paidOn) e.paidOn = payment === 'Payé' ? 'Indiquez la date du paiement.' : 'Indiquez la date de l’avance.';
    if (!poste) e.poste = 'Choisissez un poste.';
    else if (poste === NEW && !name) e.poste = 'Donnez un nom au nouveau poste.';
    else if (poste === NEW && lines.some((l) => l.label.toLowerCase() === name.toLowerCase())) e.poste = 'Ce poste existe déjà : choisissez-le dans la liste.';
    if (p !== undefined && (!Number.isFinite(p) || p < 0)) e.planned = 'Indiquez un montant valide.';
    const prov = provider.trim() ? providerOf(provider) : undefined;
    if (provider.trim() && !prov) e.provider = 'Choisissez un prestataire de la liste (menu Prestataires), ou laissez vide.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit(name, { id: initial?.id ?? uid(), label: label.trim(), amount: round(q * u), qty: q, unitPrice: u, date, payment, paidOn, provider: prov?.id }, p);
  };

  const input = (bad?: string) =>
    `w-full min-w-0 h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;
  const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="expense-modal-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier la dépense' : 'Ajouter une dépense'}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">Budget « {eventName} »</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
            <Field label="Poste de budget" required error={errors.poste}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Poste de budget">
                {lines.map((l) => (
                  <button key={l.label} type="button" role="radio" aria-checked={poste === l.label} onClick={() => choose(l.label)} className={pill(poste === l.label)}>{l.label}</button>
                ))}
                <button type="button" role="radio" aria-checked={poste === NEW} onClick={() => choose(NEW)} className={`${pill(poste === NEW)} flex items-center gap-1.5`}>
                  <Plus size={14} /> Nouveau poste
                </button>
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              {poste === NEW && (
                <Field label="Nom du poste" required>
                  <input className={input(errors.poste)} placeholder="Sécurité" value={newPoste} onChange={(e) => { setNewPoste(e.target.value); clear('poste'); }} />
                </Field>
              )}
              <Field label="Budget prévu ($)" error={errors.planned}>
                <input inputMode="decimal" aria-label="Budget prévu du poste" disabled={!poste} className={`${input(errors.planned)} disabled:opacity-60`} placeholder={poste ? 'Ex. 5 000' : 'Choisissez d’abord un poste'} value={planned}
                  onChange={(e) => { setPlanned(e.target.value); clear('planned'); }} />
                {poste && poste !== NEW && (() => { const l = lines.find((l) => l.label === poste); return l ? <p className="text-xs text-ink-500">Déjà dépensé sur ce poste : {l.spent.toLocaleString('fr-FR')} $</p> : null; })()}
              </Field>
            </div>
            <div className="border-t border-ink-200" />
            <Field label="Description" required error={errors.label}>
              <input ref={first} className={input(errors.label)} placeholder="Location de chaises supplémentaires" value={label}
                onChange={(e) => { setLabel(e.target.value); clear('label'); }} />
            </Field>
            <Field label="Prestataire" error={errors.provider}
              hint={data.providers.length ? 'Facultatif : le prestataire payé pour cette dépense' : 'Aucun prestataire pour cet événement : ajoutez-en dans le menu Prestataires.'}>
              <NameSuggest className={input(errors.provider)} placeholder="Tapez le nom d’un prestataire" label="Prestataire" icon={Truck}
                options={providerOptions} value={provider} onChange={(v) => { setProvider(v); clear('provider'); }} showAll disabled={!data.providers.length} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantité" required error={errors.qty}>
                <input inputMode="decimal" aria-label="Quantité" className={input(errors.qty)} placeholder="1" value={qty}
                  onChange={(e) => { setQty(e.target.value); clear('qty'); }} />
              </Field>
              <Field label="Prix unitaire ($)" required error={errors.unit}>
                <input inputMode="decimal" aria-label="Prix unitaire" className={input(errors.unit)} placeholder="450" value={unit}
                  onChange={(e) => { setUnit(e.target.value); clear('unit'); }} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Prix total">
                <div className="h-11 rounded-xl bg-brand-50 ring-1 ring-brand-100 px-4 flex items-center justify-between text-sm" aria-live="polite">
                  <span className="text-ink-500 tabular-nums">{Number.isFinite(toNumber(qty)) && qty.trim() ? toNumber(qty).toLocaleString('fr-FR') : '–'} × {Number.isFinite(toNumber(unit)) && unit.trim() ? toNumber(unit).toLocaleString('fr-FR') : '–'}</span>
                  <b className="tabular-nums text-brand-950">{(() => { const t = toNumber(qty) * toNumber(unit); return qty.trim() && unit.trim() && Number.isFinite(t) ? round(t).toLocaleString('fr-FR') + ' $' : '—'; })()}</b>
                </div>
              </Field>
              <Field label="Date" required error={errors.date}>
                <input type="date" className={input(errors.date)} value={date} onChange={(e) => { setDate(e.target.value); clear('date'); }} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Statut du paiement" required>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Statut du paiement">
                  {paymentStatuses.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={payment === s} onClick={() => setPayment(s)} className={pill(payment === s)}>{s === 'Avance' ? 'Avance versée' : 'Payé'}</button>
                  ))}
                </div>
              </Field>
              <Field label={payment === 'Payé' ? 'Payé le' : 'Avance versée le'} required error={errors.paidOn}>
                <input type="date" aria-label={payment === 'Payé' ? 'Date du paiement' : 'Date de l’avance'} className={input(errors.paidOn)} value={paidOn} onChange={(e) => { setPaidOn(e.target.value); clear('paidOn'); }} />
              </Field>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center gap-3">
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
          <button type="button" onClick={submit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)]">
            {editing ? <><Save size={16} /> Enregistrer</> : <><ReceiptText size={16} /> Ajouter la dépense</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium flex items-center gap-1">{label} {required && <span className="text-red-600" aria-hidden>*</span>}</span>
      {children}
      {error ? <p className="text-xs text-red-700">{error}</p> : hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
