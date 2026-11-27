import { useEffect, useRef, useState } from 'react';
import { Clock, Mic, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { useEvents } from '../events';
import { uid } from '../demo';
import { SPEAKER_STATUSES, dayLabel, speakerCounts, speakerStatusStyle, type Speaker, type SpeakerStatus } from '../programme';

/* Fiche d'une thématique : ses intervenants, avec leur statut (confirmé, en cours, empêché).
   Maquette : rien n'est encore enregistré en base. */

const initials = (name: string) =>
  name.replace(/\(.*?\)/g, '').replace(/^(M\.|Mme|Mlle|Dr|Pr)\s+/i, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function StatusBadge({ status }: { status: SpeakerStatus }) {
  const st = speakerStatusStyle[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${st.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} aria-hidden />{status}
    </span>
  );
}

export default function ThemeModal({ itemId, onClose, onEditSession, onDeleteSession, onToast, hidden }: {
  itemId: string | null;
  onClose: () => void;
  /** Ouvre la fenêtre de modification de la session (heure, thématique, modérateur). */
  onEditSession?: () => void;
  /** Retire la session du programme (après confirmation dans la fenêtre). */
  onDeleteSession?: () => void;
  onToast?: (msg: string) => void;
  /** Masquée pendant qu'une autre fenêtre est ouverte par-dessus. */
  hidden?: boolean;
}) {
  const { data: { programme }, updateProgramme } = useEvents();
  const item = programme.find((p) => p.id === itemId) ?? null;
  const [filter, setFilter] = useState<SpeakerStatus | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SpeakerStatus>('En cours');
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  useEffect(() => setAskDelete(false), [itemId]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', title: '' });
  const nameRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  const open = !!item;
  useEffect(() => {
    if (!open) return;
    setFilter(null); setName(''); setTitle(''); setStatus('En cours'); setError(''); setConfirmId(null); setEditId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !hiddenRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [open, itemId, onClose]);

  if (!item) return null;

  const setSpeakers = (change: (list: Speaker[]) => Speaker[]) =>
    updateProgramme((list) => list.map((p) => (p.id === item.id ? { ...p, speakers: change(p.speakers) } : p)));
  const toast = (m: string) => onToast?.(`${m} — enregistré sur cet appareil`);

  const add = () => {
    const n = name.trim();
    if (!n) { setError('Le nom de l’intervenant est requis.'); nameRef.current?.focus(); return; }
    if (item.speakers.some((s) => s.name.toLowerCase() === n.toLowerCase())) { setError(`${n} est déjà dans cette thématique.`); nameRef.current?.focus(); return; }
    setSpeakers((l) => [...l, { id: uid(), name: n, title: title.trim(), status }]);
    setName(''); setTitle(''); setStatus('En cours'); setError('');
    if (filter && filter !== status) setFilter(null);
    toast(`${n} ajouté·e (${status.toLowerCase()})`);
    nameRef.current?.focus();
  };
  const changeStatus = (s: Speaker, st: SpeakerStatus) => {
    if (s.status === st) return;
    setSpeakers((l) => l.map((x) => (x.id === s.id ? { ...x, status: st } : x)));
    toast(`${s.name} : ${st.toLowerCase()}`);
  };
  const remove = (s: Speaker) => {
    setSpeakers((l) => l.filter((x) => x.id !== s.id));
    setConfirmId(null);
    toast(`${s.name} retiré·e de la thématique`);
  };
  const saveEdit = (s: Speaker) => {
    const n = editForm.name.trim();
    if (!n) return;
    setSpeakers((l) => l.map((x) => (x.id === s.id ? { ...x, name: n, title: editForm.title.trim() } : x)));
    setEditId(null);
    toast(`${n} modifié·e`);
  };

  const counts = speakerCounts(item.speakers);
  const shown = filter ? item.speakers.filter((s) => s.status === filter) : item.speakers;
  const field = 'h-11 w-full min-w-0 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 transition focus:ring-2 focus:ring-brand-500';
  const chip = (on: boolean) => `shrink-0 flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-medium ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-white ring-ink-200 text-ink-700 hover:ring-brand-400'}`;

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 ${hidden ? 'hidden' : ''}`} role="dialog" aria-modal="true" aria-labelledby="theme-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-accent-400">Thématique</p>
              <h2 id="theme-modal-title" className="font-display text-3xl tracking-wide mt-1">{item.theme}</h2>
              <p className="text-sm text-white/75 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 first-letter:uppercase"><Clock size={14} /> {dayLabel(item.date)} · {item.start}{item.end && ` – ${item.end}`}</span>
                <span className="flex items-center gap-1.5"><Mic size={14} /> {item.moderator ? `Modération : ${item.moderator}` : 'Modérateur à désigner'}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-lg">Intervenants <span className="text-ink-500 font-normal text-sm">({item.speakers.length})</span></h3>
          </div>

          {item.speakers.length > 0 && (
            <div role="group" aria-label="Filtrer par statut" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button type="button" aria-pressed={!filter} onClick={() => setFilter(null)} className={chip(!filter)}>
                Tous <span className={`text-xs tabular-nums ${!filter ? 'text-accent-400' : 'text-ink-400'}`}>{item.speakers.length}</span>
              </button>
              {SPEAKER_STATUSES.map((st) => (
                <button key={st} type="button" aria-pressed={filter === st} onClick={() => setFilter(st)} className={chip(filter === st)} title={speakerStatusStyle[st].hint}>
                  <span className={`w-2 h-2 rounded-full ${speakerStatusStyle[st].dot}`} aria-hidden />{st}
                  <span className={`text-xs tabular-nums ${filter === st ? 'text-accent-400' : 'text-ink-400'}`}>{counts[st]}</span>
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-2">
            {shown.map((s) => (
              <li key={s.id} className="bg-white rounded-2xl ring-1 ring-ink-200 p-3.5">
                {editId === s.id ? (
                  <form className="grid sm:grid-cols-[1fr_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); saveEdit(s); }}>
                    <input autoFocus aria-label="Nom" className={field} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    <input aria-label="Fonction ou organisation" className={field} placeholder="Fonction ou organisation" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditId(null)} className="px-4 h-11 rounded-xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
                      <button type="submit" className="px-4 h-11 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">Enregistrer</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="relative w-10 h-10 shrink-0 rounded-full bg-brand-950 text-accent-400 grid place-items-center text-sm font-semibold">
                      {initials(s.name)}
                      <span className={`absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white ${speakerStatusStyle[s.status].dot}`} aria-hidden />
                    </span>
                    <div className="min-w-[11rem] flex-1">
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-sm text-ink-500 truncate">{s.title || 'Fonction à préciser'}</p>
                    </div>
                    {confirmId === s.id ? (
                      <div className="ml-auto flex items-center gap-2 text-sm">
                        <span className="text-ink-700">Retirer ?</span>
                        <button type="button" onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-lg font-semibold text-ink-700 hover:bg-ink-100">Non</button>
                        <button type="button" onClick={() => remove(s)} className="px-3 py-1.5 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700">Retirer</button>
                      </div>
                    ) : (
                      <div className="ml-auto flex items-center gap-1.5">
                        <div role="radiogroup" aria-label={`Statut de ${s.name}`} className="flex rounded-full bg-[var(--sand)] ring-1 ring-ink-200 p-0.5">
                          {SPEAKER_STATUSES.map((st) => (
                            <button key={st} type="button" role="radio" aria-checked={s.status === st} title={speakerStatusStyle[st].hint}
                              onClick={() => changeStatus(s, st)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${s.status === st ? speakerStatusStyle[st].on : 'text-ink-600 hover:text-brand-950'}`}>
                              {st}
                            </button>
                          ))}
                        </div>
                        <button type="button" aria-label={`Modifier ${s.name}`} onClick={() => { setEditId(s.id); setEditForm({ name: s.name, title: s.title }); }}
                          className="w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:bg-ink-100 hover:text-brand-950"><Pencil size={15} /></button>
                        <button type="button" aria-label={`Retirer ${s.name}`} onClick={() => setConfirmId(s.id)}
                          className="w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!item.speakers.length && <p className="text-sm text-ink-500">Aucun intervenant pour cette thématique. Ajoutez-en ci-dessous.</p>}
          {item.speakers.length > 0 && !shown.length && filter && (
            <p className="text-sm text-ink-500">Aucun intervenant « {filter.toLowerCase()} ». <button type="button" onClick={() => setFilter(null)} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></p>
          )}

          <form className="bg-white rounded-2xl ring-1 ring-ink-200 p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); add(); }} noValidate>
            <p className="text-sm font-semibold flex items-center gap-2"><UserPlus size={16} className="text-brand-600" /> Ajouter un intervenant</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input ref={nameRef} aria-label="Nom de l’intervenant" className={field} placeholder="Nom (ex. M. Kalonji)" value={name} aria-invalid={!!error}
                onChange={(e) => { setName(e.target.value); setError(''); }} />
              <input aria-label="Fonction ou organisation" className={field} placeholder="Fonction ou organisation (facultatif)" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="radiogroup" aria-label="Statut du nouvel intervenant" className="flex flex-wrap gap-2">
                {SPEAKER_STATUSES.map((st) => (
                  <button key={st} type="button" role="radio" aria-checked={status === st} onClick={() => setStatus(st)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ring-1 transition ${status === st ? speakerStatusStyle[st].on : 'bg-[var(--sand)] text-brand-900 ring-ink-200 hover:ring-brand-400'}`}>
                    {status !== st && <span className={`w-2 h-2 rounded-full ${speakerStatusStyle[st].dot}`} aria-hidden />}{st}
                  </button>
                ))}
              </div>
              <button type="submit" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600"><UserPlus size={16} /> Ajouter</button>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </form>
        </div>

        {askDelete && onDeleteSession ? (
          <div role="alert" className="shrink-0 flex flex-wrap items-center gap-2 px-6 py-4 border-t border-red-200 bg-red-50">
            <span className="min-w-0 flex-1 text-sm text-red-800">Supprimer « {item.theme} » du programme ? Ses intervenants seront retirés aussi.</span>
            <button type="button" onClick={() => setAskDelete(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-brand-900 hover:bg-white">Annuler</button>
            <button type="button" onClick={onDeleteSession} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Trash2 size={15} /> Supprimer</button>
          </div>
        ) : (
        <div className="shrink-0 flex flex-wrap justify-between gap-2 px-6 py-4 border-t border-ink-200 bg-white/60">
          <div className="flex flex-wrap gap-1">
            {onEditSession && (
              <button type="button" onClick={onEditSession} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-brand-800 hover:bg-ink-100">
                <Pencil size={15} /> Modifier la session
              </button>
            )}
            {onDeleteSession && (
              <button type="button" onClick={() => setAskDelete(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50">
                <Trash2 size={15} /> Supprimer la session
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900">Fermer</button>
        </div>
        )}
      </div>
    </div>
  );
}
