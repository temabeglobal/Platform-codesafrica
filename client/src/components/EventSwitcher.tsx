import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPin, Pencil } from 'lucide-react';
import { useEvents } from '../events';
import { daysUntil } from '../demo';
import EventModal, { type EventInput } from './EventModal';
import { emptyNetwork } from './EventNetworkStep';

const fmtRange = (start: string, end: string) => {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  return start === end ? a.toLocaleDateString('fr-FR', o) : `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('fr-FR', o)}`;
};

const status = (start: string, end: string) => {
  const d = daysUntil(start);
  if (d > 0) return { label: `J-${d}`, cls: 'bg-royal-300/50 text-royal-700' };
  if (daysUntil(end) >= 0) return { label: 'En cours', cls: 'bg-accent-400/25 text-accent-700' };
  return { label: 'Terminé', cls: 'bg-ink-100 text-ink-700' };
};

/** Sélecteur d'événement : change l'événement actif de la plateforme, et permet de modifier
    un événement depuis n'importe quelle page (sans revenir à l'accueil). */
export default function EventSwitcher() {
  const { events, current, select, update } = useEvents();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const closeEdit = useCallback(() => setEditId(null), []);
  const editing = events.find((e) => e.id === editId);
  const editInitial: EventInput | undefined = editing && (() => {
    const { id: _id, ...fields } = editing;
    return { ...fields, documents: [], network: emptyNetwork() };
  })();
  const submitEdit = (e: EventInput) => {
    if (!editId) return;
    update(editId, { name: e.name, start: e.start, end: e.end, place: e.place, type: e.type, color: e.color,
      reference: e.reference, description: e.description, budget: e.budget, owner: e.owner, attendees: e.attendees });
    setEditId(null);
    setToast(`« ${e.name} » modifié — enregistré sur cet appareil`);
    setTimeout(() => setToast(''), 4000);
  };
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const i = Math.max(events.findIndex((e) => e.id === current.id), 0);
    setTimeout(() => items.current[i]?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, events, current.id]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
  };

  return (
    <>
    <div ref={root} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Événement actif : ${current.name}. Changer d’événement`}
        className="tile-fx fx-sm w-full sm:w-auto sm:min-w-[300px] flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-[0_12px_32px_-16px_rgba(1,33,43,.35)]"
        style={{ ['--fx' as string]: '#d4a83f', ['--fx-o' as string]: 0.1 }}
      >
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: current.color }} />
        <span className="min-w-0 flex-1">
          <span className="block eyebrow text-ink-500 !text-[10px]">Événement</span>
          <span className="block font-semibold truncate">{current.name}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-brand-700 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-full sm:w-[360px] rounded-2xl bg-white shadow-2xl ring-1 ring-ink-200 overflow-hidden" onKeyDown={onListKey}>
          <ul role="listbox" aria-label="Événements" className="max-h-[320px] overflow-y-auto p-2">
            {events.map((ev, i) => {
              const st = status(ev.start, ev.end);
              const active = ev.id === current.id;
              return (
                <li key={ev.id} className="group relative">
                  <button
                    ref={(el) => { items.current[i] = el; }}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { select(ev.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 rounded-xl pl-3 pr-12 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? 'bg-[var(--sand)]' : 'hover:bg-[var(--sand)]'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ev.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{ev.name}</span>
                      <span className="flex items-center gap-1 text-xs text-ink-500 truncate">{fmtRange(ev.start, ev.end)} · <MapPin size={11} />{ev.place}</span>
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                    <Check size={16} className={`shrink-0 ${active ? 'text-brand-700' : 'invisible'}`} />
                  </button>
                  <button type="button" onClick={() => { setEditId(ev.id); setOpen(false); }} aria-label={`Modifier ${ev.name}`} title="Modifier l’événement"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full grid place-items-center text-ink-500 hover:text-brand-900 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition">
                    <Pencil size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
    {/* Rendu au niveau de la page : le sélecteur est dans un bloc à plan propre, qui sinon passerait sous l'en-tête. */}
    {createPortal(<>
    <EventModal open={!!editInitial} onClose={closeEdit} onSubmit={submitEdit} initial={editInitial} />
    {toast && (
      <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl">
        <Check size={16} className="text-accent-400" /> {toast}
      </div>
    )}
    </>, document.body)}
    </>
  );
}
