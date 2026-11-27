import { useState, type KeyboardEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, FolderInput, FolderPlus, GripVertical, Link2, Pencil, Plus, Trash2, Ungroup, UsersRound, X } from 'lucide-react';
import EventSwitcher from '../components/EventSwitcher';
import { useEvents } from '../events';
import { allSubtasks, fmtDate, isLate, uid, type Phase, type Subtask, type Task } from '../demo';

/* Détail d'une tâche : phases et sous-tâches, plus les « tâches sans phase » (inspiré de la vue projet de Timly).
   L'avancement de la tâche est calculé à partir des sous-tâches cochées. */

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
const count = (p: Phase) => ({ done: p.subtasks.filter((s) => s.done).length, total: p.subtasks.length });

export default function TaskDetail() {
  const { taskId } = useParams();
  const { current, data, updateTask } = useEvents();
  const task = data.tasks.find((t) => t.id === taskId);
  const [newPhase, setNewPhase] = useState<string | null>(null);

  // La tâche n'existe pas dans l'événement sélectionné (ex. on vient de changer d'événement) : retour à la liste.
  if (!task) return <Navigate to="/taches" replace />;

  const change = (fn: (t: Task) => Task) => updateTask(task.id, fn);
  const setPhases = (fn: (p: Phase[]) => Phase[]) => change((t) => ({ ...t, phases: fn(t.phases) }));
  const all = allSubtasks(task);
  const loose = task.loose ?? [];
  const setLoose = (fn: (l: Subtask[]) => Subtask[]) => change((t) => ({ ...t, loose: fn(t.loose ?? []) }));
  /** Range une sous-tâche sans phase dans une phase (à la fin). */
  const toPhase = (subId: string, phaseId: string) => change((t) => {
    const sub = (t.loose ?? []).find((x) => x.id === subId);
    if (!sub) return t;
    return { ...t, loose: (t.loose ?? []).filter((x) => x.id !== subId), phases: t.phases.map((p) => (p.id === phaseId ? { ...p, subtasks: [...p.subtasks, sub] } : p)) };
  });
  /** Sort une sous-tâche de sa phase : elle passe dans « Tâches sans phase ». */
  const outOfPhase = (phaseId: string, subId: string) => change((t) => {
    const sub = t.phases.find((p) => p.id === phaseId)?.subtasks.find((x) => x.id === subId);
    if (!sub) return t;
    return { ...t, phases: t.phases.map((p) => (p.id === phaseId ? { ...p, subtasks: p.subtasks.filter((x) => x.id !== subId) } : p)), loose: [...(t.loose ?? []), sub] };
  });
  const team = data.teams.find((x) => x.id === task.team);
  const done = all.filter((s) => s.done).length;
  const late = isLate(task);

  const createPhase = () => {
    const title = newPhase?.trim();
    if (!title) return;
    setPhases((ps) => [...ps, { id: uid(), title, subtasks: [] }]);
    setNewPhase(null);
  };

  return (
    <div>
      <div className="relative z-20 flex items-stretch gap-3 mb-8">
        <Link to="/taches" aria-label="Retour aux tâches" style={{ ['--fx' as string]: '#d4a83f', ['--fx-o' as string]: 0.18 }}
          className="tile-fx fx-sm shrink-0 flex items-center gap-2 px-4 sm:px-5 rounded-2xl bg-brand-950 text-white text-sm font-semibold shadow-[0_12px_32px_-16px_rgba(1,33,43,.6)]">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Retour aux tâches</span>
        </Link>
        <EventSwitcher />
      </div>

      <div className="eyebrow text-brand-800">{fmtDate(task.due)}{task.owner && ` · ${task.owner}`}</div>
      <h1 className="font-display text-4xl md:text-5xl leading-[0.95] tracking-wide mt-2">{task.title}</h1>
      <div className="flex flex-wrap items-center gap-3 mt-3 mb-8">
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${late ? 'bg-red-100 text-red-800' : task.status === 'Terminée' ? 'bg-accent-400/25 text-accent-700' : 'bg-ink-100 text-ink-700'}`}>{late ? 'En retard' : task.status}</span>
        {/* Équipe chargée de la tâche : modifiable ici (les équipes viennent du menu Équipe). */}
        <label className={`relative flex items-center gap-1.5 text-xs font-semibold pl-3 pr-8 py-1.5 rounded-full ${team ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`}>
          <UsersRound size={14} />
          <span className="sr-only">Équipe</span>
          <select value={team ? task.team : ''} onChange={(e) => change((t) => ({ ...t, team: e.target.value || undefined }))}
            disabled={!data.teams.length} className="appearance-none bg-transparent outline-none cursor-pointer" aria-label="Équipe chargée de la tâche">
            <option value="">{data.teams.length ? 'Choisir une équipe' : 'Aucune équipe (menu Équipe)'}</option>
            {data.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-3 pointer-events-none" />
        </label>
        {task.dependsOn && <span className="text-sm text-ink-500 flex items-center gap-1"><Link2 size={14} /> Après : {task.dependsOn}</span>}
      </div>

      {/* Progression globale */}
      <section className="relative overflow-hidden rounded-[28px] bg-brand-950 text-white p-6 md:p-7">
        <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
        <div className="relative">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold text-lg">Progression globale</h2>
            <span className="font-display text-3xl text-accent-400">{task.progress} %</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden"><div className="h-full bg-accent-400 rounded-full transition-[width] duration-500" style={{ width: `${task.progress}%` }} /></div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm">
            <span className="text-white/70">{task.phases.length} phase{task.phases.length > 1 ? 's' : ''}</span>
            <span className="text-white/70">{all.length} sous-tâche{all.length > 1 ? 's' : ''}</span>
            {loose.length > 0 && <span className="text-white/70">dont {loose.length} sans phase</span>}
            <span className="text-accent-400">{done} terminée{done > 1 ? 's' : ''}</span>
            <span className="text-accent-300">{all.length - done} restante{all.length - done > 1 ? 's' : ''}</span>
          </div>
          {!all.length && <p className="text-xs text-white/60 mt-2">Pas encore de sous-tâche : l’avancement suit le statut ({task.status === 'Terminée' ? '100 % car la tâche est terminée' : task.status === 'En cours' ? '50 % car elle est en cours' : '0 % tant qu’elle est à faire'}). Ajoutez des sous-tâches pour qu’il se calcule tout seul.</p>}
        </div>
      </section>

      <div className="my-6">
        {newPhase === null ? (
          <button type="button" onClick={() => setNewPhase('')} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
            <FolderPlus size={18} /> Nouvelle phase
          </button>
        ) : (
          <div className="tile p-4 flex flex-col sm:flex-row gap-2">
            <input autoFocus aria-label="Nom de la phase" placeholder="Nom de la phase (ex. Préparation)" value={newPhase}
              onChange={(e) => setNewPhase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createPhase(); if (e.key === 'Escape') setNewPhase(null); }}
              className="flex-1 h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
            <div className="flex gap-2">
              <button type="button" onClick={createPhase} disabled={!newPhase.trim()} className="h-11 px-4 rounded-xl text-sm font-semibold bg-brand-950 text-white disabled:opacity-40">Créer la phase</button>
              <button type="button" onClick={() => setNewPhase(null)} className="h-11 px-4 rounded-xl text-sm font-medium text-brand-900 hover:bg-ink-100">Annuler</button>
            </div>
          </div>
        )}
      </div>

      {task.phases.length === 0 ? (
        <div className="tile p-8 text-center">
          <div className="font-semibold">Aucune phase pour l’instant</div>
          <p className="text-sm text-ink-500 mt-1">Découpez « {task.title} » en phases, ou ajoutez directement des tâches sans phase ci-dessous.</p>
        </div>
      ) : (
        <Phases phases={task.phases} setPhases={setPhases} onOut={outOfPhase} />
      )}
      <LooseCard items={loose} phases={task.phases} setItems={setLoose} onToPhase={toPhase} />
      <p className="mt-8 text-xs text-ink-500">Maquette — « {current.name} », rien n’est encore enregistré en base.</p>
    </div>
  );
}

function Phases({ phases, setPhases, onOut }: { phases: Phase[]; setPhases: (fn: (p: Phase[]) => Phase[]) => void; onOut: (phaseId: string, subId: string) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (from: number, to: number) => setPhases((ps) => {
    if (to < 0 || to >= ps.length || from === to) return ps;
    const next = [...ps]; const [p] = next.splice(from, 1); next.splice(to, 0, p); return next;
  });
  const patch = (id: string, fn: (p: Phase) => Phase) => setPhases((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  return (
    <ol className="space-y-5">
      {phases.map((p, i) => {
        const c = count(p);
        return (
          <li key={p.id} className="md:grid md:grid-cols-[120px_1fr] md:gap-4 relative"
            draggable={dragId === p.id}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id); } }}
            onDrop={(e) => { e.preventDefault(); if (dragId) move(phases.findIndex((x) => x.id === dragId), i); setDragId(null); setOverId(null); }}>
            {/* Frise à gauche */}
            <div className="hidden md:flex items-start justify-end gap-2 pt-5 relative">
              {i < phases.length - 1 && <span className="absolute right-[7px] top-9 -bottom-5 border-l-2 border-dashed border-brand-300/60" />}
              <div className="text-right min-w-0">
                <div className="text-sm font-semibold truncate max-w-[90px]" title={p.title}>{p.title}</div>
                <div className="text-xs text-ink-500">{pct(c.done, c.total)} %</div>
              </div>
              <span className={`relative w-4 h-4 mt-0.5 rounded-full ring-4 ring-[var(--sand)] ${c.total && c.done === c.total ? 'bg-accent-500' : c.done ? 'bg-royal-400' : 'bg-ink-400'}`} />
            </div>
            <PhaseCard phase={p} index={i} last={i === phases.length - 1} dropTarget={overId === p.id && dragId !== p.id}
              onPatch={(fn) => patch(p.id, fn)} onDelete={() => setPhases((ps) => ps.filter((x) => x.id !== p.id))}
              onMove={(d) => move(i, i + d)} onGrab={() => setDragId(p.id)} onOut={(subId) => onOut(p.id, subId)} />
          </li>
        );
      })}
    </ol>
  );
}

function PhaseCard({ phase, index, last, dropTarget, onPatch, onDelete, onMove, onGrab, onOut }: {
  phase: Phase; index: number; last: boolean; dropTarget: boolean;
  onPatch: (fn: (p: Phase) => Phase) => void; onDelete: () => void; onMove: (d: number) => void; onGrab: () => void;
  onOut: (subId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState('');
  const { done, total } = count(phase);
  const complete = total > 0 && done === total;

  const addSub = () => {
    const title = draft.trim();
    if (!title) return;
    onPatch((p) => ({ ...p, subtasks: [...p.subtasks, { id: uid(), title, done: false }] }));
    setDraft('');
  };
  const rename = () => {
    const title = editing?.trim();
    if (title) onPatch((p) => ({ ...p, title }));
    setEditing(null);
  };
  const onHandleKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
  };
  const iconBtn = 'w-9 h-9 rounded-xl grid place-items-center text-ink-500 hover:bg-[var(--sand)] hover:text-brand-900 transition';

  return (
    <div className={`tile !rounded-[24px] transition ${dropTarget ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
        <button type="button" aria-label={complete ? `Rouvrir la phase ${phase.title}` : `Terminer la phase ${phase.title}`} disabled={!total}
          onClick={() => onPatch((p) => ({ ...p, subtasks: p.subtasks.map((s) => ({ ...s, done: !complete })) }))}
          className={`w-9 h-9 shrink-0 rounded-full grid place-items-center ring-2 transition ${complete ? 'bg-accent-500 ring-accent-500 text-white' : 'ring-ink-200 text-transparent hover:ring-brand-500'} disabled:opacity-40`}>
          <Check size={18} />
        </button>
        {editing !== null ? (
          <input autoFocus aria-label="Nom de la phase" value={editing} onChange={(e) => setEditing(e.target.value)} onBlur={rename}
            onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
            className="flex-1 min-w-0 h-10 rounded-xl bg-[var(--sand)] px-3 font-semibold outline-none ring-2 ring-brand-500" />
        ) : (
          <h3 className="flex-1 min-w-0 font-semibold text-lg truncate"><span className="md:hidden text-ink-500 mr-1">{index + 1}.</span>{phase.title}</h3>
        )}
        <span className="text-sm text-ink-500 shrink-0 tabular-nums">{done}/{total}</span>
        <div className="flex items-center shrink-0">
          <button type="button" aria-label={`Déplacer la phase ${phase.title} (flèches haut et bas)`} title="Glisser pour déplacer"
            onMouseDown={onGrab} onTouchStart={onGrab} onKeyDown={onHandleKey}
            className={`${iconBtn} hidden sm:grid cursor-grab active:cursor-grabbing ring-1 ring-ink-200 ${index === 0 && last ? 'opacity-40' : ''}`}><GripVertical size={16} /></button>
          <button type="button" aria-label={`Renommer la phase ${phase.title}`} onClick={() => setEditing(phase.title)} className={iconBtn}><Pencil size={16} /></button>
          {confirmDelete ? (
            <button type="button" onClick={onDelete} onBlur={() => setConfirmDelete(false)} autoFocus className="h-9 px-3 rounded-xl text-xs font-semibold bg-red-600 text-white">Supprimer ?</button>
          ) : (
            <button type="button" aria-label={`Supprimer la phase ${phase.title}`} onClick={() => setConfirmDelete(true)} className={`${iconBtn} hover:!text-red-700`}><Trash2 size={16} /></button>
          )}
          <button type="button" aria-label={open ? 'Replier' : 'Déplier'} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={iconBtn}>
            <ChevronDown size={18} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-100 px-4 sm:px-5 py-4 space-y-3">
          {total > 0 && <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden"><div className="h-full bg-brand-500 rounded-full transition-[width] duration-500" style={{ width: `${pct(done, total)}%` }} /></div>}
          {total === 0 ? (
            <p className="text-sm text-ink-500">Aucune sous-tâche. Ajoutez-en une ci-dessous.</p>
          ) : (
            <ul className="space-y-1">
              {phase.subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--sand)]">
                  <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.title}
                    onClick={() => onPatch((p) => ({ ...p, subtasks: p.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) }))}
                    className={`w-6 h-6 shrink-0 rounded-full grid place-items-center ring-2 transition ${s.done ? 'bg-accent-500 ring-accent-500 text-white' : 'ring-ink-200 text-transparent hover:ring-brand-500'}`}>
                    <Check size={14} />
                  </button>
                  <span className={`flex-1 min-w-0 truncate ${s.done ? 'line-through text-ink-400' : ''}`}>{s.title}</span>
                  <button type="button" aria-label={`Sortir ${s.title} de la phase`} title="Sortir de la phase (vers « Tâches sans phase »)" onClick={() => onOut(s.id)}
                    className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-brand-800 hover:bg-white sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition"><Ungroup size={14} /></button>
                  <button type="button" aria-label={`Retirer ${s.title}`} onClick={() => onPatch((p) => ({ ...p, subtasks: p.subtasks.filter((x) => x.id !== s.id) }))}
                    className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-red-700 hover:bg-white sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <input aria-label={`Ajouter une sous-tâche à ${phase.title}`} placeholder="Ajouter une sous-tâche…" value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub(); }}
              className="flex-1 min-w-0 h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
            <button type="button" onClick={addSub} disabled={!draft.trim()} className="h-11 px-4 shrink-0 rounded-xl text-sm font-semibold bg-brand-950 text-white flex items-center gap-1.5 disabled:opacity-40"><Plus size={16} /> Ajouter</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** « Tâches sans phase » : une liste simple de sous-tâches à cocher, rangées dans aucune phase. */
function LooseCard({ items, phases, setItems, onToPhase }: {
  items: Subtask[]; phases: Phase[];
  setItems: (fn: (l: Subtask[]) => Subtask[]) => void; onToPhase: (subId: string, phaseId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const done = items.filter((s) => s.done).length;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setItems((l) => [...l, { id: uid(), title, done: false }]);
    setDraft('');
  };
  const rename = () => {
    const title = editing?.title.trim();
    if (editing && title) setItems((l) => l.map((x) => (x.id === editing.id ? { ...x, title } : x)));
    setEditing(null);
  };
  const small = 'w-7 h-7 shrink-0 rounded-full grid place-items-center text-ink-400 hover:bg-white sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition';

  return (
    <section aria-labelledby="loose-title" className="mt-5 md:grid md:grid-cols-[120px_1fr] md:gap-4">
      <div className="hidden md:flex items-start justify-end gap-2 pt-5">
        <div className="text-right">
          <div className="text-sm font-semibold text-ink-500">Autres</div>
          <div className="text-xs text-ink-500">{items.length ? `${Math.round((done / items.length) * 100)} %` : '—'}</div>
        </div>
        <span className="w-4 h-4 mt-0.5 rounded-full border-2 border-dashed border-ink-400 bg-[var(--sand)]" />
      </div>
      <div className="rounded-[24px] border-2 border-dashed border-ink-200 bg-white/50">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-ink-100">
          <h3 id="loose-title" className="flex-1 font-semibold text-lg text-ink-600">Tâches sans phase</h3>
          <span className="text-sm text-ink-500 tabular-nums">{done}/{items.length}</span>
        </div>
        <div className="px-4 sm:px-5 py-4 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-ink-500">Pour les petites choses à faire qui n’entrent dans aucune phase. Ajoutez-en une ci-dessous.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--sand)]">
                  <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.title}
                    onClick={() => setItems((l) => l.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                    className={`w-6 h-6 shrink-0 rounded-full grid place-items-center ring-2 transition ${s.done ? 'bg-accent-500 ring-accent-500 text-white' : 'ring-ink-200 text-transparent hover:ring-brand-500'}`}>
                    <Check size={14} />
                  </button>
                  {editing?.id === s.id ? (
                    <input autoFocus aria-label="Modifier la tâche" value={editing.title} onChange={(e) => setEditing({ id: s.id, title: e.target.value })} onBlur={rename}
                      onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
                      className="flex-1 min-w-0 h-9 rounded-lg bg-white px-3 text-sm outline-none ring-2 ring-brand-500" />
                  ) : (
                    <span className={`flex-1 min-w-0 truncate ${s.done ? 'line-through text-ink-400' : ''}`}>{s.title}</span>
                  )}
                  {moving === s.id ? (
                    <select autoFocus aria-label={`Ranger ${s.title} dans une phase`} defaultValue="" onBlur={() => setMoving(null)}
                      onChange={(e) => { if (e.target.value) onToPhase(s.id, e.target.value); setMoving(null); }}
                      className="h-9 max-w-[45%] rounded-lg bg-white px-2 text-sm ring-1 ring-ink-200 outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="" disabled>Choisir une phase…</option>
                      {phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  ) : editing?.id !== s.id && (
                    <>
                      <button type="button" aria-label={`Renommer ${s.title}`} onClick={() => setEditing({ id: s.id, title: s.title })} className={`${small} hover:text-brand-800`}><Pencil size={14} /></button>
                      {phases.length > 0 && (
                        <button type="button" aria-label={`Ranger ${s.title} dans une phase`} title="Ranger dans une phase" onClick={() => setMoving(s.id)} className={`${small} hover:text-brand-800`}><FolderInput size={14} /></button>
                      )}
                      <button type="button" aria-label={`Retirer ${s.title}`} onClick={() => setItems((l) => l.filter((x) => x.id !== s.id))} className={`${small} hover:text-red-700`}><X size={14} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <input aria-label="Ajouter une tâche sans phase" placeholder="Ajouter une tâche…" value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              className="flex-1 min-w-0 h-11 rounded-xl bg-[var(--sand)] px-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
            <button type="button" onClick={add} disabled={!draft.trim()} className="h-11 px-4 shrink-0 rounded-xl text-sm font-semibold bg-brand-950 text-white flex items-center gap-1.5 disabled:opacity-40"><Plus size={16} /> Ajouter</button>
          </div>
        </div>
      </div>
    </section>
  );
}
