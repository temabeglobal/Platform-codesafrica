import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Save, Trash2, X } from 'lucide-react';
import { uid } from '../demo';
import { participantStages, programKinds, type Participant, type ParticipantStage, type Program, type ProgramKind, type WmtSession } from '../wmt';

/* Fenêtres d'ajout et de modification : programme, participante, session.
   Maquette : rien n'est encore enregistré en base. */

export const input = (bad?: string) =>
  `w-full min-w-0 h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;
const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

export function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium flex items-center gap-1">{label} {required && <span className="text-red-600" aria-hidden>*</span>}</span>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** Cadre commun : en-tête, contenu, pied avec « Supprimer » (après confirmation), « Annuler » et le bouton principal. */
export function Shell({ open, id, title, subtitle, onClose, onSubmit, submitLabel, submitIcon, onDelete, deleteText, children }: {
  open: boolean; id: string; title: string; subtitle: string; onClose: () => void; onSubmit: () => void;
  submitLabel: string; submitIcon: ReactNode; onDelete?: () => void; deleteText?: string; children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow; // une autre fenêtre peut déjà bloquer le défilement
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={id} className="font-display text-3xl tracking-wide">{title}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">{children}</div>
        </div>
        {confirming ? (
          <div className="shrink-0 px-6 py-4 bg-red-50 border-t border-red-200 flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-800 mr-auto">{deleteText}</p>
            <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-white">Annuler</button>
            <button type="button" onClick={onDelete} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Trash2 size={16} /> Supprimer</button>
          </div>
        ) : (
          <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center gap-3">
            {onDelete && (
              <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={16} /> Supprimer</button>
            )}
            <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
            <button type="button" onClick={onSubmit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)]">
              {submitIcon} {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Programme ---------- */

export function ProgramModal({ open, eventName, initial, linked, onClose, onSubmit, onDelete, icon }: {
  open: boolean; eventName: string; initial?: Program; icon: ReactNode;
  /** Participantes et sessions rattachées : supprimées avec le programme. */
  linked?: { participants: number; sessions: number };
  onClose: () => void; onSubmit: (p: Program) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProgramKind>('Women in MiningTech');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ''); setKind(initial?.kind ?? 'Women in MiningTech'); setDescription(initial?.description ?? '');
    setCapacity(initial ? String(initial.capacity) : ''); setStart(initial?.start ?? ''); setEnd(initial?.end ?? ''); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, initial]);
  const submit = () => {
    const e: Record<string, string> = {};
    const n = Number(capacity);
    if (!name.trim()) e.name = 'Le nom est requis.';
    if (!capacity.trim() || !Number.isInteger(n) || n <= 0) e.capacity = 'Indiquez un nombre de places.';
    if (!start) e.start = 'La date de début est requise.';
    if (!end) e.end = 'La date de fin est requise.';
    else if (start && end < start) e.end = 'La fin ne peut pas précéder le début.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ id: initial?.id ?? uid(), kind, name: name.trim(), description: description.trim(), capacity: n, start, end });
  };
  const clear = (k: string) => setErrors((x) => ({ ...x, [k]: undefined }));
  const extra = linked && (linked.participants || linked.sessions)
    ? ` Ses ${linked.participants} participante(s) et ${linked.sessions} session(s) seront aussi supprimées.` : '';
  return (
    <Shell open={open} id="program-modal-title" title={initial ? 'Modifier le programme' : 'Nouveau programme'} subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel={initial ? 'Enregistrer' : 'Créer'} submitIcon={initial ? <Save size={16} /> : icon}
      onDelete={initial ? onDelete : undefined} deleteText={`Supprimer « ${initial?.name} » ?${extra}`}>
      <Field label="Type">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de programme">
          {programKinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>{k}</button>)}
        </div>
      </Field>
      <Field label="Nom du programme" required error={errors.name}>
        <input ref={first} className={input(errors.name)} placeholder="Cohorte Lubumbashi 2027" value={name} onChange={(e) => { setName(e.target.value); clear('name'); }} />
      </Field>
      <Field label="Description">
        <textarea rows={3} className="w-full rounded-xl bg-[var(--sand)] px-4 py-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" placeholder="Objectif, public, format…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Places" required error={errors.capacity}>
          <input inputMode="numeric" className={input(errors.capacity)} placeholder="20" value={capacity} onChange={(e) => { setCapacity(e.target.value); clear('capacity'); }} />
        </Field>
        <Field label="Début" required error={errors.start}>
          <input type="date" className={input(errors.start)} value={start} onChange={(e) => { setStart(e.target.value); clear('start'); }} />
        </Field>
        <Field label="Fin" required error={errors.end}>
          <input type="date" className={input(errors.end)} value={end} min={start || undefined} onChange={(e) => { setEnd(e.target.value); clear('end'); }} />
        </Field>
      </div>
    </Shell>
  );
}

/* ---------- Participante ---------- */

export function ParticipantModal({ open, eventName, programs, initial, programId, onClose, onSubmit, onDelete, icon }: {
  open: boolean; eventName: string; programs: Program[]; initial?: Participant; icon: ReactNode;
  /** Programme proposé au départ (celui du filtre en cours). */
  programId?: string;
  onClose: () => void; onSubmit: (p: Participant) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [email, setEmail] = useState('');
  const [program, setProgram] = useState('');
  const [status, setStatus] = useState<ParticipantStage>('Candidature');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ''); setOrganisation(initial?.organisation ?? ''); setEmail(initial?.email ?? '');
    setProgram(initial?.programId ?? programId ?? (programs.length === 1 ? programs[0].id : '')); setStatus(initial?.status ?? 'Candidature'); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Le nom est requis.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Adresse e-mail invalide.';
    if (!program) e.program = 'Choisissez un programme.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ id: initial?.id ?? uid(), name: name.trim(), organisation: organisation.trim(), email: email.trim(), programId: program, status });
  };
  const clear = (k: string) => setErrors((x) => ({ ...x, [k]: undefined }));
  return (
    <Shell open={open} id="participant-modal-title" title={initial ? 'Modifier la participante' : 'Ajouter une participante'} subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel={initial ? 'Enregistrer' : 'Ajouter'} submitIcon={initial ? <Save size={16} /> : icon}
      onDelete={initial ? onDelete : undefined} deleteText={`Retirer « ${initial?.name} » du programme ? Cette action est définitive.`}>
      <Field label="Nom complet" required error={errors.name}>
        <input ref={first} className={input(errors.name)} placeholder="Prénom Nom" value={name} onChange={(e) => { setName(e.target.value); clear('name'); }} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Fonction ou établissement">
          <input className={input()} placeholder="Ingénieure, étudiante…" value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <input type="email" className={input(errors.email)} placeholder="nom@exemple.cd" value={email} onChange={(e) => { setEmail(e.target.value); clear('email'); }} />
        </Field>
      </div>
      <Field label="Programme" required error={errors.program}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Programme">
          {programs.map((p) => <button key={p.id} type="button" role="radio" aria-checked={program === p.id} onClick={() => { setProgram(p.id); clear('program'); }} className={pill(program === p.id)}>{p.name}</button>)}
        </div>
      </Field>
      <Field label="Étape">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Étape">
          {participantStages.map((s) => <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={pill(status === s)}>{s}</button>)}
        </div>
      </Field>
    </Shell>
  );
}

/* ---------- Session ---------- */

export function SessionModal({ open, eventName, programs, initial, programId, onClose, onSubmit, onDelete, icon }: {
  open: boolean; eventName: string; programs: Program[]; initial?: WmtSession; programId?: string; icon: ReactNode;
  onClose: () => void; onSubmit: (s: WmtSession) => void; onDelete?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [program, setProgram] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? ''); setProgram(initial?.programId ?? programId ?? (programs.length === 1 ? programs[0].id : ''));
    setDate(initial?.date ?? ''); setTime(initial?.time ?? ''); setPlace(initial?.place ?? ''); setSpeaker(initial?.speaker ?? ''); setErrors({});
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const submit = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Le titre est requis.';
    if (!program) e.program = 'Choisissez un programme.';
    if (!date) e.date = 'La date est requise.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ id: initial?.id ?? uid(), programId: program, title: title.trim(), date, time, place: place.trim(), speaker: speaker.trim() });
  };
  const clear = (k: string) => setErrors((x) => ({ ...x, [k]: undefined }));
  return (
    <Shell open={open} id="session-modal-title" title={initial ? 'Modifier la session' : 'Planifier une session'} subtitle={`Pour « ${eventName} »`}
      onClose={onClose} onSubmit={submit} submitLabel={initial ? 'Enregistrer' : 'Planifier'} submitIcon={initial ? <Save size={16} /> : icon}
      onDelete={initial ? onDelete : undefined} deleteText={`Supprimer la session « ${initial?.title} » ? Cette action est définitive.`}>
      <Field label="Titre de la session" required error={errors.title}>
        <input ref={first} className={input(errors.title)} placeholder="Atelier, visite de site, module…" value={title} onChange={(e) => { setTitle(e.target.value); clear('title'); }} />
      </Field>
      <Field label="Programme" required error={errors.program}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Programme">
          {programs.map((p) => <button key={p.id} type="button" role="radio" aria-checked={program === p.id} onClick={() => { setProgram(p.id); clear('program'); }} className={pill(program === p.id)}>{p.name}</button>)}
        </div>
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Date" required error={errors.date}>
          <input type="date" className={input(errors.date)} value={date} onChange={(e) => { setDate(e.target.value); clear('date'); }} />
        </Field>
        <Field label="Heure">
          <input type="time" className={input()} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Lieu">
          <input className={input()} placeholder="Salle, ville ou « En ligne »" value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
        <Field label="Intervenant·e">
          <input className={input()} placeholder="Nom de la personne qui anime" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
        </Field>
      </div>
    </Shell>
  );
}
