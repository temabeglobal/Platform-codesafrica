import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Check, ChevronRight, Mic, Search, Trash2, Users } from 'lucide-react';
import { useEvents } from '../events';
import {
  SPEAKER_STATUSES, byTime, dayLabel, eventDays, shortDay, speakerCounts, speakerStatusStyle,
  type ProgrammeItem, type SpeakerStatus,
} from '../programme';
import ProgrammeModal from '../components/ProgrammeModal';
import ThemeModal from '../components/ThemeModal';

/* Programme de l'événement, en trois sous-menus :
   - Heure : les sessions jour par jour ;
   - Thématiques : chaque thématique et ses intervenants (confirmés, en cours, empêchés) ;
   - Modérateurs : qui modère quoi.
   Maquette : rien n'est encore enregistré en base. */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n: number, one: string, many = one + 's') => `${n} ${n > 1 ? many : one}`;
const chip = (on: boolean) => `shrink-0 flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium transition ${on ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`;
const count = (on: boolean) => `text-xs tabular-nums ${on ? 'text-accent-400' : 'text-ink-400'}`;

/** Fenêtres et messages communs aux trois sous-menus. */
function useProgrammeTools() {
  const { current, data: { programme }, updateProgramme } = useEvents();
  const [editing, setEditing] = useState<{ item?: ProgrammeItem; date?: string } | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); }, []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeTheme = useCallback(() => setThemeId(null), []);

  const days = useMemo(() => eventDays(current.start, current.end), [current.start, current.end]);
  const sorted = useMemo(() => [...programme].sort(byTime), [programme]);

  const submit = (p: ProgrammeItem) => {
    const exists = programme.some((x) => x.id === p.id);
    updateProgramme((list) => (exists ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
    setEditing(null);
    flash(`« ${p.theme} » ${exists ? 'modifiée' : 'ajoutée au programme'} — enregistré sur cet appareil`);
  };
  const remove = (p: ProgrammeItem) => {
    updateProgramme((list) => list.filter((x) => x.id !== p.id));
    setEditing(null); setThemeId(null);
    flash(`« ${p.theme} » retirée du programme — enregistré sur cet appareil`);
  };

  const ui = (
    <>
      <ThemeModal itemId={themeId} hidden={!!editing} onClose={closeTheme} onToast={flash}
        onEditSession={() => setEditing({ item: programme.find((p) => p.id === themeId) })}
        onDeleteSession={() => { const p = programme.find((x) => x.id === themeId); if (p) remove(p); }} />
      <ProgrammeModal open={!!editing} eventName={current.name} days={days} defaultDate={editing?.date} initial={editing?.item}
        onClose={closeEdit} onSubmit={submit} onDelete={() => editing?.item && remove(editing.item)} />
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
    </>
  );
  return { days, sorted, openTheme: setThemeId, addSession: (date?: string) => setEditing({ date }), remove, ui };
}

function Toolbar({ summary, onAdd, label = 'Ajouter une session' }: { summary: ReactNode; onAdd: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-500">{summary}</span>
      <button type="button" onClick={onAdd} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
        className="tile-fx fx-sm shrink-0 flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
        <CalendarPlus size={18} /> {label}
      </button>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block flex-1 min-w-[200px]">
      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-full bg-white pl-10 pr-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
    </label>
  );
}

/** Petits points colorés : le nombre d'intervenants par statut. */
function SpeakerDots({ item }: { item: ProgrammeItem }) {
  if (!item.speakers.length) return <span className="text-xs text-ink-400 italic">Aucun intervenant</span>;
  const c = speakerCounts(item.speakers);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
      <span className="flex items-center gap-1"><Users size={13} className="text-ink-400" /> {plural(item.speakers.length, 'intervenant')}</span>
      {SPEAKER_STATUSES.filter((s) => c[s]).map((s) => (
        <span key={s} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${speakerStatusStyle[s].dot}`} aria-hidden />{c[s]} {s.toLowerCase()}{c[s] > 1 && s !== 'En cours' ? 's' : ''}</span>
      ))}
    </span>
  );
}

/* ——— Heure ——— */

export function HorairesView() {
  const { days, sorted, openTheme, addSession, remove, ui } = useProgrammeTools();
  const [day, setDay] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const allDays = useMemo(() => [...new Set([...days, ...sorted.map((p) => p.date)])].sort(), [days, sorted]);
  const shownDay = day && allDays.includes(day) ? day : null;
  const visibleDays = shownDay ? [shownDay] : allDays;

  return (
    <div className="space-y-6">
      <Toolbar summary={`${plural(sorted.length, 'session')} · ${plural(days.length, 'jour')}`} onAdd={() => addSession(shownDay ?? undefined)} />

      {allDays.length > 1 && (
        <div role="group" aria-label="Filtrer par jour" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button type="button" aria-pressed={!shownDay} onClick={() => setDay(null)} className={chip(!shownDay)}>
            Tous les jours <span className={count(!shownDay)}>{sorted.length}</span>
          </button>
          {allDays.map((d) => (
            <button key={d} type="button" aria-pressed={shownDay === d} onClick={() => setDay(d)} className={chip(shownDay === d)}>
              <span className="first-letter:uppercase">{shortDay(d)}</span>
              <span className={count(shownDay === d)}>{sorted.filter((p) => p.date === d).length}</span>
            </button>
          ))}
        </div>
      )}

      {!visibleDays.length && <div className="tile p-8 text-center text-sm text-ink-500">Aucune session pour l’instant.</div>}
      {visibleDays.map((d, i) => {
        const list = sorted.filter((p) => p.date === d);
        return (
          <section key={d} className="tile p-5 sm:p-6" aria-labelledby={`jour-${d}`}>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 id={`jour-${d}`} className="font-display text-2xl tracking-wide first-letter:uppercase">
                <span className="text-brand-600 mr-2">Jour {days.indexOf(d) >= 0 ? days.indexOf(d) + 1 : i + 1}</span>{dayLabel(d)}
              </h2>
              <span className="text-sm text-ink-500 shrink-0">{plural(list.length, 'session')}</span>
            </div>
            {list.length ? (
              <ol className="relative space-y-2 before:absolute before:left-[4.6rem] sm:before:left-[5.6rem] before:top-2 before:bottom-2 before:w-px before:bg-ink-200">
                {list.map((p) => (
                  <li key={p.id} className="relative flex items-start gap-1 group/row">
                    {confirm === p.id && (
                      <div role="alert" className="absolute inset-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 ring-1 ring-red-200 px-4 py-2">
                        <span className="min-w-0 flex-1 text-sm text-red-800">Supprimer « {p.theme} » du programme ?</span>
                        <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-sm text-brand-900 hover:bg-white">Annuler</button>
                        <button type="button" onClick={() => { remove(p); setConfirm(null); }} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Supprimer</button>
                      </div>
                    )}
                    <button type="button" onClick={() => openTheme(p.id)} aria-label={`${p.theme}, ${p.start} : voir les intervenants`}
                      className="min-w-0 flex-1 grid grid-cols-[4rem_1fr_auto] sm:grid-cols-[5rem_1fr_auto] gap-x-5 items-start text-left rounded-2xl px-2 py-3 hover:bg-[var(--sand)] transition group">
                      <span className="tabular-nums">
                        <span className="block font-semibold text-brand-950">{p.start}</span>
                        {p.end && <span className="block text-xs text-ink-500">{p.end}</span>}
                      </span>
                      <span className="relative min-w-0">
                        <span className="absolute -left-[1.6rem] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
                        <span className="block font-semibold">{p.theme}</span>
                        <span className={`mt-1 flex items-center gap-1.5 text-sm ${p.moderator ? 'text-ink-600' : 'text-ink-400 italic'}`}>
                          <Mic size={14} className="shrink-0" /> {p.moderator ? <>Modération : {p.moderator}</> : 'Modérateur à désigner'}
                        </span>
                        <span className="mt-1.5 block"><SpeakerDots item={p} /></span>
                      </span>
                      <ChevronRight size={18} className="mt-1 text-ink-300 group-hover:text-ink-500" />
                    </button>
                    <button type="button" onClick={() => setConfirm(p.id)} aria-label={`Supprimer la session ${p.theme}`} title="Supprimer la session"
                      className="mt-2.5 w-9 h-9 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-red-700 hover:bg-red-50 transition"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-500">
                Aucune session ce jour-là.{' '}
                <button type="button" onClick={() => addSession(d)} className="font-semibold text-brand-700 underline underline-offset-2">Ajouter une session</button>
              </p>
            )}
          </section>
        );
      })}
      {ui}
    </div>
  );
}

/* ——— Thématiques ——— */

export function ThematiquesView() {
  const { sorted, openTheme, addSession, ui } = useProgrammeTools();
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [query, setQuery] = useState('');

  const all = sorted.flatMap((p) => p.speakers);
  const totals = speakerCounts(all);
  const q = fold(query.trim());
  const list = sorted.filter((p) =>
    (!status || p.speakers.some((s) => s.status === status)) &&
    (!q || fold(p.theme).includes(q) || p.speakers.some((s) => fold(s.name + ' ' + s.title).includes(q))));

  return (
    <div className="space-y-6">
      <Toolbar summary={`${plural(sorted.length, 'thématique')} · ${plural(all.length, 'intervenant')}`} onAdd={() => addSession()} label="Ajouter une thématique" />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Rechercher une thématique ou un intervenant" />
        <div role="group" aria-label="Filtrer par statut des intervenants" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button type="button" aria-pressed={!status} onClick={() => setStatus(null)} className={chip(!status)}>
            Tous <span className={count(!status)}>{all.length}</span>
          </button>
          {SPEAKER_STATUSES.map((st) => (
            <button key={st} type="button" aria-pressed={status === st} onClick={() => setStatus(st)} className={chip(status === st)} title={speakerStatusStyle[st].hint}>
              <span className={`w-2 h-2 rounded-full ${speakerStatusStyle[st].dot}`} aria-hidden />{st}
              <span className={count(status === st)}>{totals[st]}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {list.map((p) => {
            const c = speakerCounts(p.speakers);
            const shown = status ? p.speakers.filter((s) => s.status === status) : p.speakers;
            return (
              <button key={p.id} type="button" onClick={() => openTheme(p.id)} aria-label={`${p.theme} : voir les intervenants`}
                className="tile p-5 text-left flex flex-col gap-3 hover:ring-brand-400 transition group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-500 first-letter:uppercase">{shortDay(p.date)} · {p.start}{p.end && ` – ${p.end}`}</p>
                    <h2 className="font-semibold text-lg leading-snug mt-0.5">{p.theme}</h2>
                    <p className={`mt-1 flex items-center gap-1.5 text-sm ${p.moderator ? 'text-ink-600' : 'text-ink-400 italic'}`}>
                      <Mic size={14} className="shrink-0" /> {p.moderator || 'Modérateur à désigner'}
                    </p>
                  </div>
                  <ChevronRight size={18} className="mt-1 shrink-0 text-ink-300 group-hover:text-ink-500" />
                </div>
                {p.speakers.length > 0 && (
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-ink-100" aria-hidden>
                    {SPEAKER_STATUSES.map((st) => c[st] > 0 && <span key={st} className={speakerStatusStyle[st].dot} style={{ width: `${(c[st] / p.speakers.length) * 100}%` }} />)}
                  </div>
                )}
                {shown.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {shown.slice(0, 4).map((s) => (
                      <li key={s.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ring-1 ${speakerStatusStyle[s.status].badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${speakerStatusStyle[s.status].dot}`} aria-hidden />
                        {s.name}<span className="sr-only"> ({s.status})</span>
                      </li>
                    ))}
                    {shown.length > 4 && <li className="px-2.5 py-1 text-xs text-ink-500">+{shown.length - 4}</li>}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-400 italic">Aucun intervenant pour l’instant</p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tile p-8 text-center text-sm text-ink-500">
          {sorted.length ? <>Aucune thématique ne correspond. <button type="button" onClick={() => { setStatus(null); setQuery(''); }} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></> : 'Aucune thématique pour l’instant.'}
        </div>
      )}
      {ui}
    </div>
  );
}

/* ——— Modérateurs ——— */

const TO_ASSIGN = '';
const initials = (name: string) =>
  name.replace(/\(.*?\)/g, '').replace(/^(M\.|Mme|Mlle|Dr|Pr)\s+/i, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export function ModerateursView() {
  const { sorted, openTheme, addSession, ui } = useProgrammeTools();
  const [query, setQuery] = useState('');

  const byModerator = useMemo(() => {
    const map = new Map<string, ProgrammeItem[]>();
    for (const p of sorted) map.set(p.moderator.trim(), [...(map.get(p.moderator.trim()) ?? []), p]);
    // Les modérateurs par ordre alphabétique, les sessions sans modérateur à la fin.
    return [...map.entries()].sort(([a], [b]) => (a === TO_ASSIGN ? 1 : b === TO_ASSIGN ? -1 : a.localeCompare(b, 'fr')));
  }, [sorted]);
  const named = byModerator.filter(([m]) => m !== TO_ASSIGN).length;
  const q = fold(query.trim());
  const shown = byModerator.filter(([m, list]) => !q || fold(m || 'à désigner').includes(q) || list.some((p) => fold(p.theme).includes(q)));

  return (
    <div className="space-y-6">
      <Toolbar summary={`${plural(named, 'modérateur')} · ${plural(sorted.filter((p) => !p.moderator.trim()).length, 'session')} sans modérateur`} onAdd={() => addSession()} />
      <SearchBox value={query} onChange={setQuery} placeholder="Rechercher un modérateur ou une thématique" />

      {shown.length ? (
        <div className="grid md:grid-cols-2 gap-4">
          {shown.map(([m, list]) => (
            <section key={m || 'a-designer'} className={`tile p-5 ${m ? '' : 'border-2 border-dashed border-royal-300'}`} aria-label={m || 'Modérateur à désigner'}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`w-11 h-11 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${m ? 'bg-brand-950 text-accent-400' : 'bg-royal-100 text-royal-800'}`}>
                  {m ? initials(m) : <Mic size={18} />}
                </span>
                <div className="min-w-0">
                  <h2 className={`font-semibold text-lg truncate ${m ? '' : 'italic text-royal-800'}`}>{m || 'Modérateur à désigner'}</h2>
                  <p className="text-sm text-ink-500">{plural(list.length, 'session')} {m ? 'à modérer' : 'sans modérateur'}</p>
                </div>
              </div>
              <ul className="space-y-1">
                {list.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openTheme(p.id)} aria-label={`${p.theme} : voir les intervenants`}
                      className="w-full flex items-start gap-3 text-left rounded-xl px-2 py-2 hover:bg-[var(--sand)] transition group">
                      <span className="w-24 shrink-0 text-xs text-ink-500 pt-0.5 first-letter:uppercase tabular-nums">{shortDay(p.date)}<br />{p.start}{p.end && ` – ${p.end}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{p.theme}</span>
                        <span className="mt-1 block"><SpeakerDots item={p} /></span>
                      </span>
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-300 group-hover:text-ink-500" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="tile p-8 text-center text-sm text-ink-500">
          {sorted.length ? <>Aucun modérateur ne correspond. <button type="button" onClick={() => setQuery('')} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></> : 'Aucune session pour l’instant.'}
        </div>
      )}
      {ui}
    </div>
  );
}
