import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Save, X } from 'lucide-react';
import type { NewTask, Task, TaskStatus } from '../demo';
import { useEvents } from '../events';
import NameSuggest, { teamNames } from './NameSuggest';

/* Ajout d'une tâche à l'événement actif. Maquette : rien n'est encore enregistré en base. */

interface Props {
  open: boolean;
  eventName: string;
  /** Tâches existantes de l'événement, pour choisir une dépendance. */
  tasks: Task[];
  onClose: () => void;
  onSubmit: (t: NewTask) => void;
  /** Date limite déjà remplie (ex. jour choisi dans le calendrier). */
  defaultDue?: string;
}

const STATUSES: TaskStatus[] = ['À faire', 'En cours', 'Terminée'];
const empty = () => ({ title: '', owner: '', due: '', status: 'À faire' as TaskStatus, dependsOn: '' });
type Form = ReturnType<typeof empty>;
type Errors = Partial<Record<keyof Form, string>>;

export default function TaskModal({ open, eventName, tasks, onClose, onSubmit, defaultDue }: Props) {
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const first = useRef<HTMLInputElement>(null);
  const { data } = useEvents();
  const names = useMemo(() => teamNames(data.teams), [data.teams]);

  useEffect(() => {
    if (!open) return;
    setForm({ ...empty(), due: defaultDue ?? '' }); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = () => {
    const e: Errors = {};
    if (!form.title.trim()) e.title = 'Le titre est requis.';
    else if (tasks.some((t) => t.title.toLowerCase() === form.title.trim().toLowerCase())) e.title = 'Une tâche porte déjà ce titre.';
    if (!form.owner.trim()) e.owner = 'Le responsable est requis.';
    if (!form.due) e.due = 'La date limite est requise.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({
      title: form.title.trim(), owner: form.owner.trim(), due: form.due,
      status: form.status, progress: 0, dependsOn: form.dependsOn || undefined,
    });
  };

  const input = (bad?: string) =>
    `w-full h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="task-modal-title" className="font-display text-3xl tracking-wide">Nouvelle tâche</h2>
              <p className="text-sm text-white/75 mt-1 truncate">Pour « {eventName} »</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
            <Field label="Titre de la tâche" required error={errors.title}>
              <input ref={first} className={input(errors.title)} placeholder="Réserver la salle" value={form.title} onChange={(e) => update('title', e.target.value)} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Responsable" required error={errors.owner}>
                <NameSuggest className={input(errors.owner)} placeholder="Tapez un nom ou une équipe" label="Responsable" options={names} value={form.owner} onChange={(v) => update('owner', v)} />
              </Field>
              <Field label="Date limite" required error={errors.due}>
                <input type="date" className={input(errors.due)} value={form.due} onChange={(e) => update('due', e.target.value)} />
              </Field>
              <Field label="Statut">
                <select className={input()} value={form.status} onChange={(e) => update('status', e.target.value as TaskStatus)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Dépend de" hint={tasks.length ? 'Facultatif : la tâche qui doit être finie avant' : 'Aucune autre tâche dans cet événement'}>
                <select className={input()} value={form.dependsOn} onChange={(e) => update('dependsOn', e.target.value)} disabled={!tasks.length}>
                  <option value="">Aucune</option>
                  {tasks.map((t) => <option key={t.title} value={t.title}>{t.title}</option>)}
                </select>
              </Field>
            </div>
            <p className="text-xs text-ink-500">L’avancement se calcule tout seul à partir des sous-tâches, que vous ajouterez dans la fiche de la tâche.</p>
          </div>
        </div>

        <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
          <button type="button" onClick={submit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)]">
            <Save size={16} /> Ajouter la tâche
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1">{label} {required && <span className="text-red-600" aria-hidden>*</span>}</label>
      {children}
      {error ? <p className="text-xs text-red-700">{error}</p> : hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
