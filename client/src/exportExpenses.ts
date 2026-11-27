import { downloadSheet } from './excel';
import { detailOf, paymentOf, type Expense } from './demo';

/* Export Excel de la liste des dépenses affichée (filtres compris). */

export type ExportRow = Expense & { poste: string };

export function exportExpenses(rows: ExportRow[], eventName: string, filters: string) {
  return downloadSheet({
    title: 'Dépenses', sheet: 'Dépenses', fileBase: 'depenses', eventName, filters,
    headers: ['Date', 'Poste', 'Description', 'Statut', 'Payé / avancé le', 'Quantité', 'Prix unitaire', 'Prix total'],
    widths: [12, 22, 44, 12, 16, 10, 14, 14],
    rows: rows.map((r) => { const p = paymentOf(r), d = detailOf(r); return [{ date: r.date }, r.poste, r.label, p.status, { date: p.on }, d.qty, Number.isInteger(d.unit) ? { money: d.unit } : d.unit, { money: r.amount }]; }),
    total: [null, null, 'Total', null, null, null, null, { money: rows.reduce((a, r) => a + r.amount, 0) }],
  });
}
