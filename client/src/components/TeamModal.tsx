import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, Crown, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { useEvents } from '../events';
import { uid } from '../demo';
import { initials } from '../pages/providers-ui';

/* Dossier d'une équipe : toutes les personnes et leur responsabilité, ajout et retrait de membres.
   Maquette : rien n'est encore enregistré en base. */

/** Initiales sans la civilité (M., Mme, Mlle). */
const nameInitials = (n: string) => initials(n.replace(/^(M\.|Mme|Mlle)\s+/, ''));

interface Props {
  teamId: string | null; onClose: () => void; onDeleted?: (name: string) => void;
  /** Ouvre la fenêtre de modification (nom, responsable). */
  onEdit?: () => void;
  /** Masquée pendant la modification, sans perdre la saisie en cours. */
  hidden?: boolean;
}

export default function TeamModal({ teamId, onClose, onDeleted, onEdit, hidden = false }: Props) {
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const { data, updateTeam, removeTeam } = useEvents();
  const team = data.teams.find((t) => t.id === teamId);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  // Personne en cours de modification (un membre, ou LEAD pour le responsable), et la saisie en cours.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editError, setEditError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const open = !!team;

  useEffect(() => {
    if (!open) return;
    setConfirm(null); setName(''); setRole(''); setError(''); setEditId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !hiddenRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, teamId, onClose]);

  if (!team) return null;
  const count = team.members.length + (team.lead ? 1 : 0);

  const add = () => {
    if (!name.trim()) { setError('Le nom est requis.'); nameRef.current?.focus(); return; }
    updateTeam(team.id, (t) => ({ ...t, members: [...t.members, { id: uid(), name: name.trim(), role: role.trim() }] }));
    setName(''); setRole(''); setError('');
    nameRef.current?.focus();
  };
  const TEAM = '__team'; // confirmation de suppression de l'équipe entière
  const deleteTeam = () => {
    const n = team.name;
    removeTeam(team.id);
    onClose();
    onDeleted?.(n);
  };
  const LEAD = '__lead';
  const PROMOTE = 'promote:'; // confirmation « nommer responsable », suivie de l'id du membre
  const startEdit = (id: string, nm: string, rl = '') => { setConfirm(null); setEditId(id); setEditName(nm); setEditRole(rl); setEditError(''); };
  const saveEdit = () => {
    if (!editId) return;
    const n = editName.trim();
    if (!n) { setEditError('Le nom est requis.'); return; }
    const r = editRole.trim();
    updateTeam(team.id, (t) => editId === LEAD
      ? { ...t, lead: n }
      : { ...t, members: t.members.map((m) => (m.id === editId ? { ...m, name: n, role: r } : m)) });
    setEditId(null);
  };
  /** Le membre devient responsable ; l'ancien responsable redevient membre de l'équipe. */
  const promote = (id: string) => {
    updateTeam(team.id, (t) => {
      const m = t.members.find((x) => x.id === id);
      if (!m) return t;
      const rest = t.members.filter((x) => x.id !== id);
      return { ...t, lead: m.name, members: t.lead ? [{ id: uid(), name: t.lead, role: 'Ancien responsable' }, ...rest] : rest };
    });
    setConfirm(null);
  };
  const editKeys = (e: ReactKeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setEditId(null); } };
  const small = 'h-9 w-full min-w-0 rounded-lg bg-[var(--sand)] px-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500';
  const editForm = (who: string, withRole: boolean) => (
    <form className="min-w-0 flex-1 space-y-2" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
      <div className={`grid gap-2 ${withRole ? 'sm:grid-cols-2' : ''}`}>
        <input autoFocus aria-label={who === LEAD ? 'Nom du responsable' : `Nom de ${who}`} placeholder="Nom *" value={editName} onKeyDown={editKeys}
          onChange={(e) => { setEditName(e.target.value); setEditError(''); }} className={`${small} ${editError ? 'ring-red-400' : ''}`} />
        {withRole && (
          <input aria-label={`Responsabilité de ${who}`} placeholder="Responsabilité (ex. Accueil des invités)" value={editRole} onKeyDown={editKeys}
            onChange={(e) => setEditRole(e.target.value)} className={small} />
        )}
      </div>
      <div className="flex items-center gap-1">
        {editError && <span className="text-xs text-red-700">{editError}</span>}
        <button type="button" onClick={() => setEditId(null)} className="ml-auto px-3 h-9 rounded-lg text-sm text-brand-900 hover:bg-ink-100">Annuler</button>
        <button type="submit" className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600"><Check size={14} /> Enregistrer</button>
      </div>
    </form>
  );
  const iconBtn = 'w-9 h-9 shrink-0 rounded-full grid place-items-center text-ink-400 transition';
  const remove = (id: string) => {
    updateTeam(team.id, (t) => ({ ...t, members: t.members.filter((m) => m.id !== id) }));
    setConfirm(null);
  };

  const field = 'h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 transition focus:ring-2 focus:ring-brand-500';

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 ${hidden ? 'hidden' : ''}`} role="dialog" aria-modal="true" aria-labelledby="team-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="team-modal-title" className="font-display text-3xl tracking-wide truncate">Équipe {team.name}</h2>
              <p className="text-sm text-white/75 mt-1">{count} {count > 1 ? 'personnes' : 'personne'}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {onEdit && (
                <button type="button" onClick={onEdit} aria-label={`Modifier l’équipe ${team.name}`} title="Modifier le nom et le responsable"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><Pencil size={16} /></button>
              )}
              <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
            </div>
          </div>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <ul className="bg-white rounded-2xl ring-1 ring-ink-200 divide-y divide-ink-100" aria-label="Membres de l’équipe">
            {team.lead ? (
              <li className={`flex gap-3 px-4 py-3 ${editId === LEAD ? 'items-start' : 'items-center'}`}>
                <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-500 text-white font-semibold text-sm grid place-items-center">{nameInitials(team.lead)}</span>
                {editId === LEAD ? editForm(LEAD, false) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{team.lead}</span>
                      <span className="flex items-center gap-1 text-xs text-royal-700"><Crown size={11} /> Responsable · pilote l’équipe</span>
                    </span>
                    <button type="button" onClick={() => startEdit(LEAD, team.lead)} aria-label={`Modifier le responsable ${team.lead}`} title="Modifier le nom du responsable"
                      className={`${iconBtn} hover:text-brand-900 hover:bg-ink-100`}><Pencil size={15} /></button>
                  </>
                )}
              </li>
            ) : (
              <li className="flex items-center gap-3 px-4 py-3 text-sm text-ink-500">
                <span className="w-10 h-10 shrink-0 rounded-xl border-2 border-dashed border-ink-200 grid place-items-center text-ink-400"><Crown size={15} /></span>
                <span>Responsable à désigner : cliquez sur la couronne d’un membre.</span>
              </li>
            )}
            {team.members.map((m) => (
              <li key={m.id} className={`flex gap-3 px-4 py-3 ${editId === m.id ? 'items-start' : 'items-center'} ${confirm === m.id ? 'bg-red-50' : confirm === PROMOTE + m.id ? 'bg-royal-300/20' : ''}`}>
                <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-900 text-accent-400 font-semibold text-sm grid place-items-center">{nameInitials(m.name)}</span>
                {confirm === m.id ? (
                  <>
                    <span className="min-w-0 flex-1 text-sm text-red-800">Retirer <b>{m.name}</b> de l’équipe ?</span>
                    <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-sm text-brand-900 hover:bg-white">Annuler</button>
                    <button type="button" onClick={() => remove(m.id)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Retirer</button>
                  </>
                ) : confirm === PROMOTE + m.id ? (
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 basis-48 text-sm text-brand-900">
                      Nommer <b>{m.name}</b> responsable ?{team.lead && <span className="block text-xs text-ink-500">{team.lead} redeviendra membre de l’équipe.</span>}
                    </span>
                    <div className="flex gap-1 ml-auto">
                      <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-sm text-brand-900 hover:bg-white">Annuler</button>
                      <button type="button" onClick={() => promote(m.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600"><Crown size={14} /> Nommer</button>
                    </div>
                  </div>
                ) : editId === m.id ? editForm(m.name, true) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{m.name}</span>
                      <span className={`block text-xs truncate ${m.role ? 'text-ink-500' : 'text-ink-400 italic'}`}>{m.role || 'Responsabilité à préciser'}</span>
                    </span>
                    <button type="button" onClick={() => { setEditId(null); setConfirm(PROMOTE + m.id); }} aria-label={`Nommer ${m.name} responsable`} title="Nommer responsable de l’équipe"
                      className={`${iconBtn} hover:text-royal-700 hover:bg-royal-300/30`}><Crown size={15} /></button>
                    <button type="button" onClick={() => startEdit(m.id, m.name, m.role)} aria-label={`Modifier ${m.name}`} title="Modifier le nom et la responsabilité"
                      className={`${iconBtn} hover:text-brand-900 hover:bg-ink-100`}><Pencil size={15} /></button>
                    <button type="button" onClick={() => { setEditId(null); setConfirm(m.id); }} aria-label={`Retirer ${m.name}`} title="Retirer de l’équipe"
                      className={`${iconBtn} hover:text-red-700 hover:bg-red-50`}><Trash2 size={15} /></button>
                  </>
                )}
              </li>
            ))}
            {!team.members.length && <li className="px-4 py-4 text-sm text-ink-500">Aucun membre pour l’instant.</li>}
          </ul>

          <div className="bg-white rounded-2xl ring-1 ring-ink-200 p-4 space-y-2">
            <p className="text-sm font-medium">Ajouter une personne</p>
            <div className="grid sm:grid-cols-2 gap-2 [&>input]:min-w-0 [&>input]:w-full">
              <input ref={nameRef} aria-label="Nom" placeholder="Nom *" className={`${field} ${error ? 'ring-red-400' : ''}`} value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <input aria-label="Responsabilité" placeholder="Responsabilité" className={field} value={role}
                onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button type="button" onClick={add} className="sm:col-span-2 sm:justify-self-end h-11 flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
                <UserPlus size={16} /> Ajouter à l’équipe
              </button>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </div>

        {confirm === TEAM ? (
          <div className="shrink-0 px-6 py-4 bg-red-50 border-t border-red-200 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-red-800">
              Supprimer l’équipe <b>{team.name}</b>{count ? ` et ses ${count} ${count > 1 ? 'personnes' : 'personne'}` : ''} ?
            </p>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setConfirm(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-brand-900 hover:bg-white">Annuler</button>
              <button type="button" onClick={deleteTeam} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex items-center gap-3">
            <button type="button" onClick={() => setConfirm(TEAM)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50">
              <Trash2 size={15} /> Supprimer l’équipe
            </button>
            <button type="button" onClick={onClose} className="ml-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}
