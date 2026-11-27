import { useCallback, useState, type ReactNode } from 'react';
import { CalendarDays, CalendarPlus, Check, Clock, Download, GraduationCap, Loader2, MapPin, Mic, Pencil, Plus, Search, Sparkles, UserPlus, Users } from 'lucide-react';
import { useEvents } from '../events';
import { daysUntil, fmtDate } from '../demo';
import { participantStages, takesSeat, type Participant, type ParticipantStage, type Program, type WmtSession } from '../wmt';
import { ChipMenu, initials } from './providers-ui';
import { ParticipantModal, ProgramModal, SessionModal } from '../components/WmtModals';
import { downloadSheet } from '../excel';

/* Women in MiningTech & Academy : programmes, participantes et sessions de l'événement actif. */

type View = 'programmes' | 'participantes' | 'sessions';

export const stageStyle: Record<ParticipantStage, string> = {
  Candidature: 'bg-ink-100 text-ink-700',
  Retenue: 'bg-brand-500/10 text-brand-700',
  'En formation': 'bg-royal-300/40 text-royal-700',
  Certifiée: 'bg-accent-500/15 text-accent-700',
  Désistée: 'bg-red-100 text-red-800',
};
const kindStyle = (p?: Program) => (p?.kind === 'Academy' ? 'bg-brand-500/10 text-brand-700' : 'bg-royal-300/40 text-royal-700');
const fmtLong = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const readView = (): View => {
  try { const v = localStorage.getItem('wmt-vue'); if (v === 'participantes' || v === 'sessions') return v; } catch { /* stockage indisponible */ }
  return 'programmes';
};

export default function WmtPage() {
  const { current, data: { wmt }, updateWmt } = useEvents();
  const { programs, participants, sessions } = wmt;
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem('wmt-vue', v); } catch { /* ignoré */ } };
  // Filtre par programme, partagé entre participantes et sessions.
  const [only, setOnly] = useState<string | null>(null);
  const program = only && programs.some((p) => p.id === only) ? only : null;
  const [toast, setToast] = useState('');
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  // Fenêtres ouvertes : null = fermée ; objet vide = ajout ; { item } = modification.
  const [progModal, setProgModal] = useState<{ item?: Program } | null>(null);
  const [partModal, setPartModal] = useState<{ item?: Participant } | null>(null);
  const [sessModal, setSessModal] = useState<{ item?: WmtSession } | null>(null);
  const closeProg = useCallback(() => setProgModal(null), []);
  const closePart = useCallback(() => setPartModal(null), []);
  const closeSess = useCallback(() => setSessModal(null), []);

  const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);
  const saveProgram = (p: Program) => { updateWmt((w) => ({ ...w, programs: upsert(w.programs, p) })); flash(progModal?.item ? `« ${p.name} » modifié` : `« ${p.name} » créé`); setProgModal(null); };
  const deleteProgram = (id: string) => {
    updateWmt((w) => ({ programs: w.programs.filter((p) => p.id !== id), participants: w.participants.filter((p) => p.programId !== id), sessions: w.sessions.filter((s) => s.programId !== id) }));
    setProgModal(null); flash('Programme supprimé');
  };
  const saveParticipant = (p: Participant) => { updateWmt((w) => ({ ...w, participants: upsert(w.participants, p) })); flash(partModal?.item ? `« ${p.name} » modifiée` : `« ${p.name} » ajoutée`); setPartModal(null); };
  const deleteParticipant = (id: string) => { updateWmt((w) => ({ ...w, participants: w.participants.filter((p) => p.id !== id) })); setPartModal(null); flash('Participante retirée'); };
  const setStage = (id: string, status: ParticipantStage) => updateWmt((w) => ({ ...w, participants: w.participants.map((p) => (p.id === id ? { ...p, status } : p)) }));
  const saveSession = (s: WmtSession) => { updateWmt((w) => ({ ...w, sessions: upsert(w.sessions, s) })); flash(sessModal?.item ? `« ${s.title} » modifiée` : `« ${s.title} » planifiée`); setSessModal(null); };
  const deleteSession = (id: string) => { updateWmt((w) => ({ ...w, sessions: w.sessions.filter((s) => s.id !== id) })); setSessModal(null); flash('Session supprimée'); };

  const progOf = (id: string) => programs.find((p) => p.id === id);
  const seats = programs.reduce((a, p) => a + p.capacity, 0);
  const taken = participants.filter((p) => takesSeat(p.status)).length;
  const toReview = participants.filter((p) => p.status === 'Candidature').length;
  const next = [...sessions].filter((s) => daysUntil(s.date) >= 0).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

  const modals = (
    <>
      <ProgramModal open={!!progModal} eventName={current.name} initial={progModal?.item} icon={<Plus size={16} />} onClose={closeProg} onSubmit={saveProgram}
        linked={progModal?.item && { participants: participants.filter((p) => p.programId === progModal.item!.id).length, sessions: sessions.filter((s) => s.programId === progModal.item!.id).length }}
        onDelete={() => progModal?.item && deleteProgram(progModal.item.id)} />
      <ParticipantModal open={!!partModal} eventName={current.name} programs={programs} initial={partModal?.item} programId={program ?? undefined} icon={<UserPlus size={16} />}
        onClose={closePart} onSubmit={saveParticipant} onDelete={() => partModal?.item && deleteParticipant(partModal.item.id)} />
      <SessionModal open={!!sessModal} eventName={current.name} programs={programs} initial={sessModal?.item} programId={program ?? undefined} icon={<CalendarPlus size={16} />}
        onClose={closeSess} onSubmit={saveSession} onDelete={() => sessModal?.item && deleteSession(sessModal.item.id)} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
          <Check size={16} className="text-accent-400" /> {toast} — enregistré sur cet appareil
        </div>
      )}
    </>
  );

  if (!programs.length) {
    return (
      <>
        <div className="tile p-10 text-center">
          <GraduationCap size={28} className="mx-auto text-brand-600" />
          <div className="font-semibold mt-3">Aucun programme pour l’instant</div>
          <p className="text-sm text-ink-500 mt-1">Créez un programme Women in MiningTech ou Academy pour « {current.name} ».</p>
          <button type="button" onClick={() => setProgModal({})} className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
            <Plus size={18} /> Nouveau programme
          </button>
        </div>
        {modals}
      </>
    );
  }

  const tabs: { id: View; label: string; n: number; icon: typeof Users }[] = [
    { id: 'programmes', label: 'Programmes', n: programs.length, icon: GraduationCap },
    { id: 'participantes', label: 'Participantes', n: participants.length, icon: Users },
    { id: 'sessions', label: 'Sessions', n: sessions.length, icon: CalendarDays },
  ];
  const action = {
    programmes: { label: 'Nouveau programme', icon: Plus, run: () => setProgModal({}) },
    participantes: { label: 'Ajouter une participante', icon: UserPlus, run: () => setPartModal({}) },
    sessions: { label: 'Planifier une session', icon: CalendarPlus, run: () => setSessModal({}) },
  }[view];

  return (
    <div className="space-y-6">
      {/* Chiffres clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Programmes" value={String(programs.length)} hint={`${programs.filter((p) => p.kind === 'Women in MiningTech').length} WMT · ${programs.filter((p) => p.kind === 'Academy').length} Academy`} />
        <Stat label="Places occupées" value={`${taken} / ${seats}`} hint={seats ? `${Math.round((taken / seats) * 100)} % des places` : '—'} bar={seats ? taken / seats : 0} />
        <Stat label="Candidatures à étudier" value={String(toReview)} hint={toReview ? 'en attente de décision' : 'tout est traité'} warn={toReview > 0}
          onClick={toReview ? () => { setView('participantes'); setOnly(null); } : undefined} />
        <Stat dark label="Prochaine session" value={next ? fmtDate(next.date) : '—'} hint={next ? next.title : 'Aucune session à venir'} />
      </div>

      {/* Onglets + action principale */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-auto flex gap-1 p-1 rounded-2xl bg-white/70 ring-1 ring-ink-100 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Vues">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)}
              className={`flex-1 sm:flex-none sm:shrink-0 flex items-center justify-center gap-1 sm:gap-2 h-10 px-2 sm:px-4 rounded-xl text-[13px] sm:text-sm font-medium whitespace-nowrap transition ${view === t.id ? 'bg-brand-950 text-white' : 'text-brand-900 hover:bg-white'}`}>
              <t.icon size={15} className="hidden sm:block" /> {t.label} <span className="opacity-60 tabular-nums">{t.n}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={action.run} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
          className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <action.icon size={18} /> {action.label}
        </button>
      </div>

      {view === 'programmes' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {programs.map((p) => {
            const mine = participants.filter((x) => x.programId === p.id);
            const used = mine.filter((x) => takesSeat(x.status)).length;
            const full = used > p.capacity;
            const progSessions = sessions.filter((s) => s.programId === p.id);
            const upcoming = progSessions.filter((s) => daysUntil(s.date) >= 0).length;
            return (
              <article key={p.id} className="tile p-6 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${kindStyle(p)}`}>
                    {p.kind === 'Academy' ? <GraduationCap size={12} /> : <Sparkles size={12} />} {p.kind}
                  </span>
                  <button type="button" onClick={() => setProgModal({ item: p })} aria-label={`Modifier ${p.name}`} title="Modifier le programme"
                    className="w-9 h-9 -mt-1 -mr-1 rounded-full grid place-items-center text-ink-400 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
                </div>
                <h3 className="font-semibold text-xl mt-3">{p.name}</h3>
                <p className="text-xs text-ink-500 mt-1 flex items-center gap-1.5"><CalendarDays size={13} /> {fmtLong(p.start)} – {fmtLong(p.end)}</p>
                {p.description && <p className="text-sm text-ink-700 mt-3">{p.description}</p>}

                <div className="mt-5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">Places</span>
                    <span className={`tabular-nums ${full ? 'text-red-700 font-semibold' : 'text-ink-500'}`}>{used} / {p.capacity}{full ? ' · complet dépassé' : ''}</span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${full ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${Math.min((used / p.capacity) * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {participantStages.map((s) => {
                    const n = mine.filter((x) => x.status === s).length;
                    return n ? <span key={s} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stageStyle[s]}`}>{s} {n}</span> : null;
                  })}
                  {!mine.length && <span className="text-xs text-ink-500">Aucune participante pour l’instant</span>}
                </div>
                <div className="mt-auto pt-5 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setOnly(p.id); setView('participantes'); }} className="plate px-3 py-2.5 text-sm font-medium text-left hover:ring-brand-400 transition">
                    <Users size={15} className="inline -mt-0.5 mr-1.5 text-brand-600" />{mine.length} participante{mine.length > 1 ? 's' : ''}
                  </button>
                  <button type="button" onClick={() => { setOnly(p.id); setView('sessions'); }} className="plate px-3 py-2.5 text-sm font-medium text-left hover:ring-brand-400 transition">
                    <CalendarDays size={15} className="inline -mt-0.5 mr-1.5 text-brand-600" />{progSessions.length} session{progSessions.length > 1 ? 's' : ''}{upcoming ? ` · ${upcoming} à venir` : ''}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {view === 'participantes' && (
        <Participants eventName={current.name} programs={programs} participants={participants} program={program} setProgram={setOnly} progOf={progOf}
          onEdit={(p) => setPartModal({ item: p })} onStage={setStage} />
      )}

      {view === 'sessions' && (
        <Sessions programs={programs} sessions={sessions} program={program} setProgram={setOnly} progOf={progOf} onEdit={(s) => setSessModal({ item: s })} />
      )}
      {modals}
    </div>
  );
}

function Stat({ label, value, hint, bar, warn, dark, onClick }: { label: string; value: string; hint: string; bar?: number; warn?: boolean; dark?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className={`eyebrow !text-[10px] ${dark ? 'text-accent-400' : 'text-ink-500'}`}>{label}</div>
      <div className={`font-display text-4xl mt-2 leading-none ${warn ? 'text-royal-700' : ''}`}>{value}</div>
      <div className={`text-xs mt-2 truncate ${dark ? 'text-white/75' : 'text-ink-500'}`}>{hint}</div>
      {bar !== undefined && <div className="h-1.5 rounded-full bg-ink-100 mt-3 overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(bar * 100, 100)}%` }} /></div>}
    </>
  );
  const cls = `rounded-[24px] p-5 text-left min-w-0 ${dark ? 'tile-fx bg-brand-950 text-white [--fx:#d4a83f]' : 'tile'}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:ring-2 hover:ring-brand-400 transition`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

const chip = (on: boolean) => `shrink-0 h-9 px-4 rounded-full text-sm font-medium transition ${on ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`;

function ProgramFilter({ programs, program, setProgram, count }: { programs: Program[]; program: string | null; setProgram: (id: string | null) => void; count: (id: string | null) => number }) {
  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer par programme">
      <button type="button" onClick={() => setProgram(null)} aria-pressed={!program} className={chip(!program)}>
        Tous les programmes <span className="opacity-60 tabular-nums">{count(null)}</span>
      </button>
      {programs.map((p) => (
        <button key={p.id} type="button" onClick={() => setProgram(program === p.id ? null : p.id)} aria-pressed={program === p.id} className={chip(program === p.id)}>
          {p.name} <span className="opacity-60 tabular-nums">{count(p.id)}</span>
        </button>
      ))}
    </div>
  );
}

function Participants({ eventName, programs, participants, program, setProgram, progOf, onEdit, onStage }: {
  eventName: string; programs: Program[]; participants: Participant[]; program: string | null; setProgram: (id: string | null) => void;
  progOf: (id: string) => Program | undefined; onEdit: (p: Participant) => void; onStage: (id: string, s: ParticipantStage) => void;
}) {
  const [stage, setStage] = useState<ParticipantStage | null>(null);
  const [q, setQ] = useState('');
  const byProgram = program ? participants.filter((p) => p.programId === program) : participants;
  const needle = q.trim().toLowerCase();
  const shown = byProgram
    .filter((p) => !stage || p.status === stage)
    .filter((p) => !needle || `${p.name} ${p.organisation} ${p.email}`.toLowerCase().includes(needle))
    .sort((a, b) => participantStages.indexOf(a.status) - participantStages.indexOf(b.status) || a.name.localeCompare(b.name));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  // Le fichier contient exactement la liste affichée (programme, étape et recherche compris).
  const doExport = async () => {
    const filters = [program ? progOf(program)?.name : 'tous les programmes', stage ?? 'toutes les étapes', needle && `recherche « ${q.trim()} »`].filter(Boolean).join(' · ');
    setExporting(true); setExportError('');
    try {
      await downloadSheet({
        title: 'Participantes', sheet: 'Participantes', fileBase: 'participantes', eventName, filters,
        headers: ['Nom', 'Fonction ou établissement', 'E-mail', 'Programme', 'Type', 'Étape'],
        widths: [24, 34, 28, 30, 20, 14],
        rows: shown.map((p) => { const prog = progOf(p.programId); return [p.name, p.organisation, p.email, prog?.name ?? '', prog?.kind ?? '', p.status]; }),
        total: [`${shown.length} participante${shown.length > 1 ? 's' : ''}`, null, null, null, null, null],
      });
    } catch { setExportError('L’export a échoué. Réessayez.'); }
    finally { setExporting(false); }
  };
  return (
    <div className="tile p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{shown.length} participante{shown.length > 1 ? 's' : ''} affichée{shown.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={doExport} disabled={exporting || !shown.length} title="Exporter la liste affichée en Excel (.xlsx)"
          className="flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900 disabled:opacity-50 transition">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Exporter en Excel
        </button>
      </div>
      {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
      <ProgramFilter programs={programs} program={program} setProgram={setProgram} count={(id) => (id ? participants.filter((p) => p.programId === id).length : participants.length)} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer par étape">
          {participantStages.map((s) => {
            const n = byProgram.filter((p) => p.status === s).length;
            return (
              <button key={s} type="button" onClick={() => setStage(stage === s ? null : s)} aria-pressed={stage === s}
                className={`shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition ring-1 ${stage === s ? 'ring-brand-950 ring-2' : 'ring-transparent'} ${stageStyle[s]}`}>
                {s} <span className="opacity-70 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input type="search" aria-label="Rechercher une participante" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full h-9 rounded-full bg-[var(--sand)] pl-9 pr-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
        </label>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200 bg-white" aria-label="Participantes">
          {shown.map((p) => {
            const prog = progOf(p.programId);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-900 text-accent-400 text-sm font-semibold grid place-items-center">{initials(p.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{p.name}</span>
                  <span className="block text-xs text-ink-500 truncate">{p.organisation || '—'}{!program && prog ? ` · ${prog.name}` : ''}</span>
                </span>
                <ChipMenu value={p.status} options={participantStages} onChange={(v) => onStage(p.id, v as ParticipantStage)} chip={(v) => stageStyle[v as ParticipantStage]} label={`Étape de ${p.name}`} align="right" />
                <button type="button" onClick={() => onEdit(p)} aria-label={`Modifier ${p.name}`} title="Modifier"
                  className="w-9 h-9 -mr-2 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Nothing onReset={() => { setStage(null); setQ(''); setProgram(null); }}>Aucune participante ne correspond.</Nothing>
      )}
    </div>
  );
}

function Sessions({ programs, sessions, program, setProgram, progOf, onEdit }: {
  programs: Program[]; sessions: WmtSession[]; program: string | null; setProgram: (id: string | null) => void;
  progOf: (id: string) => Program | undefined; onEdit: (s: WmtSession) => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const mine = (program ? sessions.filter((s) => s.programId === program) : sessions);
  const key = (s: WmtSession) => s.date + (s.time || '00:00');
  const upcoming = mine.filter((s) => daysUntil(s.date) >= 0).sort((a, b) => key(a).localeCompare(key(b)));
  const past = mine.filter((s) => daysUntil(s.date) < 0).sort((a, b) => key(b).localeCompare(key(a)));
  const row = (s: WmtSession, done: boolean) => {
    const d = new Date(s.date + 'T00:00:00');
    const left = daysUntil(s.date);
    const prog = progOf(s.programId);
    return (
      <li key={s.id} className={`flex items-center gap-4 px-4 py-3 ${done ? 'opacity-70' : ''}`}>
        <span className={`w-14 shrink-0 rounded-xl py-1.5 text-center ${done ? 'bg-ink-100 text-ink-700' : 'bg-brand-950 text-white'}`}>
          <span className="block font-display text-2xl leading-none">{d.getDate()}</span>
          <span className="block text-[10px] uppercase tracking-wider mt-0.5">{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-medium truncate">{s.title}</span>
            {!done && left <= 7 && <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-royal-300/50 text-royal-700">{left === 0 ? 'Aujourd’hui' : `J-${left}`}</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500 mt-0.5">
            {s.time && <span className="flex items-center gap-1"><Clock size={12} />{s.time.replace(':', ' h ')}</span>}
            {s.place && <span className="flex items-center gap-1"><MapPin size={12} />{s.place}</span>}
            {s.speaker && <span className="flex items-center gap-1"><Mic size={12} />{s.speaker}</span>}
          </span>
          {!program && prog && <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${kindStyle(prog)}`}>{prog.name}</span>}
        </span>
        <button type="button" onClick={() => onEdit(s)} aria-label={`Modifier la session ${s.title}`} title="Modifier"
          className="w-9 h-9 -mr-2 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
      </li>
    );
  };
  return (
    <div className="tile p-6 space-y-4">
      <ProgramFilter programs={programs} program={program} setProgram={setProgram} count={(id) => (id ? sessions.filter((s) => s.programId === id).length : sessions.length)} />
      <h3 className="text-sm font-semibold">À venir <span className="text-ink-500 font-normal">· {upcoming.length}</span></h3>
      {upcoming.length
        ? <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200 bg-white" aria-label="Sessions à venir">{upcoming.map((s) => row(s, false))}</ul>
        : <p className="plate px-4 py-3 text-sm text-ink-500">Aucune session à venir.</p>}
      {past.length > 0 && (
        <>
          <button type="button" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast} className="text-sm font-semibold text-brand-700 hover:underline">
            {showPast ? 'Masquer' : 'Afficher'} les sessions passées ({past.length})
          </button>
          {showPast && <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200 bg-white" aria-label="Sessions passées">{past.map((s) => row(s, true))}</ul>}
        </>
      )}
    </div>
  );
}

function Nothing({ children, onReset }: { children: ReactNode; onReset: () => void }) {
  return (
    <div className="rounded-2xl ring-1 ring-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-500">
      {children}{' '}
      <button type="button" onClick={onReset} className="font-medium text-brand-700 hover:underline">Tout afficher</button>
    </div>
  );
}

