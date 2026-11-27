import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Users, type LucideIcon } from 'lucide-react';
import type { Team } from '../demo';

/* Champ texte qui propose, dès la première lettre tapée, les noms enregistrés dans Équipe
   (équipes, responsables d'équipe, membres). On peut toujours écrire un autre nom. */

export interface NameOption { name: string; detail: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const TITLES = new Set(['m', 'mme', 'mlle', 'dr', 'pr', 'me']);

/** Tous les noms de l'onglet Équipe, sans doublon. `peopleOnly` : les personnes seulement, sans les équipes. */
export function teamNames(teams: Team[], peopleOnly = false): NameOption[] {
  const out = new Map<string, NameOption>();
  const add = (name: string, detail: string) => {
    const k = norm(name);
    if (k && !out.has(k)) out.set(k, { name: name.trim(), detail });
  };
  if (!peopleOnly) for (const t of teams) {
    const n = t.members.length + (t.lead.trim() ? 1 : 0);
    add(`Équipe ${t.name}`, `${n} personne${n > 1 ? 's' : ''}`);
  }
  for (const t of teams) add(t.lead, `Responsable · ${t.name}`);
  for (const t of teams) for (const m of t.members) add(m.name, [m.role, t.name].filter(Boolean).join(' · '));
  return [...out.values()];
}

/** Vrai si le nom, ou l'un de ses mots (hors M., Mme…), commence par ce qui est tapé. */
function startsWith(name: string, query: string) {
  const q = norm(query);
  if (!q) return false;
  const n = norm(name);
  if (n.startsWith(q)) return true;
  const words = n.split(/[\s.'’()-]+/).filter((w) => w && !TITLES.has(w));
  const rest = words.join(' ');
  return rest.startsWith(q) || words.some((w) => w.startsWith(q));
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: NameOption[];
  className: string;
  placeholder?: string;
  label?: string;
  /** Icône des suggestions (par défaut : des personnes). */
  icon?: LucideIcon;
}

export default function NameSuggest({ value, onChange, options, className, placeholder, label, icon: Icon = Users }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  /* La liste est en position fixe pour ne pas être coupée par la zone qui défile de la fenêtre.
     Elle s'ouvre vers le haut quand il n'y a pas la place en dessous (petit écran, bas de fenêtre). */
  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom, above = r.top;
    const up = below < 270 && above > below;
    const room = Math.min(256, (up ? above : below) - 12);
    setPos(up
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, maxHeight: room }
      : { left: r.left, width: r.width, top: r.bottom + 6, maxHeight: room });
  };
  const show = () => { place(); setOpen(true); };
  const id = useId();

  const matches = useMemo(() => {
    const list = options.filter((o) => startsWith(o.name, value) && norm(o.name) !== norm(value));
    return list.slice(0, 8);
  }, [options, value]);
  const shown = open && matches.length > 0;

  useEffect(() => {
    if (!shown) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [shown]);

  const pick = (o: NameOption) => { onChange(o.name); setOpen(false); };

  return (
    <div ref={box} className="relative">
      <input
        className={className} placeholder={placeholder} value={value} aria-label={label}
        role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={`${id}-list`}
        aria-activedescendant={shown ? `${id}-${active}` : undefined} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); show(); setActive(0); }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
          else if (e.key === 'Enter' || e.key === 'Tab') { if (e.key === 'Enter') e.preventDefault(); pick(matches[active]); }
          else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        }}
      />
      {shown && (
        <ul id={`${id}-list`} role="listbox"
          style={pos}
          className={`fixed z-[60] overflow-y-auto rounded-xl bg-white ring-1 ring-ink-200 shadow-[0_16px_32px_-12px_rgba(1,33,43,.35)] py-1`}>
          {matches.map((o, i) => (
            <li key={o.name} id={`${id}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${i === active ? 'bg-brand-50' : ''}`}>
              <span className="w-7 h-7 shrink-0 rounded-full bg-brand-100 text-brand-700 grid place-items-center"><Icon size={14} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{o.name}</span>
                <span className="block text-xs text-ink-500 truncate">{o.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
