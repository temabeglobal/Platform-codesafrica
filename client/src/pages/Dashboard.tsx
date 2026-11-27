import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, MapPin, Pencil, PhoneCall, Plus } from 'lucide-react';
import EventModal, { type EventInput } from '../components/EventModal';
import { emptyNetwork } from '../components/EventNetworkStep';
import EventSwitcher from '../components/EventSwitcher';
import { useEvents } from '../events';
import { groups, modulesOf } from '../modules';
import { daysUntil, fmtDate, isLate } from '../demo';

export default function Dashboard() {
  // Toutes les données affichées viennent de l'événement actif.
  const { current: event, data: { tasks, budget, partners, sponsors, teams, programme }, add, update } = useEvents();
  const open = tasks.filter((t) => t.status !== 'Terminée');
  const late = open.filter(isLate);
  const upcoming = open.filter((t) => !isLate(t)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  const followUps = [...partners.map((l) => ({ ...l, kind: 'Partenaire', to: '/partenaires' })), ...sponsors.map((l) => ({ ...l, kind: 'Sponsor', to: '/sponsors' }))].filter((l) => l.stage === 'Contacté' || l.stage === 'Relancé');
  const planned = budget.reduce((a, b) => a + b.planned, 0);
  const spent = budget.reduce((a, b) => a + b.spent, 0);
  const pctUsed = planned ? Math.round((spent / planned) * 100) : 0;
  // Événement actif (sélecteur). Maquette : non enregistré tant que MongoDB n'est pas branché.
  // Fenêtre ouverte : création, modification de l'événement actif, ou fermée.
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [toast, setToast] = useState('');
  const closeModal = useCallback(() => setModal(null), []);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };
  const submitEvent = (e: EventInput) => {
    const data = { name: e.name, start: e.start, end: e.end, place: e.place, type: e.type, color: e.color,
      reference: e.reference, description: e.description, budget: e.budget, owner: e.owner, attendees: e.attendees };
    if (modal === 'edit') { update(event.id, data); flash(`« ${e.name} » modifié — enregistré sur cet appareil`); }
    else { add(data, e.network); flash(`« ${e.name} » créé — enregistré sur cet appareil`); }
    setModal(null);
  };
  const { id: _id, ...eventFields } = event;
  const editInitial: EventInput = { ...eventFields, documents: [], network: emptyNetwork() };
  const days = daysUntil(event.start);
  const confirmed = [...partners, ...sponsors].filter((l) => l.stage === 'Confirmé').length;

  const groupMetric: Record<string, string> = {
    taches: `${open.length} tâche${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''}`,
    programme: (() => {
      const n = programme.length, d = new Set(programme.map((p) => p.date)).size;
      return n ? `${n} session${n > 1 ? 's' : ''} · ${d} jour${d > 1 ? 's' : ''}` : 'Aucune session pour l’instant';
    })(),
    budget: `${pctUsed} % du budget utilisé`,
    reseau: `${confirmed} confirmés · ${followUps.length} à relancer`,
    exposants: (() => {
      const ex = sponsors.filter((l) => l.billing === 'Paiement reçu');
      const m2 = ex.reduce((a, l) => a + (l.stand === '18 m²' ? 18 : l.stand === '9 m²' ? 9 : 0), 0);
      return ex.length ? `${ex.length} exposant${ex.length > 1 ? 's' : ''} · ${m2} m² de stands` : 'Aucun exposant pour l’instant';
    })(),
    contenu: 'Calendrier des actions de communication',
    equipe: (() => {
      const people = teams.reduce((a, t) => a + t.members.length + (t.lead ? 1 : 0), 0);
      return teams.length ? `${teams.length} équipe${teams.length > 1 ? 's' : ''} · ${people} personne${people > 1 ? 's' : ''}` : 'Aucune équipe pour l’instant';
    })(),
    wmt: 'Programmes, participantes et sessions à venir',
  };

  return (
    <>
    <div className="relative z-20 flex items-stretch justify-between gap-3 mb-5">
      <EventSwitcher />
      <button onClick={() => setModal('create')} aria-label="Nouvel événement" style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }} className="tile-fx fx-sm shrink-0 flex items-center gap-2.5 px-4 sm:px-6 py-4 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
        <Plus size={18} /> <span className="hidden sm:inline">Nouvel événement</span>
      </button>
    </div>
    <div className="grid gap-4 md:gap-5 md:grid-cols-6">
      {/* Compte à rebours */}
      <section className="relative overflow-hidden rounded-[32px] bg-brand-900 text-white p-7 md:p-10 md:col-span-4 min-h-[260px] flex flex-col justify-between">
        <div className="pattern bg-[#4fb0c9] opacity-[0.28]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-950 via-brand-950/70 to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
        <p className="eyebrow text-accent-400 flex flex-wrap items-center gap-x-2">
          <span>{event.name} · {new Date(event.start + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          {event.place && <span className="flex items-center gap-1 text-white/70"><MapPin size={12} />{event.place}</span>}
        </p>
          <button type="button" onClick={() => setModal('edit')} aria-label={`Modifier ${event.name}`} className="shrink-0 flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/20 transition">
            <Pencil size={14} /> <span className="hidden sm:inline">Modifier</span>
          </button>
        </div>
        <div className="relative flex items-end gap-4 mt-6">
          <span className="font-display text-[72px] sm:text-[96px] md:text-[128px] leading-[0.8] text-accent-400 whitespace-nowrap">{days >= 0 ? `J-${days}` : 'Terminé'}</span>
          <span className="pb-2 text-white/85 text-sm md:text-base max-w-[14rem]">avant l’ouverture de l’événement</span>
        </div>
      </section>

      <Link to="/taches" style={{ ['--fx-o' as string]: 0.5 }} className="tile-fx rounded-[28px] p-6 md:col-span-2 bg-gradient-to-br from-[#3d0d0a] via-[#6b1a12] to-[#9a2c1c] text-white [--fx:#3ec6ea] flex flex-col justify-between min-h-[160px]">
        <div className="flex items-center justify-between"><AlertTriangle size={20} className="text-accent-300" /><ArrowUpRight size={18} className="opacity-70" /></div>
        <div>
          <div className="font-display text-6xl leading-none text-accent-300">{late.length}</div>
          <div className="text-sm mt-2 text-white/90">{late.length > 1 ? 'tâches en retard' : 'tâche en retard'}</div>
        </div>
      </Link>

      {/* Retards + échéances */}
      <div className="tile p-6 md:col-span-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl tracking-wide flex items-center gap-2"><CalendarClock size={20} className="text-brand-600" /> Échéances</h2>
          <Link to="/taches" className="text-sm text-brand-700 hover:underline">Toutes les tâches</Link>
        </div>
        {late.length + upcoming.length === 0 && <p className="plate px-4 py-3 text-sm text-ink-500">Aucune échéance pour cet événement.</p>}
        <ul className="space-y-2">
          {[...late, ...upcoming].map((t) => {
            const d = daysUntil(t.due);
            const lateNow = d < 0;
            return (
              <li key={t.id}><Link to={`/taches/${t.id}`} className="plate px-3 py-2.5 flex items-center gap-4 hover:ring-brand-400 transition">
                <span className={`w-16 shrink-0 text-center rounded-xl py-1.5 text-xs font-semibold ${lateNow ? 'bg-red-100 text-red-800' : d <= 7 ? 'bg-royal-300/50 text-royal-700' : 'bg-ink-100 text-ink-700'}`}>
                  {lateNow ? `+${-d} j` : d === 0 ? 'Auj.' : `J-${d}`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-xs text-ink-500">{t.owner} · {fmtDate(t.due)}</div>
                </div>
                {lateNow && <span className="text-xs font-semibold text-red-700">En retard</span>}
              </Link></li>
            );
          })}
        </ul>
      </div>

      <div className="md:col-span-2 grid gap-4 md:gap-5 content-start">
        <Link to="/organisation" className="tile-fx rounded-[28px] p-6 bg-brand-500 text-white [--fx:#00131a]">
          <div className="eyebrow text-brand-950/70">Budget utilisé</div>
          <div className="font-display text-5xl mt-2">{pctUsed} %</div>
          <div className="h-2 rounded-full bg-brand-950/15 mt-3 overflow-hidden"><div className="h-full bg-brand-950 rounded-full" style={{ width: `${Math.min(pctUsed, 100)}%` }} /></div>
        </Link>
        <div className="tile p-6">
          <h2 className="font-display text-xl tracking-wide flex items-center gap-2"><PhoneCall size={18} className="text-brand-600" /> À relancer</h2>
          {followUps.length === 0 && <p className="mt-3 text-sm text-ink-500">Personne à relancer.</p>}
          <ul className="mt-3 space-y-2">
            {followUps.map((l) => (
              <li key={l.name}>
                <Link to={l.to} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 bg-[var(--sand)] hover:bg-brand-50 transition">
                  <span className="text-sm font-medium truncate">{l.name}</span>
                  <span className="text-[11px] text-ink-500 shrink-0">{l.kind}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Familles de modules */}
      {/* Familles par lignes de 3 tuiles ; une dernière ligne incomplète s'élargit. */}
      {groups.map((g, i) => (
        <Link key={g.id} to={modulesOf(g.id)[0].path} className={`tile p-6 block ${i < groups.length - (groups.length % 3) ? 'md:col-span-2' : groups.length % 3 === 2 ? 'md:col-span-3' : 'md:col-span-6'}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-lg"><g.icon size={20} className="text-brand-600" />{g.label}</span>
            <span className="w-9 h-9 rounded-full bg-brand-950 text-accent-400 grid place-items-center"><ArrowUpRight size={16} /></span>
          </div>
          <p className="text-sm text-ink-500 mt-1">{groupMetric[g.id]}</p>
          {modulesOf(g.id).length > 1 && <div className="flex flex-wrap gap-2 mt-4">
            {modulesOf(g.id).map((m) => (
              <span key={m.path} className="text-xs px-3 py-1 rounded-full bg-[var(--sand)] text-brand-900">{m.label}</span>
            ))}
          </div>}
        </Link>
      ))}
      <p className="md:col-span-6 text-xs text-ink-500">Maquette de design — données et date de l’événement d’exemple.</p>
    </div>
    <EventModal open={modal !== null} onClose={closeModal} onSubmit={submitEvent} initial={modal === 'edit' ? editInitial : undefined} />
    {toast && (
      <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
        <Check size={16} className="text-accent-400" /> {toast}
      </div>
    )}
    </>
  );
}
