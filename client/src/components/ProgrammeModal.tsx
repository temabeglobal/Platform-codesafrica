import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Save } from 'lucide-react';
import { uid } from '../demo';
import { dayLabel, type ProgrammeItem } from '../programme';
import { Field, Shell, input } from './WmtModals';

/* Ajout ou modification d'une session du programme : jour, heure, thématique, modérateur.
   Maquette : rien n'est encore enregistré en base. */

const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition first-letter:uppercase ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

export default function ProgrammeModal({ open, eventName, days, defaultDate, initial, onClose, onSubmit, onDelete }: {
  open: boolean; eventName: string;
  /** Jours de l'événement, proposés en raccourci. */
  days: string[];
  defaultDate?: string;
  initial?: ProgrammeItem;
  onClose: () => void; onSubmit: (p: ProgrammeItem) => void; onDelete?: () => void;
}) {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [theme, setTheme] = useState('');
  const [moderator, setModerator] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? defaultDate ?? days[0] ?? ''); setStart(initial?.start ?? ''); setEnd(initial?.end ?? '');
    setTheme(initial?.theme ?? ''); setModerator(initial?.moderator ?? ''); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const clear = (k: string) => setErrors((x) => ({ ...x, [k]: undefined }));
  const submit = () => {
    const e: Record<string, string> = {};
    if (!theme.trim()) e.theme = 'La thématique est requise.';
    if (!date) e.date = 'Le jour est requis.';
    if (!start) e.start = 'L’heure de début est requise.';
    if (start && end && end <= start) e.end = 'La fin doit être après le début.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ id: initial?.id ?? uid(), date, start, end, theme: theme.trim(), moderator: moderator.trim(), speakers: initial?.speakers ?? [] });
  };

  return (
    <Shell open={open} id="programme-modal-title" title={initial ? 'Modifier la session' : 'Ajouter une session'} subtitle={`Programme de « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel={initial ? 'Enregistrer' : 'Ajouter au programme'}
      submitIcon={initial ? <Save size={16} /> : <CalendarPlus size={16} />}
      onDelete={initial ? onDelete : undefined} deleteText={`Retirer « ${initial?.theme} » du programme ? Cette action est définitive.`}>
      <Field label="Thématique" required error={errors.theme}>
        <input ref={first} className={input(errors.theme)} placeholder="Panel, atelier, cérémonie…" value={theme}
          onChange={(e) => { setTheme(e.target.value); clear('theme'); }} />
      </Field>
      <Field label="Jour" required error={errors.date}>
        <div className="space-y-2">
          {days.length > 0 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Jour de l’événement">
              {days.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={date === d} onClick={() => { setDate(d); clear('date'); }} className={pill(date === d)}>{dayLabel(d)}</button>
              ))}
            </div>
          )}
          <input type="date" aria-label="Autre jour" className={input(errors.date)} value={date} onChange={(e) => { setDate(e.target.value); clear('date'); }} />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Début" required error={errors.start}>
          <input type="time" className={input(errors.start)} value={start} onChange={(e) => { setStart(e.target.value); clear('start'); clear('end'); }} />
        </Field>
        <Field label="Fin" error={errors.end}>
          <input type="time" className={input(errors.end)} value={end} onChange={(e) => { setEnd(e.target.value); clear('end'); }} />
        </Field>
      </div>
      <Field label="Modérateur">
        <input className={input()} placeholder="Nom du modérateur (facultatif)" value={moderator} onChange={(e) => setModerator(e.target.value)} />
      </Field>
    </Shell>
  );
}
