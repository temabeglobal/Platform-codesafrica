import { useState } from 'react';
import { CalendarRange } from 'lucide-react';

/* Filtre par date partagé par les listes de dépenses : un mois (« 2026-10 »), une période (du… au…), ou tout. */

export function useDateFilter() {
  const [month, setMonth] = useState<string | null>(null);
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const reset = () => { setMonth(null); setRange(false); setFrom(''); setTo(''); };
  const active = !!month || (range && (!!from || !!to));
  const match = (date: string) => (month ? date.startsWith(month) : range ? (!from || date >= from) && (!to || date <= to) : true);
  return { month, setMonth, range, setRange, from, setFrom, to, setTo, reset, active, match };
}
export type DateFilterState = ReturnType<typeof useDateFilter>;

/** Pastilles « Toutes », un mois par mois présent (avec le nombre), « Période » et ses deux dates. */
export function DateFilterBar({ f, dates, size = 'sm' }: { f: DateFilterState; dates: string[]; size?: 'sm' | 'md' }) {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
  const chip = (on: boolean) =>
    `shrink-0 rounded-full font-medium transition ${size === 'md' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-xs'} ${on ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`;
  const field = 'h-9 min-w-0 w-full rounded-xl bg-white px-3 text-sm text-brand-950 outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500';
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer par date">
        <button type="button" onClick={f.reset} aria-pressed={!f.month && !f.range} className={chip(!f.month && !f.range)}>Toutes dates</button>
        {months.map((m) => {
          const n = dates.filter((d) => d.startsWith(m)).length;
          const label = new Date(m + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
          return (
            <button key={m} type="button" onClick={() => { f.setRange(false); f.setMonth(f.month === m ? null : m); }} aria-pressed={f.month === m} className={chip(f.month === m)}>
              {label} <span className="opacity-60 tabular-nums">{n}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => { f.setMonth(null); f.setRange(!f.range); if (f.range) { f.setFrom(''); f.setTo(''); } }} aria-pressed={f.range} className={`${chip(f.range)} flex items-center gap-1.5`}>
          <CalendarRange size={13} /> Période
        </button>
      </div>
      {f.range && (
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <label className="text-xs text-ink-500 space-y-1"><span>Du</span><input type="date" aria-label="Du" className={field} value={f.from} max={f.to || undefined} onChange={(e) => f.setFrom(e.target.value)} /></label>
          <label className="text-xs text-ink-500 space-y-1"><span>Au</span><input type="date" aria-label="Au" className={field} value={f.to} min={f.from || undefined} onChange={(e) => f.setTo(e.target.value)} /></label>
        </div>
      )}
    </div>
  );
}
