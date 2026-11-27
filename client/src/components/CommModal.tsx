import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarPlus, Save, Trash2, X } from 'lucide-react';
import { commChannels, type CommItem } from '../demo';

/* Planifier une publication dans le calendrier de communication de l'événement actif.
   Maquette : rien n'est encore enregistré en base. */

interface Props {
  open: boolean;
  eventName: string;
  /** Date proposée au départ (le jour choisi dans le calendrier). */
  date?: string;
  /** Publication existante : la fenêtre passe en mode « Modifier ». */
  initial?: CommItem;
  onClose: () => void;
  onSubmit: (c: CommItem) => void;
  /** Mode « Modifier » : supprimer la publication (après confirmation). */
  onDelete?: () => void;
}

type Errors = Partial<Record<'subject' | 'date' | 'channel', string>>;

export default function CommModal({ open, eventName, date, initial, onClose, onSubmit, onDelete }: Props) {
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState('');
  const [channel, setChannel] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const editing = !!initial;
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSubject(initial?.subject ?? ''); setDay(initial?.date ?? date ?? ''); setChannel(initial?.channel ?? ''); setErrors({}); setConfirming(false);
    const t = setTimeout(() => first.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, date, initial, onClose]);

  if (!open) return null;

  const submit = () => {
    const e: Errors = {};
    if (!subject.trim()) e.subject = 'Le sujet est requis.';
    if (!day) e.date = 'La date est requise.';
    if (!channel) e.channel = 'Choisissez un canal.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ subject: subject.trim(), date: day, channel });
  };

  const input = (bad?: string) =>
    `w-full h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="comm-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="comm-modal-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier la publication' : 'Planifier une publication'}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">Pour « {eventName} »</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
            <Field label="Sujet de la publication" required error={errors.subject}>
              <input ref={first} className={input(errors.subject)} placeholder="Annonce des intervenantes" value={subject}
                onChange={(e) => { setSubject(e.target.value); setErrors((x) => ({ ...x, subject: undefined })); }} />
            </Field>
            <Field label="Date de publication" required error={errors.date}>
              <input type="date" className={input(errors.date)} value={day}
                onChange={(e) => { setDay(e.target.value); setErrors((x) => ({ ...x, date: undefined })); }} />
            </Field>
            <Field label="Canal" required error={errors.channel}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Canal">
                {commChannels.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={channel === c}
                    onClick={() => { setChannel(c); setErrors((x) => ({ ...x, channel: undefined })); }}
                    className={`px-3.5 py-2 rounded-full text-sm ring-1 transition ${channel === c ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {confirming ? (
          <div className="shrink-0 px-6 py-4 bg-red-50 border-t border-red-200 flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-800 mr-auto">Supprimer « {initial?.subject} » ? Cette action est définitive.</p>
            <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-white">Annuler</button>
            <button type="button" onClick={onDelete} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700">
              <Trash2 size={16} /> Supprimer
            </button>
          </div>
        ) : (
          <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center gap-3">
            {editing && onDelete && (
              <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={16} /> Supprimer
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
            <button type="button" onClick={submit} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)]">
              {editing ? <><Save size={16} /> Enregistrer</> : <><CalendarPlus size={16} /> Planifier</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium flex items-center gap-1">{label} {required && <span className="text-red-600" aria-hidden>*</span>}</span>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
