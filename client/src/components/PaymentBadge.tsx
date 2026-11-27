import { CheckCircle2, Clock, Truck } from 'lucide-react';
import { useEvents } from '../events';
import { fmtDate, paymentOf, type Expense } from '../demo';

/** Pastille « Payé le … » ou « Avance le … » d'une dépense. */
export default function PaymentBadge({ e }: { e: Expense }) {
  const { status, on } = paymentOf(e);
  const paid = status === 'Payé';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${paid ? 'bg-accent-500/15 text-accent-700' : 'bg-royal-400/20 text-royal-700'}`}>
      {paid ? <CheckCircle2 size={12} /> : <Clock size={12} />} {paid ? 'Payé' : 'Avance'} le {fmtDate(on)}
    </span>
  );
}

/** Pastille du prestataire d'une dépense (rien si aucun prestataire n'est lié). */
export function ProviderBadge({ e }: { e: Expense }) {
  const { data } = useEvents();
  const p = e.provider ? data.providers.find((x) => x.id === e.provider) : undefined;
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-800">
      <Truck size={12} /> {p.name}
    </span>
  );
}
