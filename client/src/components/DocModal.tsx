import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, FilePlus2, Paperclip, Save, Trash2, X } from 'lucide-react';
import { uploadFile } from '../cloud/neon';
import { useEvents } from '../events';
import { defaultDirection, docKinds, docStatuses, uid, type DocDirection, type DocKind, type ProviderDoc } from '../demo';

/* Ajouter ou modifier une pièce du dossier d'un prestataire (devis, commande, facture).
   Maquette : seul le nom du fichier joint est gardé, rien n'est envoyé ni enregistré en base. */

interface Props {
  open: boolean;
  providerName: string;
  initial?: ProviderDoc;
  onClose: () => void;
  onSubmit: (d: ProviderDoc) => void;
  onDelete?: () => void;
}

type Errors = Partial<Record<'ref' | 'date' | 'amount', string>>;
const today = () => new Date().toISOString().slice(0, 10);

export default function DocModal({ open, providerName, initial, onClose, onSubmit, onDelete }: Props) {
  const [kind, setKind] = useState<DocKind>('Devis');
  const [direction, setDirection] = useState<DocDirection>('reçu');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  // Fichier choisi dans cette fenêtre (à envoyer) et clé d'un fichier déjà stocké en ligne.
  const [file, setFile] = useState<File | undefined>();
  const [fileKey, setFileKey] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const { cloud } = useEvents();
  const canUpload = cloud.enabled && !!cloud.email && cloud.status !== 'offline';
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = !!initial;

  useEffect(() => {
    if (!open) return;
    const k = initial?.kind ?? 'Devis';
    setKind(k); setDirection(initial?.direction ?? defaultDirection[k]); setRef(initial?.ref ?? ''); setDate(initial?.date ?? today());
    setAmount(initial ? String(initial.amount) : ''); setStatus(initial?.status ?? docStatuses[k][0]); setFileName(initial?.fileName); setFile(undefined); setFileKey(initial?.fileKey); setFileError(undefined);
    setNote(initial?.note ?? ''); setErrors({}); setConfirming(false);
    const t = setTimeout(() => first.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, initial, onClose]);

  if (!open) return null;

  // Changer de type de pièce propose le sens et le statut habituels.
  const chooseKind = (k: DocKind) => {
    setKind(k);
    if (!editing) setDirection(defaultDirection[k]);
    if (!docStatuses[k].includes(status)) setStatus(docStatuses[k][0]);
  };

  const submit = async () => {
    const e: Errors = {};
    const n = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!ref.trim()) e.ref = 'La référence est requise.';
    if (!date) e.date = 'La date est requise.';
    if (!amount.trim() || !Number.isFinite(n) || n < 0) e.amount = 'Indiquez un montant valide.';
    setErrors(e);
    if (Object.keys(e).length) return;
    // Connecté : le fichier part dans le stockage en ligne. Sinon, seul son nom est noté (comme avant).
    let key = fileName ? fileKey : undefined;
    if (file && canUpload) {
      setSending(true); setFileError(undefined);
      try { key = (await uploadFile(file)).key; }
      catch (err) { setSending(false); setFileError(err instanceof Error ? err.message : 'L’envoi du fichier a échoué.'); return; }
      setSending(false);
    }
    onSubmit({ id: initial?.id ?? uid(), kind, direction, ref: ref.trim(), date, amount: n, status, fileName, fileKey: key, note: note.trim() || undefined });
  };

  const input = (bad?: string) =>
    `w-full h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 transition focus:ring-2 focus:ring-brand-500 ${bad ? 'ring-red-400' : 'ring-ink-200'}`;
  const pill = (on: boolean) => `px-3.5 py-2 rounded-full text-sm ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="doc-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="doc-modal-title" className="font-display text-3xl tracking-wide">{editing ? 'Modifier la pièce' : 'Ajouter une pièce'}</h2>
              <p className="text-sm text-white/75 mt-1 truncate">Dossier « {providerName} »</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
            <Field label="Type de pièce">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de pièce">
                {docKinds.map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => chooseKind(k)} className={pill(kind === k)}>{k}</button>)}
              </div>
            </Field>
            <Field label="Sens">
              <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Sens">
                <button type="button" role="radio" aria-checked={direction === 'reçu'} onClick={() => setDirection('reçu')} className={`${pill(direction === 'reçu')} flex items-center gap-2 justify-center`}>
                  <ArrowDownLeft size={15} /> Reçue du prestataire
                </button>
                <button type="button" role="radio" aria-checked={direction === 'émis'} onClick={() => setDirection('émis')} className={`${pill(direction === 'émis')} flex items-center gap-2 justify-center`}>
                  <ArrowUpRight size={15} /> Émise par la plateforme
                </button>
              </div>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Référence" required error={errors.ref}>
                <input ref={first} className={input(errors.ref)} placeholder="DEV-2026-042" value={ref} onChange={(e) => { setRef(e.target.value); setErrors((x) => ({ ...x, ref: undefined })); }} />
              </Field>
              <Field label="Date" required error={errors.date}>
                <input type="date" className={input(errors.date)} value={date} onChange={(e) => { setDate(e.target.value); setErrors((x) => ({ ...x, date: undefined })); }} />
              </Field>
              <Field label="Montant ($)" required error={errors.amount}>
                <input inputMode="decimal" className={input(errors.amount)} placeholder="2 500" value={amount} onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); }} />
              </Field>
              <Field label="Statut">
                <select className={input()} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {docStatuses[kind].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Fichier">
              <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; setFile(f); setFileName(f?.name); setFileKey(undefined); setFileError(undefined); }} />
              {fileName ? (
                <div className="flex items-center gap-2 h-11 rounded-xl bg-[var(--sand)] ring-1 ring-ink-200 pl-3 pr-1.5 text-sm">
                  <Paperclip size={15} className="text-brand-600 shrink-0" /><span className="truncate">{fileName}</span>
                  <button type="button" onClick={() => { setFileName(undefined); setFile(undefined); setFileKey(undefined); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Retirer le fichier" className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-ink-400 hover:bg-ink-100"><X size={14} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-11 rounded-xl border border-dashed border-ink-300 text-sm text-ink-500 hover:border-brand-400 hover:text-brand-900 flex items-center justify-center gap-2 transition">
                  <Paperclip size={15} /> Joindre le document (PDF, image…)
                </button>
              )}
              {fileError && <p className="text-xs text-red-700 mt-1">{fileError}</p>}
              {file && !canUpload && <p className="text-xs text-ink-500 mt-1">Non connecté : seul le nom du fichier est noté. Connectez-vous pour l’enregistrer en ligne.</p>}
            </Field>
            <Field label="Note">
              <input className={input()} placeholder="Acompte de 50 %, détails…" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </div>

        {confirming ? (
          <div className="shrink-0 px-6 py-4 bg-red-50 border-t border-red-200 flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-800 mr-auto">Supprimer « {initial?.ref} » ? Cette action est définitive.</p>
            <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-white">Annuler</button>
            <button type="button" onClick={onDelete} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Trash2 size={16} /> Supprimer</button>
          </div>
        ) : (
          <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center gap-3">
            {editing && onDelete && (
              <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={16} /> Supprimer</button>
            )}
            <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
            <button type="button" onClick={submit} disabled={sending} className="disabled:opacity-60 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)]">
              {sending ? 'Envoi du fichier…' : editing ? <><Save size={16} /> Enregistrer</> : <><FilePlus2 size={16} /> Ajouter</>}
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
