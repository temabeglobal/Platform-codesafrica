import { Mail, MessageCircle, Smartphone, Link2, Check, Plus, CalendarDays, CalendarPlus, List, ChevronRight, FileText, Pencil, ReceiptText, Trash2, Download, Loader2, ChevronDown, Search, BriefcaseBusiness } from 'lucide-react';
import { ChipMenu, contactLinks, initials, stageStyle } from './providers-ui';
import CommCalendar, { ChannelFilter, CommActions, useChannelFilter } from './CommCalendar';
import CommModal from '../components/CommModal';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TaskModal from '../components/TaskModal';
import LeadModal from '../components/LeadModal';
import RowMenu from '../components/RowMenu';
import TeamModal from '../components/TeamModal';
import NewTeamModal from '../components/NewTeamModal';
import ProviderModal, { type NewProvider } from '../components/ProviderModal';
import ExpenseModal from '../components/ExpenseModal';
import BudgetLineModal from '../components/BudgetLineModal';
import { DateFilterBar, useDateFilter } from '../components/DateFilter';
import { exportExpenses } from '../exportExpenses';
import PaymentBadge from '../components/PaymentBadge';
import { downloadSheet, slug } from '../excel';
import { allSubtasks, detailOf, fmtDate, isLate, uid, stagesFor, billingStatuses, type Billing, type BudgetLine, type CommItem, type Expense, type Lead, type ProviderStage, type Stage, type Subtask, type Task, type TaskStatus, providerStages } from '../demo';
import { useEvents } from '../events';

/** Message affiché quand l'événement actif n'a encore aucune donnée dans ce module. */
function Empty({ children }: { children: ReactNode }) {
  const { current } = useEvents();
  return (
    <div className="tile p-10 text-center">
      <div className="font-semibold">{children}</div>
      <p className="text-sm text-ink-500 mt-1">pour « {current.name} »</p>
    </div>
  );
}

const stageColor: Record<Stage, { bar: string; chip: string }> = {
  Prospect: { bar: 'bg-ink-400', chip: 'bg-ink-100 text-ink-700' },
  Contacté: { bar: 'bg-brand-400', chip: 'bg-brand-300/30 text-brand-800' },
  Relancé: { bar: 'bg-[#e0694b]', chip: 'bg-[#d0573a]/10 text-[#a83d24]' },
  'En cours': { bar: 'bg-royal-400', chip: 'bg-royal-300/40 text-royal-700' },
  Confirmé: { bar: 'bg-accent-500', chip: 'bg-accent-400/25 text-accent-700' },
};
const billingColor: Record<Billing | 'none', { dot: string; chip: string; label: string }> = {
  none: { dot: 'bg-ink-400', chip: 'bg-ink-100 text-ink-600', label: 'Pas encore facturé' },
  'Facture élaborée': { dot: 'bg-brand-400', chip: 'bg-brand-300/30 text-brand-800', label: 'Facture élaborée' },
  'Facture envoyée': { dot: 'bg-royal-400', chip: 'bg-royal-300/40 text-royal-700', label: 'Facture envoyée' },
  'Paiement reçu': { dot: 'bg-accent-500', chip: 'bg-accent-400/25 text-accent-700', label: 'Paiement reçu' },
};

/** Suivi des partenaires ou des sponsors, par étape ; pour les sponsors, la facturation en plus. */
export function Pipeline({ kind }: { kind: 'partenaires' | 'sponsors' }) {
  const { current, data: ev, addLead, updateLead, removeLead } = useEvents();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const data: Lead[] = kind === 'partenaires' ? ev.partners : ev.sponsors;
  const stages = stagesFor(kind);
  const one = kind === 'partenaires' ? 'partenaire' : 'sponsor';
  const [modal, setModal] = useState<{ lead?: Lead } | null>(null);
  const [billingFilter, setBillingFilter] = useState<Billing | 'none' | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [toast, setToast] = useState('');
  // Glisser-déposer d'une carte vers une autre étape (à la souris) : nom de la carte tirée et colonne survolée.
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const close = useCallback(() => setModal(null), []);
  // Une étape qui n'existe plus dans ce suivi (ex. ancien « Prospect » chez les sponsors) est rangée dans la première.
  const stageOf = (l: Lead): Stage => (stages.includes(l.stage) ? l.stage : stages[0]);
  const billingOf = (l: Lead): Billing | 'none' => l.billing ?? 'none';
  const shown = billingFilter ? data.filter((l) => billingOf(l) === billingFilter) : data;
  const flash = (m: string) => { setToast(`${m} — enregistré sur cet appareil`); setTimeout(() => setToast(''), 3500); };
  const submit = (l: Lead) => {
    if (modal?.lead) { updateLead(kind, modal.lead.name, l); flash(`« ${l.name} » modifié`); }
    else { addLead(kind, l); flash(`« ${l.name} » ajouté (${l.stage.toLowerCase()})`); }
    setModal(null);
  };
  const moveTo = (name: string, to: Stage) => {
    const l = data.find((x) => x.name === name);
    if (!l || stageOf(l) === to) return;
    updateLead(kind, l.name, { ...l, stage: to });
    flash(`« ${l.name} » déplacé vers « ${to} »`);
  };
  const removeOne = (l: Lead) => { removeLead(kind, l.name); setConfirmDel(null); flash(`« ${l.name} » supprimé`); };
  const confirmed = data.filter((l) => stageOf(l) === 'Confirmé');
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{data.length} {one}{data.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={() => setModal({})} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <Plus size={18} /> Ajouter un {one}
        </button>
      </div>
      <LeadModal open={!!modal} kind={kind} eventName={current.name} existing={data.map((l) => l.name)} initial={modal?.lead} onClose={close} onSubmit={submit} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
      {!data.length ? <Empty>Aucun {one} pour l’instant</Empty> : <>
      {/* Compteurs par étape : retirés chez les sponsors (le nombre est à côté du titre de chaque colonne). */}
      {kind === 'partenaires' && <div className="tile p-3">
        <div role="group" aria-label="Filtrer par étape" className="flex gap-2 overflow-x-auto">
          {stages.map((s, i) => {
            const n = data.filter((l) => stageOf(l) === s).length;
            const on = stageFilter === s;
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setStageFilter(on ? null : s)}
                className={`flex-1 min-w-[130px] text-left rounded-2xl p-4 relative overflow-hidden ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] ring-transparent hover:ring-brand-400'}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stageColor[s].bar}`} />
                <div className={`eyebrow ${on ? 'text-white/60' : 'text-ink-500'}`}>Étape {i + 1}</div>
                <div className="flex items-baseline gap-2 mt-1"><span className="font-display text-4xl">{n}</span><span className="text-sm font-medium">{s}</span></div>
              </button>
            );
          })}
        </div>
        {stageFilter && <p className="text-xs text-ink-500 mt-3 px-1">Filtré sur « {stageFilter} ». <button type="button" onClick={() => setStageFilter(null)} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></p>}
      </div>}

      {kind === 'sponsors' && <div className="grid gap-5 lg:grid-cols-[340px_1fr] items-start">
        <SponsorBudget sponsors={data} />
        <div className="tile p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="font-semibold">Facturation</h2>
            <span className="text-xs text-ink-500">
              {confirmed.length} sponsor{confirmed.length > 1 ? 's' : ''} confirmé{confirmed.length > 1 ? 's' : ''} · {confirmed.filter((l) => !l.billing).length} à facturer
            </span>
          </div>
          <div role="group" aria-label="Filtrer par facturation" className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['none', ...billingStatuses] as const).map((b) => {
              const n = data.filter((l) => billingOf(l) === b).length;
              const on = billingFilter === b;
              return (
                <button key={b} type="button" aria-pressed={on} onClick={() => setBillingFilter(on ? null : b)}
                  className={`text-left rounded-2xl p-3.5 ring-1 transition ${on ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] ring-transparent hover:ring-brand-400'}`}>
                  <span className="flex items-center gap-2 text-sm font-medium"><span className={`w-2.5 h-2.5 rounded-full ${billingColor[b].dot}`} />{billingColor[b].label}</span>
                  <span className="font-display text-3xl mt-1 block">{n}</span>
                </button>
              );
            })}
          </div>
          {billingFilter && <p className="text-xs text-ink-500 mt-3">Filtré sur « {billingColor[billingFilter].label} ». <button type="button" onClick={() => setBillingFilter(null)} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></p>}
        </div>
      </div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.filter((s) => !stageFilter || s === stageFilter).map((s) => (
          <div key={s} aria-label={`Étape ${s}`}
            onDragOver={(e) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overStage !== s) setOverStage(s); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage((o) => (o === s ? null : o)); }}
            onDrop={(e) => { e.preventDefault(); const name = dragging ?? e.dataTransfer.getData('text/plain'); setDragging(null); setOverStage(null); if (name) moveTo(name, s); }}
            className={`space-y-3 rounded-[24px] p-1.5 -m-1.5 min-h-[120px] transition ${dragging ? 'outline-2 outline-dashed outline-ink-200' : ''} ${overStage === s && dragging ? '!outline-brand-400 bg-brand-50/60' : ''}`}>
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-ink-700"><span className={`w-2.5 h-2.5 rounded-full ${stageColor[s].bar}`} />{s}<span className="text-ink-400 font-normal tabular-nums">{shown.filter((l) => stageOf(l) === s).length}</span></div>
            {shown.filter((l) => stageOf(l) === s).map((l) => (
              <div key={l.name} draggable={confirmDel !== l.name} title="Glisser vers une autre étape"
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.name); setDragging(l.name); }}
                onDragEnd={() => { setDragging(null); setOverStage(null); }}
                className={`tile relative overflow-hidden transition hover:ring-brand-400 cursor-grab active:cursor-grabbing ${dragging === l.name ? 'opacity-40' : ''} ${confirmDel === l.name ? 'ring-2 ring-red-300' : ''}`}>
              <div className={`absolute left-0 right-0 top-0 h-1.5 ${stageColor[s].bar}`} />
              <div className="absolute top-3 right-2 z-10">
                <RowMenu name={l.name} deleteLabel={`Supprimer le ${one}`} onDelete={() => setConfirmDel(l.name)} />
              </div>
              <button type="button" onClick={() => setModal({ lead: l })} aria-label={`Modifier ${l.name}`}
                className="p-4 pr-12 w-full text-left">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${stageColor[s].chip}`}>{s}</span>
                <div className="font-semibold mt-3 leading-snug">{l.name}</div>
                <div className="text-xs text-ink-500 mt-1">{l.contact}</div>
                {kind === 'sponsors' && (
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display text-2xl">{l.budget ? fmt(l.budget) : '—'}</span>
                    <span className="text-xs text-ink-500">{l.budget ? 'budget sponsoring' : 'budget à préciser'}</span>
                  </div>
                )}
                {l.note && <div className="text-xs text-ink-600 mt-2 italic">{l.note}</div>}
                {kind === 'sponsors' && (l.billing || s === 'Confirmé') && (
                  <span className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${billingColor[billingOf(l)].chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${billingColor[billingOf(l)].dot}`} />{billingColor[billingOf(l)].label}
                  </span>
                )}
              </button>
              {confirmDel === l.name && (
                <div role="alertdialog" aria-label={`Confirmer la suppression de ${l.name}`} className="mx-4 mb-4 rounded-2xl bg-red-50 ring-1 ring-red-200 p-3">
                  <p className="text-sm text-red-800">
                    Supprimer « {l.name} » ?{kind === 'sponsors' && (l.billing === 'Paiement reçu' ? ' Il sera aussi retiré des exposants et du budget sponsoring.' : ' Il sera aussi retiré du budget sponsoring.')}
                  </p>
                  <div className="flex justify-end gap-2 mt-2">
                    <button type="button" onClick={() => setConfirmDel(null)} className="px-3.5 py-2 rounded-xl text-sm font-semibold text-ink-700 hover:bg-white">Annuler</button>
                    <button type="button" onClick={() => removeOne(l)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Trash2 size={15} /> Supprimer</button>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}

/** Budget sponsoring : ce que les sponsors apportent. Calculé à part, jamais mélangé au budget de l'événement ni affiché à l'accueil. */
function SponsorBudget({ sponsors }: { sponsors: Lead[] }) {
  const sum = (list: Lead[]) => list.reduce((a, l) => a + (l.budget ?? 0), 0);
  const total = sum(sponsors);
  const confirmed = sum(sponsors.filter((l) => l.stage === 'Confirmé'));
  const received = sum(sponsors.filter((l) => l.billing === 'Paiement reçu'));
  const pending = total - confirmed;
  const missing = sponsors.filter((l) => !l.budget).length;
  const pct = total ? Math.min(received / total, 1) : 0;
  const r = 70, c = 2 * Math.PI * r;
  const line = (dot: string, label: string, value: number) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-ink-600"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} />{label}</span>
      <b className="tabular-nums">{fmt(value)}</b>
    </div>
  );
  return (
    <div className="tile p-6 sm:p-8" aria-label="Budget sponsoring">
      <h2 className="font-semibold text-center">Budget sponsoring</h2>
      <div className="grid place-items-center mt-3">
        <svg viewBox="0 0 180 180" className="w-44 h-44 -rotate-90" aria-hidden>
          <circle cx="90" cy="90" r={r} fill="none" stroke="#e4e9ee" strokeWidth="18" />
          {pct > 0 && <circle cx="90" cy="90" r={r} fill="none" stroke="#00a3cc" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />}
        </svg>
        <div className="-mt-[7.5rem] mb-14 text-center">
          <div className="font-display text-4xl">{Math.round(pct * 100)}%</div>
          <div className="text-xs text-ink-500">déjà reçu</div>
        </div>
      </div>
      <div className="text-center text-sm"><b>{fmt(received)}</b> reçus sur {fmt(total)}</div>
      <div className="mt-5 pt-4 border-t border-ink-100 space-y-2">
        {line('bg-accent-500', 'Confirmé', confirmed)}
        {line('bg-royal-400', 'En discussion', pending)}
        <div className="flex items-center justify-between gap-3 text-sm pt-2 border-t border-ink-100"><span className="font-semibold">Total sponsoring</span><b className="font-display text-xl">{fmt(total)}</b></div>
      </div>
      {missing > 0 && <p className="text-xs text-ink-500 mt-3">{missing} sponsor{missing > 1 ? 's' : ''} sans montant indiqué.</p>}
    </div>
  );
}

/** Frise chronologique des tâches + ajout d'une tâche à l'événement actif. */
export function TasksView() {
  const { current, data: { tasks }, addTask } = useEvents();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={() => setOpen(true)} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <Plus size={18} /> Nouvelle tâche
        </button>
      </div>
      {tasks.length ? <TaskTimeline tasks={tasks} /> : <Empty>Aucune tâche pour l’instant</Empty>}
      <TaskModal open={open} eventName={current.name} tasks={tasks} onClose={close} onSubmit={(t) => { addTask(t); setOpen(false); }} />
    </div>
  );
}

const TASK_STATUSES: TaskStatus[] = ['À faire', 'En cours', 'Terminée'];
const taskChip = (v: string) => (v === 'En retard' ? 'bg-red-100 text-red-800' : v === 'Terminée' ? 'bg-accent-400/25 text-accent-700' : v === 'En cours' ? 'bg-royal-50 text-royal-700' : 'bg-ink-100 text-ink-700');

/** Change à la main le statut d'une tâche SANS phase (avec des phases, il suit la progression globale).
    Si elle a des tâches sans phase, la progression en dépend : « Terminée » les coche toutes, « À faire » les décoche toutes. */
const withStatus = (t: Task, status: TaskStatus): Task => {
  if (!allSubtasks(t).length) return { ...t, status };
  const done = status === 'Terminée';
  if (status === 'En cours') return t;
  const tick = (l: Subtask[]) => l.map((x) => ({ ...x, done }));
  return { ...t, phases: t.phases.map((p) => ({ ...p, subtasks: tick(p.subtasks) })), loose: t.loose && tick(t.loose) };
};

function TaskTimeline({ tasks }: { tasks: Task[] }) {
  const { updateTask } = useEvents();
  const [toast, setToast] = useState('');
  const setStatus = (t: Task, v: string) => {
    if (v === t.status) return;
    const subs = allSubtasks(t).length;
    updateTask(t.id, (x) => withStatus(x, v as TaskStatus));
    const extra = subs && v === 'Terminée' ? ' (sous-tâches cochées)' : subs && v === 'À faire' ? ' (sous-tâches décochées)' : '';
    setToast(`« ${t.title} » : ${v.toLowerCase()}${extra} — enregistré sur cet appareil`);
    setTimeout(() => setToast(''), 3500);
  };
  const dot = (s: string) => (s === 'Terminée' ? 'bg-accent-500' : s === 'En retard' ? 'bg-red-600' : s === 'En cours' ? 'bg-royal-400' : 'bg-ink-400');
  const rows = [...tasks].sort((a, b) => a.due.localeCompare(b.due)).map((t) => ({ ...t, label: isLate(t) ? 'En retard' : t.status }));
  return (
    <>
    <ol className="relative border-l-2 border-dashed border-brand-300/60 ml-3 space-y-5">
      {rows.map((t) => (
        <li key={t.id} className="pl-8 relative">
          <span className={`absolute -left-[11px] top-5 w-5 h-5 rounded-full ring-4 ring-[var(--sand)] grid place-items-center text-white ${dot(t.label)}`}>
            {t.label === 'Terminée' && <Check size={12} />}
          </span>
          <div className="tile p-5 grid md:grid-cols-[1fr_auto] gap-3 items-center relative">
            <Link to={`/taches/${t.id}`} aria-label={`Ouvrir la tâche ${t.title}`} className="absolute inset-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400" />
            <div>
              <div className="eyebrow text-brand-800">{fmtDate(t.due)} · {t.owner}{t.phases.length > 0 && ` · ${t.phases.length} phase${t.phases.length > 1 ? 's' : ''}`}{!!t.loose?.length && ` · ${t.loose.length} sans phase`}</div>
              <div className="font-semibold text-lg mt-1">{t.title}</div>
              {t.dependsOn && <div className="text-xs text-ink-500 mt-1.5 flex items-center gap-1"><Link2 size={12} /> Après : {t.dependsOn}</div>}
              <div className="h-1.5 rounded-full bg-ink-100 mt-3 max-w-md overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${t.progress}%` }} /></div>
            </div>
            <div className="relative z-10 w-fit flex items-center gap-2">
              {t.label === 'En retard' && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-800">En retard</span>}
              {t.phases.length > 0 ? (
                // Avec des phases, le statut suit la progression globale : 0 % à faire, en cours dès qu'elle avance, terminée à 100 %.
                <span title="Calculé automatiquement à partir de la progression globale" className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${taskChip(t.status)}`}>{t.status}</span>
              ) : (
                <ChipMenu label="Statut" value={t.status} chip={taskChip}
                  options={allSubtasks(t).length && t.status !== 'En cours' ? TASK_STATUSES.filter((s) => s !== 'En cours') : TASK_STATUSES}
                  onChange={(v) => setStatus(t, v)} />
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
    {toast && (
      <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
        <Check size={16} className="text-accent-400 shrink-0" /> {toast}
      </div>
    )}
    </>
  );
}

const fmt = (n: number) => n.toLocaleString('fr-FR') + ' $';

/** Anneau de budget + postes. */
export function BudgetView() {
  const { current, data: { budget }, addExpense, updateExpense, removeExpense } = useEvents();
  // Fenêtre « Ajouter une dépense » : fermée (null), ou ouverte avec un poste éventuellement déjà choisi.
  const [adding, setAdding] = useState<{ poste?: string; expense?: Expense } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const close = useCallback(() => setAdding(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const submit = (poste: string, e: Expense, plannedAmount?: number) => {
    if (adding?.expense && adding.poste) {
      updateExpense(adding.poste, e, poste, plannedAmount);
      setToast(`« ${e.label} » modifiée — enregistré sur cet appareil`);
    } else {
      addExpense(poste, e, plannedAmount);
      setToast(`${fmt(e.amount)} ajoutés à « ${poste} » — enregistré sur cet appareil`);
    }
    setAdding(null);
    // La dépense a pu changer de poste : le détail suit la dépense.
    if (detail) setDetail(poste);
    setTimeout(() => setToast(''), 4000);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{budget.length} poste{budget.length > 1 ? 's' : ''} de budget</span>
        <button type="button" onClick={() => setAdding({})} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <Plus size={18} /> Ajouter une dépense
        </button>
      </div>
      {budget.length ? <BudgetOverview budget={budget} onOpen={setDetail} /> : <Empty>Aucun poste de budget pour l’instant</Empty>}
      {budget.some((b) => b.expenses?.length) && (
        <AllExpenses budget={budget} eventName={current.name} onEdit={(poste, e) => setAdding({ poste, expense: e })} onDelete={removeExpense} />
      )}
      {/* La fenêtre d'ajout passe devant le détail du poste ; on revient au détail après l'ajout. */}
      <BudgetLineModal hidden={!!adding} line={budget.find((b) => b.label === detail)} onClose={closeDetail} onAdd={() => setAdding({ poste: detail ?? undefined })}
        onDelete={(id) => detail && removeExpense(detail, id)} onEdit={(e) => setAdding({ poste: detail ?? undefined, expense: e })} />
      <ExpenseModal open={!!adding} eventName={current.name} lines={budget} poste={adding?.poste} initial={adding?.expense} onClose={close} onSubmit={submit} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
          <Check size={16} className="text-accent-400" /> {toast}
        </div>
      )}
    </div>
  );
}

/** Minuscules sans accents, pour comparer des noms. */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Met en évidence la partie du texte qui correspond à la recherche (déjà « pliée »). */
function Highlight({ text, q }: { text: string; q: string }) {
  // La forme pliée garde la même longueur que le texte d'origine pour les lettres latines courantes (é → e).
  const f = fold(text);
  const i = f.indexOf(q);
  if (i < 0 || f.length !== text.length) return <b>{text}</b>;
  return <>{text.slice(0, i)}<mark className="bg-accent-200/70 text-ink-900 rounded px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Bouton d'export Excel des équipes : on choisit une responsabilité (facultatif), puis toutes les équipes ou une seule. */
function ExportTeamsMenu({ teams, roles, defaultRole, defaultQuery, roleLabel, countFor, busy, onExport }: {
  teams: { id: string; name: string }[];
  roles: [string, number][];
  /** Responsabilité filtrée sur la page, proposée par défaut. */
  defaultRole: string;
  /** Recherche par nom saisie sur la page, proposée par défaut. */
  defaultQuery: string;
  roleLabel: (r: string) => string;
  /** Nombre de personnes exportées pour une équipe (ou toutes) et une responsabilité. */
  countFor: (teamId: string | undefined, role: string, query: string) => number;
  busy: boolean;
  onExport: (teamId: string | undefined, role: string, query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => { if (!open) { setRole(defaultRole); setQuery(defaultQuery); } setOpen((o) => !o); };
  const pick = (id?: string) => { setOpen(false); onExport(id, role, query); };
  const narrowed = !!role || !!query.trim();
  const item = 'w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left text-sm hover:bg-[var(--sand)] disabled:opacity-40 disabled:hover:bg-transparent transition';
  const pers = (n: number) => `${n} pers.`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} disabled={busy || !teams.length} aria-haspopup="menu" aria-expanded={open}
        title="Exporter en Excel (.xlsx) : par équipe et par responsabilité"
        className="flex items-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900 disabled:opacity-50 transition">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exporter en Excel
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Équipes à exporter" className="absolute right-0 top-full mt-2 z-30 w-72 max-h-96 overflow-y-auto bg-white rounded-2xl ring-1 ring-ink-200 shadow-xl py-2">
          <div className="px-4 pt-1 pb-3 space-y-3">
            <label className="block">
              <span className="block eyebrow text-ink-500 !text-[10px] mb-1.5">Nom de la personne</span>
              <span className="relative block">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tous les noms" aria-label="Nom à exporter"
                  className="h-9 w-full rounded-xl bg-[var(--sand)] pl-8 pr-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
              </span>
            </label>
            <label className="block">
              <span className="block eyebrow text-ink-500 !text-[10px] mb-1.5">Responsabilité</span>
              <span className="relative block">
                <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Responsabilité à exporter"
                  className={`h-9 w-full appearance-none rounded-xl pl-3 pr-8 text-sm outline-none ring-1 focus:ring-2 focus:ring-brand-500 ${role ? 'bg-brand-950 text-white ring-brand-950' : 'bg-[var(--sand)] ring-ink-200'}`}>
                  <option value="">Toutes les responsabilités</option>
                  {roles.map(([n, c]) => <option key={n} value={n}>{roleLabel(n)} ({c})</option>)}
                </select>
                <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${role ? 'text-accent-400' : 'text-ink-400'}`} />
              </span>
            </label>
          </div>
          <div className="border-t border-ink-100 pt-2">
            <p className="px-4 pb-1 eyebrow text-ink-500 !text-[10px]">Équipes à exporter</p>
            <button type="button" role="menuitem" onClick={() => pick()} disabled={!countFor(undefined, role, query)} className={`${item} font-semibold`}>
              Toutes les équipes <span className="text-xs text-ink-500 font-normal">{pers(countFor(undefined, role, query))}</span>
            </button>
            <div className="my-1 border-t border-ink-100" />
            {teams.map((t) => {
              const n = countFor(t.id, role, query);
              return (
                <button key={t.id} type="button" role="menuitem" onClick={() => pick(t.id)} disabled={narrowed && !n} className={item}>
                  <span className="truncate">{t.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">{pers(n)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Toutes les dépenses de l'événement, filtrables par poste. */
function AllExpenses({ budget, eventName, onEdit, onDelete }: {
  budget: BudgetLine[]; eventName: string; onEdit: (poste: string, e: Expense) => void; onDelete: (poste: string, id: string) => void;
}) {
  const [only, setOnly] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const dates = useDateFilter();
  const lines = budget.filter((b) => b.expenses?.length);
  const all = lines.flatMap((b) => (b.expenses ?? []).map((e) => ({ ...e, poste: b.label }))).sort((a, b) => b.date.localeCompare(a.date));
  // Le poste filtré a pu perdre toutes ses dépenses : on revient alors à « Tous ».
  const current = only && lines.some((b) => b.label === only) ? only : null;
  // Les deux filtres se combinent : poste, puis date (les mois proposés suivent le poste choisi).
  const byPoste = current ? all.filter((e) => e.poste === current) : all;
  const shown = byPoste.filter((e) => dates.match(e.date));
  const total = shown.reduce((a, e) => a + e.amount, 0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  // Le fichier contient exactement la liste affichée (filtres compris).
  const doExport = async () => {
    const period = dates.month
      ? new Date(dates.month + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : dates.active ? `du ${dates.from ? fmtDate(dates.from) : '…'} au ${dates.to ? fmtDate(dates.to) : '…'}` : 'toutes dates';
    setExporting(true); setExportError('');
    try { await exportExpenses(shown, eventName, `${current ?? 'tous les postes'} · ${period}`); }
    catch { setExportError('L’export a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  const chip = (on: boolean) => `shrink-0 h-9 px-4 rounded-full text-sm font-medium transition ${on ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`;
  return (
    <section className="tile p-6" aria-labelledby="all-expenses-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 id="all-expenses-title" className="font-display text-2xl tracking-wide flex items-center gap-2"><ReceiptText size={20} className="text-brand-600" /> Dépenses</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-500">{shown.length} dépense{shown.length > 1 ? 's' : ''} · <b className="text-brand-950 tabular-nums">{fmt(total)}</b></span>
          <button type="button" onClick={doExport} disabled={exporting || !shown.length} title="Exporter la liste affichée en Excel (.xlsx)"
            className="flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900 disabled:opacity-50 transition">
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Exporter en Excel
          </button>
        </div>
      </div>
      {exportError && <p role="alert" className="-mt-2 mb-3 text-sm text-red-700">{exportError}</p>}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] mb-4" role="group" aria-label="Filtrer par poste">
        <button type="button" onClick={() => setOnly(null)} aria-pressed={!current} className={chip(!current)}>
          Tous les postes <span className="opacity-60 tabular-nums">{all.length}</span>
        </button>
        {lines.map((b) => (
          <button key={b.label} type="button" onClick={() => setOnly(current === b.label ? null : b.label)} aria-pressed={current === b.label} className={chip(current === b.label)}>
            {b.label} <span className="opacity-60 tabular-nums">{b.expenses!.length}</span>
          </button>
        ))}
      </div>
      <div className="mb-4"><DateFilterBar f={dates} dates={byPoste.map((e) => e.date)} size="md" /></div>
      {!shown.length ? (
        <div className="rounded-2xl ring-1 ring-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-500">
          Aucune dépense ne correspond à ces filtres.{' '}
          <button type="button" onClick={() => { dates.reset(); setOnly(null); }} className="font-medium text-brand-700 hover:underline">Tout afficher</button>
        </div>
      ) : (
      <div className="rounded-2xl ring-1 ring-ink-200 bg-white overflow-x-auto">
      <table className="w-full sm:min-w-[560px] text-sm" aria-label="Liste des dépenses">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500 border-b border-ink-200">
            <th scope="col" className="hidden md:table-cell font-semibold px-4 py-3 w-20">Date</th>
            <th scope="col" className="font-semibold px-3 sm:px-4 py-3">Dépense</th>
            <th scope="col" className="hidden sm:table-cell font-semibold px-3 py-3 text-right">Quantité</th>
            <th scope="col" className="hidden sm:table-cell font-semibold px-3 py-3 text-right">Prix unitaire</th>
            <th scope="col" className="font-semibold px-2 sm:px-3 py-3 text-right whitespace-nowrap">Prix total</th>
            <th scope="col" className="px-1 sm:px-2 py-3 w-16 sm:w-20"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
        {shown.map((e) => { const d = detailOf(e); return (
          <tr key={e.id} className={confirm === e.id ? 'bg-red-50' : 'hover:bg-[var(--sand)]/60'}>
            {confirm === e.id ? (
              <td colSpan={6} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm text-red-800">Supprimer « {e.label} » ({fmt(e.amount)}) ?</span>
                  <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-sm text-brand-900 hover:bg-white">Annuler</button>
                  <button type="button" onClick={() => { onDelete(e.poste, e.id); setConfirm(null); }} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Supprimer</button>
                </div>
              </td>
            ) : (
              <>
                <td className="hidden md:table-cell px-4 py-3 text-xs text-ink-500 tabular-nums whitespace-nowrap">{fmtDate(e.date)}</td>
                <td className="px-3 sm:px-4 py-3">
                  <span className="block font-medium text-base">{e.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="md:hidden text-xs text-ink-500 tabular-nums">{fmtDate(e.date)}</span>
                    <PaymentBadge e={e} />
                    {!current && <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--sand)] text-brand-900">{e.poste}</span>}
                  </span>
                </td>
                <td className="hidden sm:table-cell px-3 py-3 text-right tabular-nums whitespace-nowrap">{d.qty.toLocaleString('fr-FR')}</td>
                <td className="hidden sm:table-cell px-3 py-3 text-right tabular-nums whitespace-nowrap text-ink-700">{fmt(d.unit)}</td>
                <td className="px-2 sm:px-3 py-3 text-right tabular-nums whitespace-nowrap"><span className="block font-semibold text-base">{fmt(e.amount)}</span><span className="sm:hidden block text-[11px] text-ink-500">{d.qty.toLocaleString('fr-FR')} × {fmt(d.unit)}</span></td>
                <td className="px-1 sm:px-2 py-3">
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => onEdit(e.poste, { id: e.id, label: e.label, amount: e.amount, qty: e.qty, unitPrice: e.unitPrice, date: e.date, payment: e.payment, paidOn: e.paidOn })} aria-label={`Modifier la dépense ${e.label}`} title="Modifier la dépense"
                      className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
                    <button type="button" onClick={() => setConfirm(e.id)} aria-label={`Supprimer la dépense ${e.label}`} title="Supprimer la dépense"
                      className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-red-700 hover:bg-red-50 transition"><Trash2 size={15} /></button>
                  </div>
                </td>
              </>
            )}
          </tr>
        ); })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-200 bg-[var(--sand)]/60">
            <th scope="row" colSpan={4} className="hidden md:table-cell px-4 py-3 text-right font-semibold">Total</th>
            <th scope="row" colSpan={3} className="hidden sm:table-cell md:hidden px-4 py-3 text-right font-semibold">Total</th>
            <th scope="row" className="sm:hidden px-4 py-3 text-right font-semibold">Total</th>
            <td className="px-2 sm:px-3 py-3 text-right tabular-nums whitespace-nowrap font-bold text-base text-brand-950">{fmt(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      </div>
      )}
    </section>
  );
}

function BudgetOverview({ budget, onOpen }: { budget: BudgetLine[]; onOpen: (label: string) => void }) {
  const planned = budget.reduce((a, b) => a + b.planned, 0);
  const spent = budget.reduce((a, b) => a + b.spent, 0);
  const pct = planned ? Math.min(spent / planned, 1) : 0;
  const r = 70, c = 2 * Math.PI * r;
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <div className="tile p-8 grid place-items-center">
        <svg viewBox="0 0 180 180" className="w-52 h-52 -rotate-90">
          <circle cx="90" cy="90" r={r} fill="none" stroke="#e4e9ee" strokeWidth="18" />
          <circle cx="90" cy="90" r={r} fill="none" stroke="#00a3cc" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
        </svg>
        <div className="-mt-36 mb-20 text-center">
          <div className="font-display text-5xl">{planned ? Math.round((spent / planned) * 100) : 0}%</div>
          <div className="text-xs text-ink-500">du budget utilisé</div>
        </div>
        <div className="text-center text-sm"><b>{fmt(spent)}</b> sur {fmt(planned)}</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 content-start">
        {budget.map((b, i) => (
          <button key={b.label} type="button" onClick={() => onOpen(b.label)} aria-label={`Voir les dépenses du poste ${b.label}`}
            className="tile p-5 text-left w-full transition hover:ring-2 hover:ring-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="flex justify-between items-center"><span className="eyebrow text-ink-500">Poste {i + 1}</span><span className="text-xs text-ink-500">{b.planned ? Math.round((b.spent / b.planned) * 100) : 0}%</span></div>
            <div className="font-semibold mt-1">{b.label}</div>
            <div className="font-display text-3xl mt-2">{fmt(b.spent)}</div>
            <div className="text-xs text-ink-500">prévu : {fmt(b.planned)}{b.expenses?.length ? ` · ${b.expenses.length} dépense${b.expenses.length > 1 ? 's' : ''}` : ''}</div>
            <div className="h-1.5 rounded-full bg-ink-100 mt-3 overflow-hidden"><div className="h-full bg-brand-600 rounded-full" style={{ width: `${b.planned ? Math.min((b.spent / b.planned) * 100, 100) : 0}%` }} /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cartes prestataires avec contact intégré. */
export function ProvidersView() {
  const { data: { providers }, current, addProvider, updateProvider } = useEvents();
  const navigate = useNavigate();
  const [only, setOnly] = useState<ProviderStage | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState('');
  const closeAdd = useCallback(() => setAdding(false), []);
  const shown = only ? providers.filter((p) => p.status === only) : providers;
  const open = (id: string) => navigate(`/prestataires/${id}`);
  const create = (p: NewProvider) => {
    addProvider(p);
    setAdding(false);
    if (only && only !== p.status) setOnly(null); // pour voir tout de suite le nouveau prestataire
    setToast(`« ${p.name} » ajouté — enregistré sur cet appareil`);
    setTimeout(() => setToast(''), 3500);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{providers.length} prestataire{providers.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={() => setAdding(true)} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <Plus size={18} /> Ajouter un prestataire
        </button>
      </div>
      <ProviderModal open={adding} eventName={current.name} existing={providers.map((p) => p.name)}
        categories={[...new Set(providers.map((p) => p.category).filter(Boolean))]} onClose={closeAdd} onSubmit={create} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
      {!providers.length ? <Empty>Aucun prestataire pour l’instant</Empty> : <>
      {/* Filtre par étape */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer par étape">
        <button type="button" onClick={() => setOnly(null)} aria-pressed={!only}
          className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium transition ${!only ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`}>
          Tous <span className="opacity-60 tabular-nums">{providers.length}</span>
        </button>
        {providerStages.map((st) => {
          const n = providers.filter((p) => p.status === st).length;
          return (
            <button key={st} type="button" onClick={() => setOnly(only === st ? null : st)} aria-pressed={only === st}
              className={`shrink-0 flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium transition ${only === st ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`}>
              <span className={`w-2 h-2 rounded-full ${stageStyle[st].dot}`} /> {st} {n > 0 && <span className="opacity-60 tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>

      {!shown.length && <div className="tile p-8 text-center text-sm text-ink-500">Aucun prestataire à l’étape « {only} ».</div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => {
          const links = contactLinks(p.phone, p.email);
          const docs = p.docs.length;
          return (
            <div key={p.id} role="link" tabIndex={0} onClick={() => open(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(p.id); }}
              aria-label={`Ouvrir le dossier de ${p.name}`}
              className="tile p-6 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-28px_rgba(1,33,43,.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-brand-900 text-accent-400 font-display text-xl grid place-items-center shrink-0">{initials(p.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-ink-500">{p.category}</div>
                </div>
                <ChevronRight size={18} className="text-ink-400 shrink-0" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <ChipMenu label="Étape" value={p.status} options={providerStages} chip={(v) => stageStyle[v as ProviderStage].chip}
                  onChange={(v) => updateProvider(p.id, (x) => ({ ...x, status: v as ProviderStage }))} />
                <span className="text-xs text-ink-500 flex items-center gap-1"><FileText size={13} /> {docs ? `${docs} pièce${docs > 1 ? 's' : ''}` : 'Dossier vide'}</span>
              </div>
              <div className="mt-5 pt-5 border-t border-dashed border-ink-200 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="eyebrow text-ink-500 mr-auto">Contacter</span>
                <a href={links.whatsapp} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${p.name}`} className="w-10 h-10 rounded-full bg-accent-500 text-white grid place-items-center hover:scale-105 transition"><MessageCircle size={18} /></a>
                <a href={links.sms} title="SMS" aria-label={`SMS ${p.name}`} className="w-10 h-10 rounded-full bg-brand-600 text-white grid place-items-center hover:scale-105 transition"><Smartphone size={18} /></a>
                <a href={links.mail} title="E-mail" aria-label={`E-mail ${p.name}`} className="w-10 h-10 rounded-full bg-brand-950 text-white grid place-items-center hover:scale-105 transition"><Mail size={18} /></a>
              </div>
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

/** Planning de communication de l'événement actif, trié par date. */
export function CommunicationView() {
  const { data: { communication }, current, addComm, updateComm, removeComm } = useEvents();
  const [plan, setPlan] = useState<{ date?: string; item?: CommItem } | null>(null);
  const [focus, setFocus] = useState<{ date: string; n: number } | null>(null);
  const closePlan = useCallback(() => setPlan(null), []);
  const [mode, setMode] = useState<'calendrier' | 'liste'>(() => { try { return localStorage.getItem('comm-vue') === 'liste' ? 'liste' : 'calendrier'; } catch { return 'calendrier'; } });
  const choose = (m: 'calendrier' | 'liste') => { setMode(m); try { localStorage.setItem('comm-vue', m); } catch { /* stockage indisponible */ } };
  const filter = useChannelFilter();
  const rows = [...communication].filter((c) => !filter.only.length || filter.only.includes(c.channel)).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex p-1 rounded-full bg-white ring-1 ring-ink-100">
        {([['calendrier', CalendarDays, 'Calendrier'], ['liste', List, 'Liste']] as const).map(([m, Icon, label]) => (
          <button key={m} type="button" onClick={() => choose(m)} aria-pressed={mode === m}
            className={`flex items-center gap-2 text-sm px-4 py-1.5 rounded-full transition ${mode === m ? 'bg-brand-950 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setPlan({})}
        className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-[0_8px_20px_-8px_rgba(0,163,204,.4)] transition">
        <CalendarPlus size={16} /> Planifier une publication
      </button>
      </div>
      <CommModal open={!!plan} eventName={current.name} date={plan?.date} initial={plan?.item} onClose={closePlan}
        onSubmit={(c) => { if (plan?.item) updateComm(plan.item, c); else addComm(c); setPlan(null); setFocus({ date: c.date, n: Date.now() }); }}
        onDelete={plan?.item ? () => { removeComm(plan.item!); setPlan(null); } : undefined} />
      {mode === 'calendrier' ? <CommCalendar items={communication} event={current} focus={focus} onPlan={(date) => setPlan({ date })}
          onEdit={(item) => setPlan({ item })} onDelete={removeComm} filter={filter} />
        : !communication.length ? <Empty>Aucune publication planifiée pour l’instant</Empty> : (
    <div className="space-y-4">
    <ChannelFilter filter={filter} items={communication} />
    {!rows.length && (
      <div className="tile p-8 text-center">
        <div className="font-semibold">Aucune publication pour ce{filter.only.length > 1 ? 's' : ''} canal{filter.only.length > 1 ? 'aux' : ''}</div>
        <button type="button" onClick={() => filter.set([])} className="mt-2 text-sm text-brand-700 underline underline-offset-2">Afficher tous les canaux</button>
      </div>
    )}
    <ol className="space-y-3">
      {rows.map((c) => {
        const past = c.date < new Date().toISOString().slice(0, 10);
        return (
          <li key={`${c.date}-${c.channel}-${c.subject}`} className="tile p-5 flex items-center gap-4">
            <div className={`w-16 shrink-0 text-center rounded-2xl py-2 ${past ? 'bg-ink-100 text-ink-500' : 'bg-brand-500 text-white'}`}>
              <div className="font-display text-2xl leading-none">{new Date(c.date + 'T00:00:00').getDate()}</div>
              <div className="text-[11px] uppercase tracking-wider mt-1">{new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short' })}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{c.subject}</div>
              <div className="text-xs text-ink-500 mt-0.5">{new Date(c.date + 'T00:00:00').getFullYear()}{past ? ' · publié' : ''}</div>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-royal-300/40 text-royal-700 shrink-0">{c.channel}</span>
            <CommActions item={c} onEdit={(item) => setPlan({ item })} onDelete={removeComm} />
          </li>
        );
      })}
    </ol>
    </div>
      )}
    </div>
  );
}

/** Équipes de l'événement actif : un clic ouvre le dossier de l'équipe (membres et responsabilités). */
export function TeamsView() {
  const { current, data: { teams }, addTeam, updateTeam } = useEvents();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false); // modification de l'équipe ouverte (openId)
  // Filtre par équipe : null = toutes. Une équipe supprimée entre-temps revient à « toutes ».
  const [filterId, setFilterId] = useState<string | null>(null);
  const byTeam = teams.some((t) => t.id === filterId) ? teams.filter((t) => t.id === filterId) : teams;
  const filtering = byTeam.length !== teams.length;
  // Recherche par nom de personne (responsable ou membre), sans tenir compte des accents ni des majuscules.
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  // Filtre par responsabilité : « Responsable » pour les responsables d'équipe, « À préciser » pour un rôle vide.
  const TO_DEFINE = 'À préciser';
  const peopleOf = (t: (typeof teams)[number]) => [
    ...(t.lead ? [{ id: 'lead', name: t.lead, role: 'Responsable' }] : []),
    ...t.members.map((m) => ({ id: m.id, name: m.name, role: m.role.trim() || TO_DEFINE })),
  ];
  const roles = Object.entries(teams.flatMap(peopleOf).reduce<Record<string, number>>((a, p) => ({ ...a, [p.role]: (a[p.role] ?? 0) + 1 }), {}))
    .sort(([a], [b]) => (a === 'Responsable' ? -1 : b === 'Responsable' ? 1 : a === TO_DEFINE ? 1 : b === TO_DEFINE ? -1 : a.localeCompare(b, 'fr')));
  const [roleFilter, setRoleFilter] = useState('');
  const role = roles.some(([n]) => n === roleFilter) ? roleFilter : ''; // un rôle disparu entre-temps n'est plus filtré
  const searching = !!q || !!role;
  const matchesOf = (t: (typeof teams)[number]) => searching
    ? peopleOf(t).filter((p) => (!q || fold(p.name).includes(q)) && (!role || p.role === role))
    : [];
  const criteria = [q && `« ${query.trim()} »`, role && `la responsabilité « ${role} »`].filter(Boolean).join(' et ');
  const shownTeams = searching ? byTeam.filter((t) => matchesOf(t).length) : byTeam;
  const found = shownTeams.reduce((a, t) => a + matchesOf(t).length, 0);
  const [toast, setToast] = useState('');
  const close = useCallback(() => setOpenId(null), []);
  const closeNew = useCallback(() => { setCreating(false); setEditing(false); }, []);
  const editedTeam = editing ? teams.find((t) => t.id === openId) : undefined;
  const create = (name: string, lead: string) => {
    if (editedTeam) {
      updateTeam(editedTeam.id, (t) => ({ ...t, name, lead }));
      setEditing(false);
      setToast(`Équipe « ${name} » modifiée — enregistré sur cet appareil`);
      setTimeout(() => setToast(''), 4000);
      return;
    }
    const id = uid();
    addTeam({ id, name, lead, members: [] });
    setFilterId(null); // la nouvelle équipe doit être visible dans la liste
    setCreating(false);
    setOpenId(id); // on enchaîne sur le dossier de l'équipe pour ajouter les membres
    setToast(`Équipe « ${name} » créée — enregistré sur cet appareil`);
    setTimeout(() => setToast(''), 4000);
  };
  const deleted = useCallback((name: string) => {
    setToast(`Équipe « ${name} » supprimée — enregistré sur cet appareil`);
    setTimeout(() => setToast(''), 4000);
  }, []);
  const count = teams.reduce((a, t) => a + t.members.length + (t.lead ? 1 : 0), 0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  // Une ligne par personne : le responsable d'abord, puis les membres de chaque équipe.
  // teamId absent = toutes les équipes.
  const roleLabel = (r: string) => (r === TO_DEFINE ? 'Responsabilité à préciser' : r);
  const peopleFor = (teamId: string | undefined, r: string, query: string) => {
    const fq = fold(query.trim());
    return (teamId ? teams.filter((t) => t.id === teamId) : teams)
      .map((t) => ({ team: t, people: peopleOf(t).filter((p) => (!r || p.role === r) && (!fq || fold(p.name).includes(fq))) }));
  };
  const countFor = (teamId: string | undefined, r: string, query: string) => peopleFor(teamId, r, query).reduce((a, x) => a + x.people.length, 0);
  const doExport = async (teamId: string | undefined, r: string, query: string) => {
    const qt = query.trim();
    // Sans filtre, une équipe vide garde sa ligne ; avec un filtre (nom ou responsabilité), seules les équipes concernées sont exportées.
    const groups = peopleFor(teamId, r, qt).filter((g) => (!r && !qt) || g.people.length);
    const people = groups.reduce((a, g) => a + g.people.length, 0);
    const teamName = teamId ? groups[0]?.team.name ?? '' : '';
    setExporting(true); setExportError('');
    try {
      await downloadSheet({
        title: 'Équipes', sheet: 'Équipes', eventName: current.name,
        fileBase: [teamId ? `equipe-${slug(teamName)}` : 'equipes', r && slug(roleLabel(r)), qt && slug(qt)].filter(Boolean).join('-'),
        filters: [
          teamId ? `équipe ${teamName}` : `toutes les équipes (${teams.length})`,
          `responsabilité : ${r ? roleLabel(r) : 'toutes'}`,
          qt && `nom contenant « ${qt} »`,
        ].filter(Boolean).join(' · '),
        headers: ['Équipe', 'Nom', 'Rôle', 'Responsabilité'],
        widths: [24, 28, 16, 40],
        rows: groups.flatMap(({ team: t, people: ps }) => ps.length
          ? ps.map((p) => p.id === 'lead'
            ? [t.name, p.name, 'Responsable', 'Pilote l’équipe']
            : [t.name, p.name, 'Membre', p.role])
          : [[t.name, null, null, 'Équipe sans membre']]),
        total: [`${groups.length} équipe${groups.length > 1 ? 's' : ''}`, `${people} personne${people > 1 ? 's' : ''}`, null, null],
      });
    } catch { setExportError('L’export a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{teams.length} équipe{teams.length > 1 ? 's' : ''} · {count} personne{count > 1 ? 's' : ''}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportTeamsMenu teams={teams} roles={roles} defaultRole={role} defaultQuery={query} roleLabel={roleLabel} countFor={countFor} busy={exporting} onExport={doExport} />
          <button type="button" onClick={() => setCreating(true)} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
            <Plus size={18} /> Ajouter une équipe
          </button>
        </div>
      </div>
      {exportError && <p role="alert" className="text-sm text-red-700 text-right">{exportError}</p>}
      {teams.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <label className="relative block lg:w-80 shrink-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une personne"
              aria-label="Rechercher une personne par son nom"
              className="h-10 w-full rounded-full bg-white pl-10 pr-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
          </label>
          <label className="relative block lg:w-64 shrink-0">
            <BriefcaseBusiness size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            <select value={role} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filtrer par responsabilité"
              className={`h-10 w-full appearance-none rounded-full pl-10 pr-9 text-sm outline-none ring-1 focus:ring-2 focus:ring-brand-500 truncate ${role ? 'bg-brand-950 text-white ring-brand-950' : 'bg-white ring-ink-200'}`}>
              <option value="">Toutes les responsabilités</option>
              {roles.map(([n, c]) => <option key={n} value={n}>{n === TO_DEFINE ? 'Responsabilité à préciser' : n} ({c})</option>)}
            </select>
            <ChevronDown size={15} className={`absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${role ? 'text-accent-400' : 'text-ink-400'}`} />
          </label>
      {teams.length > 1 && (
        <div role="group" aria-label="Filtrer par équipe" className="min-w-0 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {[{ id: null as string | null, name: 'Toutes les équipes', n: count }, ...teams.map((t) => ({ id: t.id as string | null, name: t.name, n: t.members.length + (t.lead ? 1 : 0) }))].map((c) => {
            const on = c.id === null ? !filtering : filterId === c.id;
            return (
              <button key={c.id ?? 'all'} type="button" aria-pressed={on} onClick={() => setFilterId(c.id)}
                className={`shrink-0 flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium transition ${on ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`}>
                {c.name}
                <span className={`text-xs tabular-nums ${on ? 'text-accent-400' : 'text-ink-400'}`}>{c.n}</span>
              </button>
            );
          })}
        </div>
      )}
        </div>
      )}
      {searching && shownTeams.length > 0 && (
        <p role="status" className="text-sm text-ink-500">{found} personne{found > 1 ? 's' : ''} trouvée{found > 1 ? 's' : ''} pour {criteria}</p>
      )}
    {!teams.length ? <Empty>Aucune équipe pour l’instant</Empty> : !shownTeams.length ? (
      <div className="tile p-8 text-center text-sm text-ink-500">
        Aucune personne ne correspond à {criteria}{filtering ? ' dans cette équipe' : ''}.{' '}
        <button type="button" onClick={() => { setQuery(''); setRoleFilter(''); setFilterId(null); }} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button>
      </div>
    ) : (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {shownTeams.map((t) => {
        const count = t.members.length + (t.lead ? 1 : 0);
        return (
          <button key={t.id} type="button" onClick={() => setOpenId(t.id)} aria-label={`Ouvrir l’équipe ${t.name}`}
            className="tile p-6 text-left w-full transition hover:ring-2 hover:ring-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-brand-900 text-accent-400 font-display text-xl grid place-items-center">{t.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-lg truncate">{t.name}</div>
                <div className="text-xs text-ink-500">{t.lead ? `Responsable : ${t.lead}` : 'Responsable à désigner'}</div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-ink-400" />
            </div>
            <div className="plate mt-4 px-3 py-2 text-sm flex items-center gap-3">
              <span className="flex -space-x-2">
                {t.members.slice(0, 4).map((m) => (
                  <span key={m.id} title={m.name} className="w-7 h-7 rounded-full bg-brand-900 text-accent-400 text-[10px] font-semibold grid place-items-center ring-2 ring-white">{initials(m.name)}</span>
                ))}
              </span>
              <span>{count} {count > 1 ? 'personnes' : 'personne'}</span>
            </div>
            {searching && (
              <ul className="mt-3 space-y-1.5" aria-label={`Personnes trouvées dans ${t.name}`}>
                {matchesOf(t).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                    <span className="min-w-0 truncate">{q ? <Highlight text={m.name} q={q} /> : <b className="font-medium">{m.name}</b>} <span className="text-ink-500">· {m.role === TO_DEFINE ? 'Responsabilité à préciser' : m.role}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })}
    </div>
    )}
    <TeamModal teamId={openId} onClose={close} onDeleted={deleted} onEdit={() => setEditing(true)} hidden={!!editedTeam} />
    <NewTeamModal open={creating || !!editedTeam} eventName={current.name} existing={teams.map((t) => t.name)}
      initial={editedTeam && { name: editedTeam.name, lead: editedTeam.lead }} onClose={closeNew} onCreate={create} />
    {toast && (
      <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
        <Check size={16} className="text-accent-400" /> {toast}
      </div>
    )}
    </div>
  );
}
