import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Trash2 } from 'lucide-react';

/** Menu « ⋮ » : pour l'instant, une seule action, la suppression (confirmée ensuite par l'appelant).
    Le menu est affiché par-dessus toute la page, pour ne jamais être coupé par le bord d'une carte ;
    il s'ouvre vers le haut s'il manque de place en bas de l'écran. */
export default function RowMenu({ name, deleteLabel, onDelete }: { name: string; deleteLabel: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = menu.current?.offsetHeight ?? 56;
    const up = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
    setPos({ top: up ? r.top - 6 - h : r.bottom + 6, right: Math.max(window.innerWidth - r.right, 8), up });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" aria-label={`Options pour ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`w-9 h-9 rounded-full grid place-items-center transition ${open ? 'bg-ink-100 text-brand-950' : 'text-ink-500 hover:bg-ink-100 hover:text-brand-950'}`}>
        <MoreVertical size={18} />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" style={{ position: 'fixed', top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
          className="z-[70] min-w-[220px] rounded-2xl bg-white shadow-[0_18px_40px_-12px_rgba(1,33,43,.35)] ring-1 ring-ink-200 p-1.5">
          <button type="button" role="menuitem" autoFocus onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50 focus:bg-red-50 outline-none text-left">
            <Trash2 size={16} /> {deleteLabel}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
