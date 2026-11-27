/* Fichiers du bilan (évaluation après l'événement) en PDF, Word ou Excel, générés dans le navigateur.
   Rien n'est envoyé à un serveur : fonctionne hors connexion. Utilisé par la page Bilan et par Sonia. */

import { strToU8, zipSync } from 'fflate';
import type { EventData } from './demo';
import type { PlatformEvent } from './events';
import { buildWorkbook, slug, type ExcelCell } from './excel';
import { EVAL_KINDS, averageOf, fmtScore, kindDef, scoreOf, statsOf, subjectsOf, verdict } from './evaluation';

export type BilanFormat = 'pdf' | 'word' | 'excel';
export interface BilanFile { blob: Blob; name: string; format: BilanFormat }

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso: string) => { const [y, m, d] = (iso || '').split('-').map(Number); return y ? `${d} ${MONTHS[m - 1]} ${y}` : ''; };
const num = (n: number) => n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const money = (n: number) => `${num(Math.round(n))} $`;
const today = () => new Date().toISOString().slice(0, 10);

/** Les chiffres clés, dans le même ordre que le rapport PDF. */
function figuresOf(event: PlatformEvent, data: EventData): [string, string, string][] {
  const expected = Number(event.attendees) || 0;
  const st = statsOf(data, expected);
  const ev = data.evaluation;
  const overall = averageOf(subjectsOf(data).map((s) => ev.entries[s.key]));
  return [
    ['Participants', st.attendance !== undefined ? num(st.attendance) : '—', expected ? `${num(expected)} attendus${st.attendanceRate !== undefined ? ` · ${st.attendanceRate} %` : ''}` : 'Nombre attendu non renseigné'],
    ['Budget dépensé', money(st.spent), st.planned ? `${st.budgetRate} % de ${money(st.planned)}` : 'Aucun budget prévu'],
    ['Tâches terminées', st.tasks ? `${st.tasksDone} / ${st.tasks}` : '—', st.tasksRate !== undefined ? `${st.tasksRate} %` : 'Aucune tâche'],
    ['Programme', `${st.sessions} session${st.sessions > 1 ? 's' : ''}`, `${st.speakersConfirmed} intervenants confirmés · ${st.speakersAbsent} empêchés`],
    ['Sponsoring reçu', money(st.sponsorAmount), `${st.sponsorsPaid} payés sur ${st.sponsorsConfirmed} confirmés`],
    ['Badges émis', num(st.badges), `${st.people} personnes dans les équipes`],
    ['Satisfaction générale', ev.satisfaction ? `${ev.satisfaction} / 5` : '—', verdict(ev.satisfaction)],
    ['Note moyenne des fiches', overall !== undefined ? `${fmtScore(overall)} / 5` : '—', verdict(overall)],
  ];
}

const evalRows = (data: EventData) => subjectsOf(data).map((s) => {
  const e = data.evaluation.entries[s.key], n = scoreOf(e);
  return { kind: kindDef(s.kind).label, name: s.name, detail: s.detail, score: n, verdict: verdict(n),
    criteria: Object.entries(e?.scores ?? {}).map(([c, v]) => `${c} : ${v}`).join(' · '), again: e?.again ?? '', comment: e?.comment ?? '' };
});

/* ---------- Excel : une feuille par partie du bilan ---------- */

async function bilanExcel(event: PlatformEvent, data: EventData) {
  const ev = data.evaluation;
  const st = statsOf(data, Number(event.attendees) || 0);
  const sheets = [
    { title: 'Bilan chiffré', filters: '', sheet: 'Bilan chiffré', headers: ['Indicateur', 'Valeur', 'Détail'], widths: [28, 20, 50],
      rows: figuresOf(event, data) as ExcelCell[][] },
    { title: 'Budget par poste', filters: '', sheet: 'Budget', headers: ['Poste', 'Prévu', 'Dépensé', 'Écart'], widths: [34, 16, 16, 16],
      rows: data.budget.map((b): ExcelCell[] => [b.label, { money: b.planned }, { money: b.spent }, { money: b.spent - b.planned }]),
      total: ['Total', { money: st.planned }, { money: st.spent }, { money: st.gap }] as ExcelCell[] },
    { title: 'Bilan général', filters: '', sheet: 'Bilan général', headers: ['Rubrique', 'Contenu'], widths: [34, 100],
      rows: [
        ['Satisfaction générale', ev.satisfaction ? `${ev.satisfaction} / 5 · ${verdict(ev.satisfaction)}` : 'Non notée'],
        ['Points forts', ev.strengths.trim() || 'Non renseigné.'],
        ['Points à améliorer', ev.improvements.trim() || 'Non renseigné.'],
        ['Recommandations pour la prochaine édition', ev.recommendations.trim() || 'Non renseigné.'],
      ] as ExcelCell[][] },
    { title: 'Évaluation après l’événement', filters: 'toutes les fiches', sheet: 'Évaluation',
      headers: ['Type', 'Nom', 'Détail', 'Note /5', 'Appréciation', 'Notes par critère', 'À reconduire', 'Commentaire'],
      widths: [22, 28, 40, 9, 16, 60, 14, 60],
      rows: evalRows(data).map((r): ExcelCell[] => [r.kind, r.name, r.detail, r.score === undefined ? null : Math.round(r.score * 10) / 10, r.verdict, r.criteria, r.again, r.comment]) },
  ];
  return buildWorkbook(sheets, 'bilan', event.name);
}

/* ---------- Word (.docx) : document construit à la main (un .docx est une archive zip de fichiers XML) ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
interface RunOpt { bold?: boolean; italic?: boolean; size?: number; color?: string }
const run = (t: string, o: RunOpt = {}) =>
  `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${(o.size ?? 10.5) * 2}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (t: string, o: RunOpt & { after?: number; align?: 'right' | 'center' } = {}) =>
  `<w:p><w:pPr><w:spacing w:after="${o.after ?? 120}"/>${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${run(t, o)}</w:p>`;
const heading = (t: string) =>
  `<w:p><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="0088A8"/></w:pBdr></w:pPr>${run(t.toUpperCase(), { bold: true, size: 15, color: '0D1520' })}</w:p>`;
const lines = (t: string, o: RunOpt = {}) => t.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => para(l, o)).join('');

/** Tableau : largeurs en pourcentage de la page, première ligne en en-tête. */
function table(widths: number[], rows: string[][], o: { boldLast?: boolean; right?: number[] } = {}) {
  const W = 9638; // largeur utile A4 en vingtièmes de point (marges de 2 cm)
  const cell = (t: string, w: number, i: number, header: boolean, bold: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${Math.round((w / 100) * W)}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="E6F7FB"/>' : ''}</w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:after="0"/>${o.right?.includes(i) ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(t, { bold: header || bold, size: 9.5, color: header ? '5A6A82' : undefined })}</w:p></w:tc>`;
  const border = '<w:top w:val="single" w:sz="4" w:color="D0D8E0"/><w:bottom w:val="single" w:sz="4" w:color="D0D8E0"/><w:insideH w:val="single" w:sz="4" w:color="D0D8E0"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${Math.round((w / 100) * W)}"/>`).join('')}</w:tblGrid>`
    + rows.map((r, ri) => `<w:tr>${ri === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.map((c, i) => cell(c, widths[i], i, ri === 0, !!o.boldLast && ri === rows.length - 1)).join('')}</w:tr>`).join('')
    + '</w:tbl>' + para('', { after: 120 });
}

function bilanWord(event: PlatformEvent, data: EventData) {
  const ev = data.evaluation;
  const st = statsOf(data, Number(event.attendees) || 0);
  const when = event.end && event.end !== event.start ? `Du ${dateFr(event.start)} au ${dateFr(event.end)}` : dateFr(event.start);
  const rows = evalRows(data);
  const body: string[] = [
    para('CODES AFRICA · RAPPORT D’ÉVALUATION', { bold: true, size: 9, color: '0088A8', after: 60 }),
    para(`Établi le ${dateFr(today())}`, { size: 9, color: '5A6A82', after: 240 }),
    para(event.name.toUpperCase(), { bold: true, size: 24, color: '0D1520', after: 80 }),
    para([when, event.place, event.type, event.reference ? `Réf. ${event.reference}` : ''].filter(Boolean).join(' · '), { size: 11, color: '5A6A82', after: 240 }),
    heading('Bilan chiffré'),
    table([30, 22, 48], [['Indicateur', 'Valeur', 'Détail'], ...figuresOf(event, data)]),
  ];
  if (data.budget.length) {
    const gap = (n: number) => `${n > 0 ? '+' : ''}${money(n)}`;
    body.push(heading('Budget par poste'), table([46, 18, 18, 18], [
      ['Poste', 'Prévu', 'Dépensé', 'Écart'],
      ...data.budget.map((b) => [b.label, money(b.planned), money(b.spent), gap(b.spent - b.planned)]),
      ['Total', money(st.planned), money(st.spent), gap(st.gap)],
    ], { boldLast: true, right: [1, 2, 3] }));
  }
  body.push(heading('Bilan général'),
    para(`Satisfaction générale : ${ev.satisfaction ? `${ev.satisfaction} / 5 · ${verdict(ev.satisfaction)}` : 'non notée'}`, { bold: true }));
  for (const [label, value] of [['Points forts', ev.strengths], ['Points à améliorer', ev.improvements], ['Recommandations pour la prochaine édition', ev.recommendations]] as const) {
    body.push(para(label, { bold: true, color: '0088A8', after: 60 }), value.trim() ? lines(value) : para('Non renseigné.', { italic: true, color: '5A6A82' }));
  }
  body.push(heading('Performance'));
  for (const k of EVAL_KINDS) {
    const list = rows.filter((r) => r.kind === k.label);
    const rated = list.filter((r) => r.score !== undefined);
    const avg = rated.length ? rated.reduce((a, r) => a + r.score!, 0) / rated.length : undefined;
    body.push(para(`${k.label} — ${rated.length} évalué${rated.length > 1 ? 's' : ''} sur ${list.length}${avg !== undefined ? ` · moyenne ${fmtScore(avg)} / 5` : ''}`, { bold: true, size: 12, after: 80 }));
    if (!list.length) { body.push(para('Rien à évaluer dans cette catégorie.', { italic: true, color: '5A6A82' })); continue; }
    const filled = list.filter((r) => r.score !== undefined || r.again || r.comment).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const pending = list.filter((r) => !filled.includes(r));
    if (filled.length) body.push(table([24, 10, 14, 14, 38], [['Nom', 'Note', 'Appréciation', 'À reconduire', 'Commentaire'],
      ...filled.map((r) => [r.name + (r.detail ? ` (${r.detail})` : ''), r.score === undefined ? '—' : `${fmtScore(r.score)} / 5`, r.verdict, r.again, [r.criteria, r.comment].filter(Boolean).join(' — ')])]));
    if (pending.length) body.push(para(`Non évalué${pending.length > 1 ? 's' : ''} (${pending.length}) : ${pending.map((r) => r.name).join(', ')}.`, { italic: true, size: 9.5, color: '5A6A82' }));
  }

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${para(`CODES Africa — ${event.name}`, { size: 8, color: '5A6A82', after: 0 })}</w:ftr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="0D1520"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': styles,
    'word/footer1.xml': footer,
  };
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { blob, name: `bilan-${slug(event.name)}-${today()}.docx` };
}

/** Le fichier du bilan de l'événement, au format demandé. */
export async function buildBilan(format: BilanFormat, event: PlatformEvent, data: EventData): Promise<BilanFile> {
  if (format === 'pdf') { const { buildBilanPdf } = await import('./bilanPdf'); return { ...(await buildBilanPdf(event, data)), format }; }
  if (format === 'word') return { ...bilanWord(event, data), format };
  return { ...(await bilanExcel(event, data)), format };
}

export const FORMAT_LABEL: Record<BilanFormat, string> = { pdf: 'PDF', word: 'Word', excel: 'Excel' };
