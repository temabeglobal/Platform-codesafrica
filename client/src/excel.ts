/* Export Excel (.xlsx) généré dans le navigateur : rien n'est envoyé à un serveur.
   La bibliothèque est chargée seulement au moment de l'export, pour ne pas alourdir la page. */

export type ExcelCell = string | number | { date: string } | { money: number } | null;

export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const MONEY = '#,##0 "$"';

const toCell = (c: ExcelCell, bold = false) => {
  if (c === null) return null;
  const b = bold ? { fontWeight: 'bold' as const } : {};
  if (typeof c === 'number') return { value: c, type: Number, ...b };
  if (typeof c === 'string') return { value: c, ...b };
  // Date en UTC : sinon le fuseau horaire décale la cellule Excel au jour précédent.
  if ('date' in c) return { value: new Date(c.date + 'T00:00:00Z'), type: Date, format: 'dd/mm/yyyy', ...b };
  return { value: c.money, type: Number, format: MONEY, ...b };
};

/** Propose le fichier au téléchargement. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface SheetSpec { title: string; filters: string; sheet: string; headers: string[]; widths: number[]; rows: ExcelCell[][]; total?: ExcelCell[] }

const head = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#E6F7FB' });
const sheetOf = ({ title, filters, sheet, headers, widths, rows, total }: SheetSpec, eventName: string) => ({
  sheet,
  columns: widths.map((width) => ({ width })),
  stickyRowsCount: 5,
  data: [
    [{ value: `${title} — ${eventName}`, fontWeight: 'bold' as const }],
    [{ value: filters ? `Filtres : ${filters}` : '' }],
    [{ value: `Exporté le ${new Date().toLocaleDateString('fr-FR')}` }],
    [],
    headers.map(head),
    ...rows.map((r) => r.map((c) => toCell(c))),
    ...(total ? [total.map((c) => toCell(c, true))] : []),
  ],
});

/** Classeur de plusieurs feuilles, renvoyé sous forme de fichier (sans le télécharger). */
export async function buildWorkbook(sheets: SheetSpec[], fileBase: string, eventName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await writeExcelFile(sheets.map((s) => sheetOf(s, eventName)) as any).toBlob();
  return { blob, name: `${fileBase}-${slug(eventName)}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

/** Une feuille : titre, ligne de filtres, date d'export, puis le tableau (en-tête figé) et une ligne de total facultative. */
export async function downloadSheet({ fileBase, eventName, ...spec }: SheetSpec & { fileBase: string; eventName: string }) {
  const { blob, name } = await buildWorkbook([spec], fileBase, eventName);
  saveBlob(blob, name);
}
