import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Flag, Play, Plus, Square, type LucideIcon } from 'lucide-react';
import { daysUntil, isLate, type Task } from '../demo';
import { useEvents } from '../events';
import TaskModal from '../components/TaskModal';

/* Calendrier des tâches : un mois en grille, une pastille par tâche à sa date limite,
   plus le début et la fin de l'événement. Types : jalon, début, fin, tâche, tâche critique.
   Une tâche terminée est barrée. Maquette : rien n'est encore enregistré en base. */

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX = 3; // pastilles visibles par jour avant « +N autres »

type Kind = 'jalon' | 'debut' | 'fin' | 'tache' | 'critique';
const KINDS: Record<Kind, { label: string; hint: string; Icon: LucideIcon; chip: string; disc: string; dot: string; fill?: boolean }> = {
  jalon: { label: 'Jalon', hint: 'Tâche dont d’autres tâches dépendent', Icon: Flag, chip: 'bg-royal-400/20 text-royal-800', disc: 'bg-royal-400/25 text-royal-700', dot: 'bg-royal-500' },
  debut: { label: 'Début de l’événement', hint: 'Premier jour de l’événement', Icon: Play, chip: 'bg-brand-500/10 text-brand-700', disc: 'bg-brand-500/15 text-brand-600', dot: 'bg-brand-500' },
  fin: { label: 'Fin de l’événement', hint: 'Dernier jour de l’événement', Icon: Square, chip: 'bg-accent-500/10 text-accent-700', disc: 'bg-accent-500/15 text-accent-600', dot: 'bg-accent-500' },
  tache: { label: 'Tâche', hint: 'Date limite d’une tâche', Icon: Circle, chip: 'bg-[#7b5cd6]/10 text-[#5b3fb0]', disc: 'bg-[#7b5cd6]/15 text-[#7b5cd6]', dot: 'bg-[#7b5cd6]', fill: true },
  critique: { label: 'Tâche critique', hint: 'En retard, ou à rendre dans les 3 jours', Icon: Circle, chip: 'bg-red-500/10 text-red-700', disc: 'bg-red-500/15 text-red-600', dot: 'bg-red-500', fill: true },
};
const ORDER: Kind[] = ['jalon', 'debut', 'fin', 'tache', 'critique'];

type Entry = { kind: Kind; label: string; task?: Task; done: boolean };

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Type d'une tâche dans le calendrier. */
function kindOf(t: Task, all: Task[]): Kind {
  const done = t.status === 'Terminée';
  if (!done && (isLate(t) || daysUntil(t.due) <= 3)) return 'critique';
  if (all.some((x) => x.dependsOn === t.title)) return 'jalon';
  return 'tache';
}

function KindIcon({ kind, size = 11 }: { kind: Kind; size?: number }) {
  const k = KINDS[kind];
  return <k.Icon size={size} className="shrink-0" fill={k.fill ? 'currentColor' : 'none'} />;
}

export default function TaskCalendarView() {
  const { current: event, data: { tasks }, addTask } = useEvents();
  const todayKey = keyOf(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayKey);
  const [hidden, setHidden] = useState<Kind[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const closeModal = useCallback(() => setCreating(null), []);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const add = (k: string, e: Entry) => { if (!hidden.includes(e.kind)) map.set(k, [...(map.get(k) ?? []), e]); };
    if (event.start) add(event.start, { kind: 'debut', label: event.name, done: false });
    if (event.end && event.end !== event.start) add(event.end, { kind: 'fin', label: event.name, done: false });
    [...tasks].sort((a, b) => a.title.localeCompare(b.title, 'fr')).forEach((t) => {
      if (t.due) add(t.due, { kind: kindOf(t, tasks), label: t.title, task: t, done: t.status === 'Terminée' });
    });
    // Dans une journée : début/fin d'abord, puis critiques, jalons, tâches, et les terminées à la fin.
    const rank = (e: Entry) => (e.done ? 10 : 0) + ({ debut: 0, fin: 1, critique: 2, jalon: 3, tache: 4 } as const)[e.kind];
    map.forEach((l) => l.sort((a, b) => rank(a) - rank(b)));
    return map;
  }, [tasks, event, hidden]);

  // Grille de 6 semaines commençant un lundi.
  const cells = useMemo(() => {
    const shift = (month.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - shift + i));
  }, [month]);

  const go = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayKey); };
  const goTo = (k: string) => { const d = fromKey(k); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(k); };

  const monthKey = keyOf(month).slice(0, 7);
  const inMonth = tasks.filter((t) => t.due.startsWith(monthKey));
  const doneInMonth = inMonth.filter((t) => t.status === 'Terminée').length;
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0])) as Record<Kind, number>;
  byDay.forEach((l, k) => { if (k.startsWith(monthKey)) l.forEach((e) => counts[e.kind]++); });
  // Les nombres de la légende ignorent le filtre : on recompte les types masqués.
  if (hidden.length) {
    if (hidden.includes('debut') && event.start?.startsWith(monthKey)) counts.debut++;
    if (hidden.includes('fin') && event.end && event.end !== event.start && event.end.startsWith(monthKey)) counts.fin++;
    inMonth.forEach((t) => { const k = kindOf(t, tasks); if (hidden.includes(k)) counts[k]++; });
  }
  const toggle = (k: Kind) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  const dayList = byDay.get(selected) ?? [];
  const nextTask = [...tasks].filter((t) => t.status !== 'Terminée' && t.due >= todayKey).sort((a, b) => a.due.localeCompare(b.due))[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-500">
          {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
          {nextTask && <> · prochaine échéance : <button type="button" onClick={() => goTo(nextTask.due)} className="font-medium text-brand-700 underline underline-offset-2">{fromKey(nextTask.due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</button></>}
        </span>
        <button type="button" onClick={() => setCreating(selected)} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
          className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <Plus size={18} /> Nouvelle tâche
        </button>
      </div>

      {/* Légende, qui sert aussi de filtre */}
      <div role="group" aria-label="Types affichés" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
        {ORDER.map((k) => {
          const on = !hidden.includes(k), d = KINDS[k];
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} title={`${d.hint} — cliquez pour ${on ? 'masquer' : 'afficher'}`}
              className={`shrink-0 flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full text-sm transition ring-1 ${on ? 'bg-white ring-ink-200 text-ink-800' : 'bg-transparent ring-ink-200/60 text-ink-400 line-through'}`}>
              <span className={`w-7 h-7 rounded-full grid place-items-center ${on ? d.disc : 'bg-ink-100 text-ink-400'}`}><KindIcon kind={k} size={13} /></span>
              {d.label}
              {counts[k] > 0 && <span className="text-xs tabular-nums text-ink-400 no-underline">{counts[k]}</span>}
            </button>
          );
        })}
      </div>

      <div className="rounded-[28px] overflow-hidden bg-white text-ink-900 ring-1 ring-ink-100 shadow-[0_24px_60px_-34px_rgba(1,33,43,.35)]">
        <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-5 border-b border-ink-100">
          <div className="mr-auto">
            <h2 className="text-2xl font-bold tracking-tight">{cap(month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}</h2>
            <p className="text-xs text-ink-500 mt-1">
              {inMonth.length ? `${inMonth.length} échéance${inMonth.length > 1 ? 's' : ''} ce mois-ci · ${doneInMonth} terminée${doneInMonth > 1 ? 's' : ''}` : 'Aucune échéance ce mois-ci'}
              {hidden.length > 0 && ` · ${hidden.length} type${hidden.length > 1 ? 's' : ''} masqué${hidden.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button type="button" onClick={goToday} className="h-9 px-4 rounded-full ring-1 ring-ink-200 text-sm hover:bg-ink-50 transition">Aujourd’hui</button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label="Mois précédent" className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-100 transition"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Mois suivant" className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-100 transition"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-ink-100">
          {DAYS.map((d) => <div key={d} className="py-3 text-center text-xs sm:text-sm font-medium text-ink-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const k = keyOf(d);
            const list = byDay.get(k) ?? [];
            const out = d.getMonth() !== month.getMonth();
            const isToday = k === todayKey;
            return (
              <button key={k} type="button" onClick={() => setSelected(k)} onDoubleClick={() => setCreating(k)} title="Double-cliquez pour ajouter une tâche ce jour-là"
                aria-label={`${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${list.length ? `${list.length} élément${list.length > 1 ? 's' : ''}` : 'rien de prévu'}`}
                className={`relative flex flex-col items-start justify-start text-left border-b border-r border-ink-100 [&:nth-child(7n)]:border-r-0 min-h-[64px] sm:min-h-[124px] p-1.5 sm:p-2 transition-colors hover:bg-brand-500/5
                  ${out ? 'bg-ink-50/70' : ''} ${selected === k ? 'ring-2 ring-inset ring-brand-500 bg-brand-500/10' : ''}`}>
                <span className={`inline-grid place-items-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-sm font-medium
                  ${isToday ? 'bg-brand-500 text-white' : out ? 'text-ink-400' : 'text-ink-900'}`}>{d.getDate()}</span>
                {list.length > 0 && (
                  <>
                    <span className="hidden sm:block mt-1 space-y-1 w-full">
                      {list.slice(0, MAX).map((e, i) => <Chip key={i} entry={e} />)}
                      {list.length > MAX && <span className="block text-[11px] text-ink-500 pl-1">+{list.length - MAX} autre{list.length - MAX > 1 ? 's' : ''}</span>}
                    </span>
                    <span className="sm:hidden flex flex-wrap gap-0.5 pl-1 mt-0.5">
                      {list.slice(0, 4).map((e, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${e.done ? 'opacity-40' : ''} ${KINDS[e.kind].dot}`} />)}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Détail du jour choisi */}
      <div className="tile p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500"><CalendarDays size={15} />
          {cap(fromKey(selected).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
          {selected === todayKey && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-royal-300/40 text-royal-700">Aujourd’hui</span>}
          <button type="button" onClick={() => setCreating(selected)} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"><Plus size={15} /> Ajouter une tâche ce jour-là</button>
        </div>
        {dayList.length ? (
          <ul className="mt-3 divide-y divide-ink-100">
            {dayList.map((e, i) => {
              const d = KINDS[e.kind];
              if (!e.task) return (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${d.disc}`}><KindIcon kind={e.kind} size={18} /></span>
                  <div className="min-w-0"><div className="font-semibold truncate">{d.label}</div><div className="text-xs text-ink-500">{e.label}{event.place && ` · ${event.place}`}</div></div>
                </li>
              );
              const t = e.task;
              const late = isLate(t);
              return (
                <li key={t.id}>
                  <Link to={`/taches/${t.id}`} className="flex items-center gap-3 py-3 group">
                    <span className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${e.done ? 'bg-ink-100 text-ink-400' : d.disc}`}>{e.done ? <Check size={18} /> : <KindIcon kind={e.kind} size={18} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold truncate group-hover:underline ${e.done ? 'line-through text-ink-500' : ''}`}>{t.title}</div>
                      <div className="text-xs text-ink-500">
                        {d.label} · {t.owner}{t.dependsOn && ` · après « ${t.dependsOn} »`}
                      </div>
                      <div className="h-1.5 rounded-full bg-ink-100 mt-2 max-w-xs overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${t.progress}%` }} /></div>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${late ? 'bg-red-100 text-red-800' : e.done ? 'bg-accent-400/25 text-accent-700' : 'bg-ink-100 text-ink-700'}`}>{late ? 'En retard' : t.status}</span>
                    <ChevronRight size={16} className="text-ink-300 group-hover:text-ink-500 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-ink-500">Rien de prévu ce jour-là.</p>}
      </div>

      <TaskModal open={!!creating} eventName={event.name} tasks={tasks} defaultDue={creating ?? undefined} onClose={closeModal}
        onSubmit={(t) => {
          addTask(t); setCreating(null); if (t.due) goTo(t.due);
          setToast(`« ${t.title} » ajoutée — enregistré sur cet appareil`); setTimeout(() => setToast(''), 3500);
        }} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
    </div>
  );
}

function Chip({ entry }: { entry: Entry }) {
  const d = KINDS[entry.kind];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] leading-tight font-medium min-w-0 ${d.chip} ${entry.done ? 'opacity-55' : ''}`}
      title={`${entry.task ? entry.label : d.label} · ${entry.done ? 'terminée' : d.label.toLowerCase()}`}>
      <KindIcon kind={entry.kind} />
      <span className={`truncate ${entry.done ? 'line-through' : ''}`}>{entry.task ? entry.label : d.label.replace('de l’événement', '').trim() + ' · ' + entry.label}</span>
    </span>
  );
}
