import { useEffect, useState } from 'react';
import { Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react';
import PaymentBadge, { ProviderBadge } from './PaymentBadge';
import { detailOf, fmtDate, type BudgetLine, type Expense } from '../demo';
import { DateFilterBar, useDateFilter } from './DateFilter';

/* Détail d'un poste de budget : la liste de ses dépenses, les plus récentes d'abord. */

interface Props {
  line?: BudgetLine;
  onClose: () => void;
  /** Ouvre « Ajouter une dépense » avec ce poste déjà choisi. */
  onAdd: () => void;
  /** Supprime une dépense du poste (après confirmation). */
  onDelete: (id: string) => void;
  /** Ouvre la dépense en mode « Modifier ». */
  onEdit: (e: Expense) => void;
  /** Masquée pendant qu'une autre fenêtre est ouverte par-dessus (le filtre est conservé). */
  hidden?: boolean;
}

const fmt = (n: number) => n.toLocaleString('fr-FR') + ' $';

export default function BudgetLineModal({ line, onClose, onAdd, onDelete, onEdit, hidden }: Props) {
  const open = !!line && !hidden;
  const [confirm, setConfirm] = useState<string | null>(null);
  const f = useDateFilter();
  const { reset } = f;
  // Un autre poste ouvert : on repart sans filtre.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reset(); setConfirm(null); }, [line?.label]);
  useEffect(() => {
    if (!open) return;
    setConfirm(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!line || hidden) return null;
  const all = [...(line.expenses ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = f.active;
  const expenses = all.filter((e) => f.match(e.date));
  const shownTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const detailed = all.reduce((a, e) => a + e.amount, 0);
  // Montant déjà engagé avant le détail des dépenses (données plus anciennes).
  const undetailed = Math.max(line.spent - detailed, 0);
  const rest = line.planned - line.spent;
  const pct = line.planned ? Math.round((line.spent / line.planned) * 100) : 0;
  const over = rest < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="line-modal-title">
      <div className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-[var(--sand)] rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden">
        <div className="relative overflow-hidden bg-brand-950 text-white px-6 pt-6 pb-5 shrink-0">
          <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-accent-400 !text-[10px]">Poste de budget</p>
              <h2 id="line-modal-title" className="font-display text-3xl tracking-wide truncate">{line.label}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"><X size={18} /></button>
          </div>
          <div className="relative grid grid-cols-3 gap-3 mt-5">
            <Stat label="Prévu" value={fmt(line.planned)} />
            <Stat label="Dépensé" value={fmt(line.spent)} />
            <Stat label={over ? 'Dépassement' : 'Reste'} value={fmt(Math.abs(rest))} warn={over} />
          </div>
          <div className="relative h-1.5 rounded-full bg-white/15 mt-4 overflow-hidden">
            <div className={`h-full rounded-full ${over ? 'bg-red-400' : 'bg-brand-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <p className="relative text-xs text-white/70 mt-1.5">{pct} % du montant prévu</p>
        </div>
        <div className="chevron-band shrink-0" style={{ height: 12 }} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {all.length > 1 && (
            <div className="mb-4"><DateFilterBar f={f} dates={all.map((e) => e.date)} /></div>
          )}
          <p className="text-sm font-medium mb-2">
            {filtered
              ? <>{expenses.length} dépense{expenses.length > 1 ? 's' : ''} sur {all.length} · <span className="tabular-nums">{fmt(shownTotal)}</span></>
              : <>{all.length} dépense{all.length > 1 ? 's' : ''}</>}
          </p>
          {filtered && !expenses.length ? (
            <div className="bg-white rounded-2xl ring-1 ring-ink-200 px-4 py-6 text-center text-sm text-ink-500">
              Aucune dépense sur cette période.{' '}
              <button type="button" onClick={reset} className="font-medium text-brand-700 hover:underline">Tout afficher</button>
            </div>
          ) : expenses.length || undetailed ? (
            <ul className="bg-white rounded-2xl ring-1 ring-ink-200 divide-y divide-ink-100" aria-label={`Dépenses du poste ${line.label}`}>
              {expenses.map((e) => (
                <li key={e.id} className={`flex items-center gap-3 px-4 py-3 ${confirm === e.id ? 'bg-red-50' : ''}`}>
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-900 text-accent-400 grid place-items-center"><ReceiptText size={17} /></span>
                  {confirm === e.id ? (
                    <>
                      <span className="min-w-0 flex-1 text-sm text-red-800">Supprimer « {e.label} » ({fmt(e.amount)}) ?</span>
                      <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-sm text-brand-900 hover:bg-white">Annuler</button>
                      <button type="button" onClick={() => { onDelete(e.id); setConfirm(null); }} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Supprimer</button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{e.label}</span>
                        <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-ink-500">{fmtDate(e.date)} <PaymentBadge e={e} /> <ProviderBadge e={e} /></span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">{fmt(e.amount)}</span>
                        <span className="block text-[11px] text-ink-500 tabular-nums" title="Quantité × prix unitaire">{detailOf(e).qty.toLocaleString('fr-FR')} × {fmt(detailOf(e).unit)}</span>
                      </span>
                      <button type="button" onClick={() => onEdit(e)} aria-label={`Modifier la dépense ${e.label}`} title="Modifier la dépense"
                        className="w-9 h-9 -mr-2 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
                      <button type="button" onClick={() => setConfirm(e.id)} aria-label={`Supprimer la dépense ${e.label}`} title="Supprimer la dépense"
                        className="w-9 h-9 -mr-2 shrink-0 rounded-full grid place-items-center text-ink-400 hover:text-red-700 hover:bg-red-50 transition"><Trash2 size={15} /></button>
                    </>
                  )}
                </li>
              ))}
              {undetailed > 0 && !filtered && (
                <li className="flex items-center gap-3 px-4 py-3">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-ink-100 text-ink-500 grid place-items-center"><ReceiptText size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink-700">Montant non détaillé</span>
                    <span className="block text-xs text-ink-500">Dépenses enregistrées sans détail</span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0 text-ink-700">{fmt(undetailed)}</span>
                </li>
              )}
            </ul>
          ) : (
            <div className="bg-white rounded-2xl ring-1 ring-ink-200 px-4 py-6 text-center text-sm text-ink-500">Aucune dépense pour ce poste.</div>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 bg-white/70 border-t border-ink-200 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600">
            <Plus size={16} /> Ajouter une dépense
          </button>
          <button type="button" onClick={onClose} className="ml-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900">Fermer</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/10 ring-1 ring-white/15 px-3 py-2 min-w-0">
      <div className="text-[11px] text-white/70">{label}</div>
      <div className={`font-semibold tabular-nums truncate ${warn ? 'text-red-300' : ''}`}>{value}</div>
    </div>
  );
}
