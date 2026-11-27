/* Lecture des pièces jointes envoyées à Sonia, entièrement dans le navigateur :
   - Excel (.xlsx) et Word (.docx) : le texte et les tableaux sont extraits (un .xlsx/.docx est une archive zip de fichiers XML) ;
   - CSV et texte : lus tels quels ;
   - images (capture d'écran, photo d'une liste) : réduites puis envoyées à Sonia, qui lit l'image.
   Le fichier lui-même n'est ni envoyé ni stocké : seul son contenu part avec la question. */

import { unzipSync, strFromU8 } from 'fflate';

export interface ReadFile {
  name: string;
  /** Texte extrait (tableaux : une ligne par rangée, colonnes séparées par des tabulations). */
  text?: string;
  /** Image prête à être envoyée (data URL JPEG). */
  image?: string;
  /** Pourquoi le fichier n'a pas pu être lu. */
  error?: string;
}

const MAX_TEXT = 60_000;
const MAX_IMAGE_SIDE = 2000;

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));
const clean = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()))
  .filter((r) => r.some(Boolean)).map((r) => r.join('\t').replace(/\t+$/, '')).join('\n');

/** Colonne d'une référence de cellule Excel (« C12 » → 2). */
const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readXlsx(buf: Uint8Array): string {
  const files = unzipSync(buf);
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : '');
  const shared = byTag(xml(get('xl/sharedStrings.xml') || '<sst/>'), 'si').map((si) => byTag(si, 't').map((t) => t.textContent ?? '').join(''));
  // Noms des feuilles, dans l'ordre du classeur.
  const book = xml(get('xl/workbook.xml'));
  const rels = xml(get('xl/_rels/workbook.xml.rels') || '<Relationships/>');
  const target = (rid: string) => byTag(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') ?? '';
  const sheets = byTag(book, 'sheet').map((s, i) => {
    const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    const t = target(rid).replace(/^\/?(xl\/)?/, '');
    return { name: s.getAttribute('name') ?? `Feuille ${i + 1}`, path: `xl/${t || `worksheets/sheet${i + 1}.xml`}` };
  });
  const out: string[] = [];
  for (const sh of sheets.length ? sheets : [{ name: 'Feuille 1', path: 'xl/worksheets/sheet1.xml' }]) {
    const doc = get(sh.path);
    if (!doc) continue;
    const rows = byTag(xml(doc), 'row').map((row) => {
      const cells: string[] = [];
      for (const c of byTag(row, 'c')) {
        const type = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent ?? '';
        const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? byTag(c, 't').map((t) => t.textContent).join('') : v;
        cells[colIndex(c.getAttribute('r') ?? '')] = value;
      }
      return Array.from(cells, (x) => x ?? '');
    });
    const text = clean(rows);
    if (text) out.push(sheets.length > 1 ? `Feuille « ${sh.name} » :\n${text}` : text);
  }
  return out.join('\n\n');
}

function readDocx(buf: Uint8Array): string {
  const files = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' });
  const body = byTag(xml(strFromU8(files['word/document.xml'] ?? new Uint8Array())), 'body')[0];
  if (!body) return '';
  const para = (p: Element) => byTag(p, 't').map((t) => t.textContent ?? '').join('');
  const lines: string[] = [];
  // Paragraphes et tableaux dans l'ordre du document ; un tableau garde ses colonnes (tabulations).
  for (const el of Array.from(body.children)) {
    if (el.localName === 'p') { const t = para(el).trim(); if (t) lines.push(t); }
    else if (el.localName === 'tbl') lines.push(clean(byTag(el, 'tr').map((tr) => byTag(tr, 'tc').map((tc) => byTag(tc, 'p').map(para).join(' ')))));
  }
  return lines.join('\n');
}

/** Image réduite (côté le plus long ≤ 2000 px), en JPEG : assez nette pour lire des noms, assez légère pour l'envoi. */
async function readImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // fond blanc pour les PNG transparents
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export const ACCEPTED = '.xlsx,.docx,.csv,.txt,.tsv,image/*';

export async function readFile(file: File): Promise<ReadFile> {
  const name = file.name;
  const e = ext(name);
  try {
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'].includes(e)) return { name, image: await readImage(file) };
    let text = '';
    if (e === 'xlsx' || e === 'xlsm') text = readXlsx(new Uint8Array(await file.arrayBuffer()));
    else if (e === 'docx') text = readDocx(new Uint8Array(await file.arrayBuffer()));
    else if (['csv', 'txt', 'tsv', 'md'].includes(e) || file.type.startsWith('text/')) text = (await file.text()).replace(/;/g, e === 'csv' ? '\t' : ';');
    else if (e === 'xls' || e === 'doc') return { name, error: 'Ancien format Office : enregistrez-le en .xlsx ou .docx, puis renvoyez-le.' };
    else if (e === 'pdf') return { name, error: 'Les PDF ne sont pas encore lus : envoyez une capture d’écran de la page, ou le fichier Excel/Word d’origine.' };
    else return { name, error: 'Format non lu (Excel .xlsx, Word .docx, CSV, texte ou image).' };
    text = text.trim();
    if (!text) return { name, error: 'Aucun texte trouvé dans ce fichier.' };
    return { name, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[… fichier tronqué]` : text };
  } catch {
    return { name, error: 'Fichier illisible ou abîmé.' };
  }
}
