import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, Pencil, Trash2, X, ChevronRight, Flag, Globe, Mail, Megaphone, Newspaper, Radio, Share2, type LucideIcon } from 'lucide-react';
import type { CommItem } from '../demo';
import type { PlatformEvent } from '../events';

/* Calendrier du planning de communication (même lecture que le calendrier de TIMLY) :
   un mois en grille, une pastille par publication, l'événement lui-même en période dorée,
   et le détail du jour choisi juste en dessous. */

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX = 3; // pastilles visibles par jour avant « +N autres »

const CHANNEL: Record<string, { Icon: LucideIcon; light: string; dot: string }> = {
  'Réseaux sociaux': { Icon: Share2, light: 'bg-brand-500/10 text-brand-700', dot: 'bg-brand-400' },
  'E-mail': { Icon: Mail, light: 'bg-accent-500/10 text-accent-700', dot: 'bg-accent-400' },
  'Site web': { Icon: Globe, light: 'bg-[#7b5cd6]/10 text-[#5b3fb0]', dot: 'bg-[#8f73e6]' },
  Presse: { Icon: Newspaper, light: 'bg-ink-500/10 text-ink-700', dot: 'bg-ink-500' },
  'Radio / TV': { Icon: Radio, light: 'bg-[#d0573a]/10 text-[#a83d24]', dot: 'bg-[#e0694b]' },
  Affichage: { Icon: Megaphone, light: 'bg-royal-400/20 text-royal-700', dot: 'bg-royal-400' },
};
const channelOf = (c: string) => CHANNEL[c] ?? { Icon: Megaphone, light: 'bg-ink-100 text-ink-700', dot: 'bg-ink-400' };

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Entry = { kind: 'post'; item: CommItem } | { kind: 'event'; label: string };

interface Props {
  items: CommItem[];
  event: PlatformEvent;
  /** Après une planification : le calendrier va au jour de la nouvelle publication. */
  focus?: { date: string; n: number } | null;
  onPlan: (date: string) => void;
  onEdit: (item: CommItem) => void;
  onDelete: (item: CommItem) => void;
  /** Filtre par canal, partagé avec la vue Liste. */
  filter: ChannelFilterState;
}

export default function CommCalendar({ items, event, focus, onPlan, onEdit, onDelete, filter }: Props) {
  const todayKey = keyOf(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayKey);
  // Vue Mois ou Semaine ; le choix est gardé sur l'appareil.
  const [view, setView] = useState<'mois' | 'semaine'>(() => { try { return localStorage.getItem('comm-cal-vue') === 'semaine' ? 'semaine' : 'mois'; } catch { return 'mois'; } });
  const chooseView = (v: 'mois' | 'semaine') => {
    setView(v);
    try { localStorage.setItem('comm-cal-vue', v); } catch { /* stockage indisponible */ }
    // En passant à la semaine, on garde le jour choisi s'il est dans le mois affiché, sinon le 1er du mois.
    if (v === 'semaine' && !selected.startsWith(keyOf(month).slice(0, 7))) setSelected(keyOf(month));
  };

  // Publications et jours de l'événement, rangés par jour.
  const { only } = filter;
  const visible = useMemo(() => (only.length ? items.filter((i) => only.includes(i.channel)) : items), [items, only]);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const add = (k: string, e: Entry) => map.set(k, [...(map.get(k) ?? []), e]);
    if (event.start) {
      const end = event.end && event.end >= event.start ? event.end : event.start;
      for (let d = fromKey(event.start); keyOf(d) <= end; d.setDate(d.getDate() + 1)) add(keyOf(d), { kind: 'event', label: event.name });
    }
    [...visible].sort((a, b) => a.date.localeCompare(b.date)).forEach((item) => add(item.date, { kind: 'post', item }));
    return map;
  }, [visible, event]);

  // Grille de 6 semaines commençant un lundi.
  const cells = useMemo(() => {
    const first = new Date(month);
    const shift = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  useEffect(() => {
    if (!focus) return;
    const d = fromKey(focus.date);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(focus.date);
  }, [focus]);

  // Semaine du jour choisi, du lundi au dimanche.
  const week = useMemo(() => {
    const d = fromKey(selected);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [selected]);

  const go = (delta: number) => {
    if (view === 'mois') { setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1)); return; }
    const d = fromKey(selected); d.setDate(d.getDate() + 7 * delta);
    setSelected(keyOf(d)); setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayKey); };

  // Résumé de la période affichée : publications passées, à venir.
  const monthKey = keyOf(month).slice(0, 7);
  const [from, to] = view === 'mois' ? [`${monthKey}-01`, `${monthKey}-31`] : [keyOf(week[0]), keyOf(week[6])];
  const inMonth = visible.filter((i) => i.date >= from && i.date <= to);
  const period = view === 'mois' ? 'ce mois-ci' : 'cette semaine';
  const weekTitle = () => {
    const a = week[0], b = week[6];
    const sameMonth = a.getMonth() === b.getMonth();
    const left = a.toLocaleDateString('fr-FR', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    return `${left} – ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: sameMonth ? 'long' : 'short', year: 'numeric' })}`;
  };
  const upcoming = inMonth.filter((i) => i.date >= todayKey).length;
  const dayList = byDay.get(selected) ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] overflow-hidden bg-white text-ink-900 ring-1 ring-ink-100 shadow-[0_24px_60px_-34px_rgba(1,33,43,.35)]">
        <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-5 border-b border-ink-100">
          <div className="mr-auto">
            <h2 className="text-2xl font-bold tracking-tight">{view === 'mois' ? cap(month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })) : weekTitle()}</h2>
            <p className="text-xs text-ink-500 mt-1">
              {inMonth.length ? `${inMonth.length} publication${inMonth.length > 1 ? 's' : ''} ${period} · ${upcoming} à venir` : `Aucune publication ${period}`}
              {only.length > 0 && ` · filtré sur ${only.length} canal${only.length > 1 ? 'aux' : ''}`}
            </p>
          </div>
          <div className="inline-flex p-0.5 rounded-full bg-ink-100/70" role="group" aria-label="Affichage du calendrier">
            {(['mois', 'semaine'] as const).map((v) => (
              <button key={v} type="button" onClick={() => chooseView(v)} aria-pressed={view === v}
                className={`h-8 px-3.5 rounded-full text-sm transition ${view === v ? 'bg-white text-brand-950 font-medium shadow-sm' : 'text-ink-500 hover:text-brand-900'}`}>
                {v === 'mois' ? 'Mois' : 'Semaine'}
              </button>
            ))}
          </div>
          <button type="button" onClick={goToday} className="h-9 px-4 rounded-full ring-1 ring-ink-200 text-sm hover:bg-ink-50 transition">Aujourd’hui</button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label={view === 'mois' ? 'Mois précédent' : 'Semaine précédente'} className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-100 transition"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => go(1)} aria-label={view === 'mois' ? 'Mois suivant' : 'Semaine suivante'} className="w-9 h-9 rounded-full grid place-items-center hover:bg-ink-100 transition"><ChevronRight size={18} /></button>
          </div>
        </div>

        {/* Filtre par canal (sert aussi de légende) */}
        <div className="px-5 sm:px-6 py-3 border-b border-ink-100 bg-ink-50/40">
          <ChannelFilter filter={filter} items={items} from={from} to={to} showEvent />
        </div>

        {view === 'semaine' ? (
          <div className="grid grid-cols-7">
            {week.map((d, i) => {
              const k = keyOf(d);
              const list = byDay.get(k) ?? [];
              const isToday = k === todayKey;
              return (
                <button key={k} type="button" onClick={() => setSelected(k)} onDoubleClick={() => onPlan(k)} title="Double-cliquez pour planifier ce jour-là"
                  className={`flex flex-col items-stretch justify-start text-left border-r border-ink-100 last:border-r-0 min-h-[220px] sm:min-h-[340px] transition-colors hover:bg-brand-500/5
                    ${selected === k ? 'ring-2 ring-inset ring-brand-500 bg-brand-500/10' : ''}`}>
                  <span className="flex flex-col items-center gap-1 py-3 border-b border-ink-100">
                    <span className="text-xs sm:text-sm font-medium text-ink-500">{DAYS[i]}</span>
                    <span className={`grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-sm sm:text-base font-semibold ${isToday ? 'bg-brand-500 text-white' : 'text-ink-900'}`}>{d.getDate()}</span>
                  </span>
                  <span className="hidden sm:block p-2 space-y-1.5">
                    {list.map((e, j) => <Chip key={j} entry={e} past={k < todayKey} wrap />)}
                  </span>
                  <span className="sm:hidden flex flex-col items-center gap-1 pt-2">
                    {list.map((e, j) => <span key={j} className={`w-2 h-2 rounded-full ${e.kind === 'event' ? 'bg-royal-500' : channelOf(e.item.channel).dot}`} />)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (<>
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
              <button key={k} type="button" onClick={() => setSelected(k)} onDoubleClick={() => onPlan(k)} title="Double-cliquez pour planifier ce jour-là"
                className={`relative flex flex-col items-start justify-start text-left border-b border-r border-ink-100 [&:nth-child(7n)]:border-r-0 min-h-[64px] sm:min-h-[116px] p-1.5 sm:p-2 transition-colors hover:bg-brand-500/5
                  ${out ? 'bg-ink-50/70' : ''} ${selected === k ? 'ring-2 ring-inset ring-brand-500 bg-brand-500/10' : ''}`}>
                <span className={`inline-grid place-items-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-sm font-medium
                  ${isToday ? 'bg-brand-500 text-white' : out ? 'text-ink-400' : 'text-ink-900'}`}>{d.getDate()}</span>
                {list.length > 0 && (
                  <>
                    <span className="hidden sm:block mt-1 space-y-1 w-full">
                      {list.slice(0, MAX).map((e, i) => <Chip key={i} entry={e} past={k < todayKey} />)}
                      {list.length > MAX && <span className="block text-[11px] text-ink-500 pl-1">+{list.length - MAX} autre{list.length - MAX > 1 ? 's' : ''}</span>}
                    </span>
                    <span className="sm:hidden flex flex-wrap gap-0.5 pl-1 mt-0.5">
                      {list.slice(0, 4).map((e, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${e.kind === 'event' ? 'bg-royal-500' : channelOf(e.item.channel).dot}`} />)}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        </>)}
      </div>

      {/* Détail du jour choisi */}
      <div className="tile p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-ink-500"><CalendarDays size={15} />
          {cap(fromKey(selected).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
          {selected === todayKey && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-royal-300/40 text-royal-700">Aujourd’hui</span>}
        </div>
        {dayList.length ? (
          <ul className="mt-3 divide-y divide-ink-100">
            {dayList.map((e, i) => {
              if (e.kind === 'event') return (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className="w-11 h-11 rounded-2xl grid place-items-center bg-royal-400/20 text-royal-700 shrink-0"><Flag size={18} /></span>
                  <div className="min-w-0"><div className="font-semibold truncate">{e.label}</div><div className="text-xs text-ink-500">{event.place} · jour de l’événement</div></div>
                </li>
              );
              const c = channelOf(e.item.channel);
              const past = selected < todayKey;
              return (
                <li key={`${e.item.channel}-${e.item.subject}-${i}`} className="flex items-center gap-3 py-3">
                  <span className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${c.light}`}><c.Icon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold truncate ${past ? 'line-through text-ink-500' : ''}`}>{e.item.subject}</div>
                    <div className="text-xs text-ink-500">{e.item.channel}{past ? ' · publié' : ' · prévu'}</div>
                  </div>
                  <CommActions item={e.item} onEdit={onEdit} onDelete={onDelete} />
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-3 text-sm text-ink-500">Rien de prévu ce jour-là.</p>}
      </div>
    </div>
  );
}

function Chip({ entry, past, wrap }: { entry: Entry; past: boolean; wrap?: boolean }) {
  if (entry.kind === 'event') return (
    <span className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-tight font-medium bg-royal-400/25 text-royal-700 min-w-0">
      <Flag size={11} className="shrink-0" /><span className={wrap ? 'break-words' : 'truncate'}>{entry.label}</span>
    </span>
  );
  const c = channelOf(entry.item.channel);
  return (
    <span className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-tight font-medium min-w-0 ${c.light} ${past ? 'opacity-55' : ''}`} title={`${entry.item.subject} · ${entry.item.channel}`}>
      <c.Icon size={11} className={`shrink-0 ${wrap ? 'self-start mt-px' : ''}`} /><span className={`${wrap ? 'break-words' : 'truncate'} ${past ? 'line-through' : ''}`}>{entry.item.subject}</span>
    </span>
  );
}

/** Modifier ou supprimer une publication ; la suppression demande une confirmation sur place. */
export function CommActions({ item, onEdit, onDelete }: { item: CommItem; onEdit: (c: CommItem) => void; onDelete: (c: CommItem) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="text-xs text-red-700 hidden sm:inline">Supprimer ?</span>
      <button type="button" onClick={() => onDelete(item)} aria-label={`Confirmer la suppression de « ${item.subject} »`} title="Supprimer définitivement"
        className="w-9 h-9 rounded-full grid place-items-center bg-red-600 text-white hover:bg-red-700 transition"><Check size={16} /></button>
      <button type="button" onClick={() => setConfirm(false)} aria-label="Annuler la suppression" title="Annuler"
        className="w-9 h-9 rounded-full grid place-items-center text-ink-500 hover:bg-ink-100 transition"><X size={16} /></button>
    </span>
  );
  return (
    <span className="flex items-center gap-1 shrink-0">
      <button type="button" onClick={() => onEdit(item)} aria-label={`Modifier « ${item.subject} »`} title="Modifier"
        className="w-9 h-9 rounded-full grid place-items-center text-ink-500 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
      <button type="button" onClick={() => setConfirm(true)} aria-label={`Supprimer « ${item.subject} »`} title="Supprimer"
        className="w-9 h-9 rounded-full grid place-items-center text-ink-500 hover:text-red-700 hover:bg-red-50 transition"><Trash2 size={15} /></button>
    </span>
  );
}

/* ——— Filtre par canal, partagé par le calendrier et la liste ———
   Aucun canal choisi = tous les canaux. Le choix est gardé sur l'appareil. */
export type ChannelFilterState = { only: string[]; set: (next: string[] | ((cur: string[]) => string[])) => void };
export function useChannelFilter(): ChannelFilterState {
  const [only, setOnly] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('comm-canaux') ?? '[]'); } catch { return []; } });
  const set: ChannelFilterState['set'] = (next) => setOnly((cur) => {
    const value = typeof next === 'function' ? next(cur) : next;
    try { localStorage.setItem('comm-canaux', JSON.stringify(value)); } catch { /* stockage indisponible */ }
    return value;
  });
  return { only, set };
}

/** Barre de filtre. `from`/`to` (AAAA-MM-JJ) : les nombres portent sur cette période ; sinon sur toutes les publications. */
export function ChannelFilter({ filter: { only, set }, items, from, to, showEvent }: { filter: ChannelFilterState; items: CommItem[]; from?: string; to?: string; showEvent?: boolean }) {
  const channels = [...new Set([...Object.keys(CHANNEL), ...items.map((i) => i.channel)])];
  const count = (c: string) => items.filter((i) => i.channel === c && (!from || i.date >= from) && (!to || i.date <= to)).length;
  const toggle = (c: string) => set((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const idle = 'bg-white ring-1 ring-ink-200 hover:ring-brand-400';
  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer par canal">
      <button type="button" onClick={() => set([])} aria-pressed={!only.length}
        className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition ${!only.length ? 'bg-brand-500 text-white' : `${idle} text-ink-700`}`}>
        Tous les canaux
      </button>
      {channels.map((name) => {
        const c = channelOf(name), on = only.includes(name), n = count(name);
        const text = on ? 'bg-brand-950 text-white' : `${idle} ${only.length ? 'text-ink-400' : 'text-ink-700'}`;
        return (
          <button key={name} type="button" onClick={() => toggle(name)} aria-pressed={on}
            className={`shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition ${text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} /> {name}
            {n > 0 && <span className={`ml-0.5 tabular-nums ${on ? 'text-white/60' : 'text-ink-400'}`}>{n}</span>}
          </button>
        );
      })}
      {showEvent && <span className="shrink-0 flex items-center gap-1.5 h-8 px-2 text-xs text-ink-500"><span className="w-2 h-2 rounded-full bg-royal-400" /> Événement</span>}
    </div>
  );
}
