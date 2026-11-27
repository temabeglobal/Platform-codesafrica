import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileText, Info, Network, RefreshCw, Save, Settings, Upload, X } from 'lucide-react';
import EventNetworkStep, { emptyNetwork, type NetworkInput } from './EventNetworkStep';

/* Création ou modification d'un événement en 3 étapes (sur le modèle « Nouveau projet » de Timly).
   Tous les champs sont obligatoires, sauf les documents. Maquette : rien n'est encore enregistré. */

export interface EventInput {
  name: string; reference: string; description: string; type: string; place: string;
  start: string; end: string; color: string;
  budget: string; owner: string; attendees: string;
  documents: File[];
  /** Étape facultative (création uniquement) : prestataires, sponsors, partenaires, communication, équipes. */
  network: NetworkInput;
}

interface Props {
  open: boolean; onClose: () => void; onSubmit: (e: EventInput) => void;
  /** Valeurs de départ : la fenêtre passe alors en mode « Modifier ». */
  initial?: EventInput;
}

const STEPS = [
  { id: 1, label: 'Informations', icon: Info },
  { id: 2, label: 'Budget & organisation', icon: Settings },
  { id: 3, label: 'Réseau & équipe', icon: Network },
  { id: 4, label: 'Documents', icon: FileText },
];
const TYPES = ['Conférence', 'Forum', 'Salon', 'Atelier', 'Gala', 'Formation'];
const COLORS = ['#0A86A8', '#055468', '#2f6fde', '#6b1a12', '#0aa98d', '#27343f'];

const newSuffix = () => String(Math.floor(Math.random() * 900) + 100);
const makeRef = (name: string, start: string, suffix: string) => {
  const year = (start || new Date().toISOString()).slice(0, 4);
  const code = (name.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 4) || 'EVT').toUpperCase();
  return `CA-${code}-${year}-${suffix}`;
};
const empty = (): EventInput => ({
  name: '', reference: '', description: '', type: '', place: '', start: '', end: '', color: COLORS[0],
  budget: '', owner: '', attendees: '', documents: [], network: emptyNetwork(),
});
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1;
const fmt = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR') : '—');

type Errors = Partial<Record<keyof EventInput, string>>;

function validate(step: number, f: EventInput): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (!f.name.trim()) e.name = 'Le nom de l’événement est requis.';
    if (!f.reference.trim()) e.reference = 'La référence est requise.';
    if (!f.description.trim()) e.description = 'La description est requise.';
    if (!f.type) e.type = 'Choisissez un type d’événement.';
    if (!f.place.trim()) e.place = 'Le lieu est requis.';
    if (!f.start) e.start = 'La date de début est requise.';
    if (!f.end) e.end = 'La date de fin est requise.';
    else if (f.start && f.end < f.start) e.end = 'La date de fin ne peut pas être antérieure au début.';
    if (!f.color) e.color = 'Choisissez une couleur.';
  }
  if (step === 2) {
    if (!f.budget || Number(f.budget) <= 0) e.budget = 'Indiquez un budget supérieur à 0.';
    if (!f.owner.trim()) e.owner = 'Le responsable est requis.';
    if (!f.attendees || Number(f.attendees) <= 0) e.attendees = 'Indiquez le nombre de participants attendus.';
  }
  return e;
}

export default function EventModal({ open, onClose, onSubmit, initial }: Props) {
  const editing = !!initial;
  const [step, setStep] = useState(1);
  // En modification, l'étape Réseau & équipe est masquée : ces listes se gèrent dans leurs modules.
  const steps = STEPS.filter((s) => !(editing && s.id === 3));
  const ids = steps.map((s) => s.id);
  const pos = ids.indexOf(step);
  const isLast = pos === ids.length - 1;
  const [form, setForm] = useState<EventInput>(empty);
  const [errors, setErrors] = useState<Errors>({});
  // La référence suit le nom et l'année de début tant qu'elle n'a pas été modifiée à la main.
  const [autoRef, setAutoRef] = useState(true);
  const suffix = useRef(newSuffix());
  const firstField = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1); setForm(initial ? { ...initial } : empty()); setErrors({}); setAutoRef(!initial); suffix.current = newSuffix();
    const t = setTimeout(() => firstField.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [step]);

  if (!open) return null;

  const update = <K extends keyof EventInput>(k: K, v: EventInput[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (autoRef && (k === 'name' || k === 'start')) next.reference = next.name.trim() ? makeRef(next.name, next.start, suffix.current) : '';
      return next;
    });
    setErrors((er) => ({ ...er, [k]: undefined }));
  };
  const onText = (k: keyof EventInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update(k, e.target.value as never);

  const next = () => {
    const er = validate(step, form);
    setErrors(er);
    if (Object.keys(er).length) return;
    if (!isLast) setStep(ids[pos + 1]);
    else onSubmit({ ...form, name: form.name.trim() });
  };
  // En modification, on peut sauter d'une étape à l'autre si l'étape en cours est valide.
  const goTo = (id: number) => {
    if (id < step) return setStep(id);
    const er = validate(step, form);
    setErrors(er);
    if (!Object.keys(er).length) setStep(id);
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    update('documents', [...form.documents, ...Array.from(list)]);
  };

  const input = (bad?: string) =>
    `w-full h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;
  const duration = form.start && form.end && form.end >= form.start ? days(form.start, form.end) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <h2 id="event-modal-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier l’événement' : 'Créer un événement'}</h2>
              <p className="text-sm text-white/75 mt-1">{editing ? 'Mettez à jour les informations de l’événement' : 'Créez un espace complet pour piloter votre événement'}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        {/* Étapes */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-6 pt-5 shrink-0 overflow-x-auto">
          {steps.map((s, i) => {
            const done = pos > i, active = step === s.id, reachable = done || (editing && !active);
            return (
              <div key={s.id} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && goTo(s.id)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Étape ${i + 1} : ${s.label}${done ? ' (terminée)' : ''}`}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                    active ? 'bg-brand-950 text-accent-300 shadow-md' : done ? 'bg-accent-400/25 text-accent-700 hover:bg-accent-400/35' : reachable ? 'bg-white text-brand-900 hover:bg-brand-50' : 'bg-white/70 text-ink-500'
                  }`}
                >
                  {done ? <Check size={16} /> : <s.icon size={16} />}
                  <span className={active ? '' : 'hidden sm:inline'}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <ChevronRight size={16} className="text-ink-400 shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Contenu */}
        <div ref={body} className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <Section title="Informations générales">
              <Field label="Nom de l’événement" error={errors.name}>
                <input ref={firstField} className={input(errors.name)} placeholder="CODES Africa 2027" value={form.name} onChange={onText('name')} />
              </Field>
              <Field label="Référence" error={errors.reference} hint="Générée automatiquement, modifiable">
                <div className="flex gap-2">
                  <input className={input(errors.reference) + ' font-mono'} placeholder="CA-CODE-2027-001" value={form.reference} onChange={(e) => { setAutoRef(false); update('reference', e.target.value); }} />
                  <button type="button" title="Générer une référence" aria-label="Générer une référence" onClick={() => { suffix.current = newSuffix(); setAutoRef(true); update('reference', makeRef(form.name, form.start, suffix.current)); }} className="h-11 w-11 shrink-0 rounded-xl bg-white ring-1 ring-ink-200 grid place-items-center hover:bg-brand-50"><RefreshCw size={16} /></button>
                </div>
              </Field>
              <Field label="Description détaillée" error={errors.description}>
                <textarea rows={3} className={input(errors.description) + ' h-auto py-3 resize-none'} placeholder="Objectifs, thème, public visé, format…" value={form.description} onChange={onText('description')} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Type d’événement" error={errors.type}>
                  <select className={input(errors.type)} value={form.type} onChange={onText('type')}>
                    <option value="" disabled>Sélectionner…</option>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Lieu" error={errors.place}>
                  <input className={input(errors.place)} placeholder="Kinshasa, RDC" value={form.place} onChange={onText('place')} />
                </Field>
                <Field label="Date de début" error={errors.start}>
                  <input type="date" className={input(errors.start)} value={form.start} onChange={onText('start')} />
                </Field>
                <Field label="Date de fin" error={errors.end} hint={duration ? `Durée : ${duration} jour${duration > 1 ? 's' : ''}` : undefined}>
                  <input type="date" className={input(errors.end)} min={form.start || undefined} value={form.end} onChange={onText('end')} />
                </Field>
              </div>
              <Field label="Couleur de l’événement" error={errors.color}>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={form.color === c} onClick={() => update('color', c)}
                      className={`w-9 h-9 rounded-xl transition ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-white ring-brand-950 scale-110' : 'hover:scale-105'}`} style={{ background: c }} />
                  ))}
                </div>
              </Field>
            </Section>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Section title="Budget & organisation">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Budget total ($)" error={errors.budget}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-500">$</span>
                      <input type="number" min="0" step="500" className={input(errors.budget) + ' pl-8'} placeholder="25 000" value={form.budget} onChange={onText('budget')} />
                    </div>
                  </Field>
                  <Field label="Participants attendus" error={errors.attendees}>
                    <input type="number" min="1" className={input(errors.attendees)} placeholder="300" value={form.attendees} onChange={onText('attendees')} />
                  </Field>
                </div>
                <Field label="Responsable de l’événement" error={errors.owner}>
                  <input className={input(errors.owner)} placeholder="Nom du responsable" value={form.owner} onChange={onText('owner')} />
                </Field>
              </Section>

              <div className="relative overflow-hidden rounded-2xl bg-brand-950 text-white p-5">
                <div className="pattern bg-[#2a98b8] opacity-[0.1]" />
                <div className="relative">
                  <h3 className="eyebrow text-accent-400 mb-3">Récapitulatif</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Nom', form.name], ['Référence', form.reference], ['Type', form.type], ['Lieu', form.place],
                      ['Date de début', fmt(form.start)], ['Date de fin', fmt(form.end)],
                      ['Budget', form.budget ? `${Number(form.budget).toLocaleString('fr-FR')} $` : '—'], ['Participants', form.attendees || '—'],
                    ].map(([l, v]) => (
                      <div key={l} className="min-w-0"><dt className="text-xs text-white/60">{l}</dt><dd className="font-medium truncate">{v || '—'}</dd></div>
                    ))}
                  </dl>
                  {duration > 0 && <div className="mt-3 pt-3 border-t border-white/15 text-xs text-white/70">Durée totale : <b className="text-accent-300">{duration} jour{duration > 1 ? 's' : ''}</b></div>}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <EventNetworkStep value={form.network} onChange={(v) => update('network', v)} />
          )}

          {step === 4 && (
            <Section title="Documents de l’événement" subtitle="Facultatif — vous pourrez aussi les ajouter plus tard : programme, budget détaillé, contrats…">
              <button type="button" onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                className={`w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center transition hover:bg-brand-500/10 ${errors.documents ? 'border-red-400' : 'border-ink-200'}`}>
                <Upload size={22} className="mx-auto text-brand-600" />
                <div className="font-medium mt-2">Glissez vos fichiers ici ou cliquez pour choisir</div>
                <div className="text-xs text-ink-500 mt-1">PDF, Word, Excel, images</div>
              </button>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              {errors.documents && <p className="text-xs text-red-700">{errors.documents}</p>}
              {form.documents.length > 0 && (
                <ul className="space-y-2">
                  {form.documents.map((f, i) => (
                    <li key={i} className="plate flex items-center gap-3 px-3 py-2.5 text-sm">
                      <FileText size={16} className="text-brand-600 shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="text-xs text-ink-500 shrink-0">{Math.max(1, Math.round(f.size / 1024))} Ko</span>
                      <button type="button" aria-label={`Retirer ${f.name}`} onClick={() => update('documents', form.documents.filter((_, j) => j !== i))} className="w-7 h-7 rounded-full hover:bg-ink-100 grid place-items-center"><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        {/* Navigation */}
        <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <button type="button" onClick={() => setStep(ids[pos - 1])} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ring-1 ring-ink-200 bg-white hover:bg-ink-50"><ArrowLeft size={16} /> Précédent</button>
            ) : (
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
            )}
          </div>
          <button type="button" onClick={next} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)] min-w-[9rem] justify-center">
            {!isLast ? <>Suivant <ArrowRight size={16} /></> : <><Save size={16} /> {editing ? 'Enregistrer' : 'Créer l’événement'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1">{label} <span className="text-red-600" aria-hidden>*</span></label>
      {children}
      {error ? <p className="text-xs text-red-700">{error}</p> : hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
