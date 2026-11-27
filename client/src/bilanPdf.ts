/* Rapport d'évaluation après l'événement, en PDF A4, généré dans le navigateur (rien n'est envoyé à un serveur).
   Chaque page est dessinée sur un canevas à 200 dpi puis placée dans le PDF. Fonctionne hors connexion. */

import { CODES_LOGO } from './accreditation';
import { buildPdf, loadImage, wrap } from './badgePdf';
import type { EventData } from './demo';
import type { PlatformEvent } from './events';
import { saveBlob, slug } from './excel';
import {
  EVAL_KINDS, averageOf, fmtScore, scoreColor, scoreOf, statsOf, subjectsOf, verdict,
} from './evaluation';

const PX_W = 1654, PX_H = 2339; // A4 à 200 dpi
const U = PX_W / 210; // pixels par millimètre
const PT = 0.3528 * U; // pixels par point typographique
const M = 16 * U; // marges gauche et droite
const TOP = 16 * U, BOTTOM = 18 * U;
const SANS = 'Inter, system-ui, sans-serif';
const DISPLAY = 'Anton, Impact, sans-serif';
const INK = '#0d1520', MUTED = '#5a6a82', LINE = '#d0d8e0', SAND = '#f5f7fa', BRAND = '#0088a8', DARK = '#001118';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return y ? `${d} ${MONTHS[m - 1]} ${y}` : ''; };
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} $`;
const num = (n: number) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

class Report {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  readonly w = PX_W - 2 * M;
  constructor(private title: string) { this.page(); }

  page() {
    const c = document.createElement('canvas');
    c.width = PX_W; c.height = PX_H;
    this.ctx = c.getContext('2d')!;
    this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, PX_W, PX_H);
    this.ctx.textBaseline = 'alphabetic';
    this.pages.push(c);
    this.y = TOP;
    if (this.pages.length > 1) {
      this.font(8, 600); this.ctx.fillStyle = MUTED;
      this.ctx.fillText(this.title.toUpperCase(), M, this.y + 3 * U);
      this.ctx.fillStyle = BRAND; this.ctx.fillRect(M, this.y + 5 * U, this.w, 0.5 * U);
      this.y += 11 * U;
    }
  }
  /** Passe à la page suivante si `h` pixels ne tiennent plus sur celle-ci. */
  need(h: number) { if (this.y + h > PX_H - BOTTOM) this.page(); }
  font(size: number, weight = 400, family = SANS, italic = false) { this.ctx.font = `${italic ? 'italic ' : ''}${weight} ${size * PT}px ${family}`; }

  text(s: string, x: number, y: number, o: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; family?: string; italic?: boolean } = {}) {
    this.font(o.size ?? 10, o.weight ?? 400, o.family, o.italic);
    this.ctx.fillStyle = o.color ?? INK; this.ctx.textAlign = o.align ?? 'left';
    this.ctx.fillText(s, x, y);
    this.ctx.textAlign = 'left';
  }
  /** Paragraphe (les retours à la ligne sont gardés), coupé sur plusieurs pages si besoin. */
  para(s: string, o: { size?: number; color?: string; italic?: boolean; x?: number; width?: number } = {}) {
    const size = o.size ?? 10, lh = size * PT * 1.45, x = o.x ?? M, width = o.width ?? this.w;
    this.font(size, 400, SANS, o.italic);
    const lines = s.split(/\n+/).flatMap((p) => (p.trim() ? wrap(this.ctx, p.trim(), width, 200) : []));
    for (const l of lines) {
      this.need(lh);
      this.text(l, x, this.y + size * PT, { size, color: o.color, italic: o.italic });
      this.y += lh;
    }
  }
  section(title: string) {
    this.need(22 * U);
    this.y += 4 * U;
    this.ctx.fillStyle = BRAND; this.ctx.fillRect(M, this.y, 1.6 * U, 7 * U);
    this.text(title.toUpperCase(), M + 4 * U, this.y + 6.2 * U, { size: 17, family: DISPLAY });
    this.y += 12 * U;
  }
  stars(x: number, y: number, value: number | undefined, size: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 5; i++) {
      const cx = x + i * size * 1.15 + size / 2, cy = y + size / 2, R = size / 2, r = R * 0.45;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r : R;
        ctx[k ? 'lineTo' : 'moveTo'](cx + rad * Math.cos(a), cy + rad * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = value !== undefined && i < Math.round(value) ? '#5b8def' : '#eaeef3';
      ctx.fill();
    }
  }
  rule(color = LINE) { this.ctx.fillStyle = color; this.ctx.fillRect(M, this.y, this.w, 0.3 * U); }
}

/** Rapport PDF du bilan, renvoyé sous forme de fichier (sans le télécharger). */
export async function buildBilanPdf(event: PlatformEvent, data: EventData): Promise<{ blob: Blob; name: string }> {
  await Promise.all([document.fonts.load(`40px Anton`), document.fonts.load(`600 40px Inter`), document.fonts.load(`400 40px Inter`), document.fonts.load(`italic 400 40px Inter`)]).catch(() => undefined);
  const logo = await loadImage(CODES_LOGO).catch(() => undefined);
  const ev = data.evaluation;
  const expected = Number(event.attendees) || 0;
  const st = statsOf(data, expected);
  const subjects = subjectsOf(data);
  const overall = averageOf(subjects.map((s) => ev.entries[s.key]));
  const r = new Report(`Rapport d’évaluation — ${event.name}`);

  // En-tête
  if (logo) { const h = 13 * U; r.ctx.drawImage(logo, M, r.y, (logo.width / logo.height) * h, h); }
  r.text('RAPPORT D’ÉVALUATION', PX_W - M, r.y + 5 * U, { size: 9, weight: 600, color: BRAND, align: 'right' });
  r.text(`Établi le ${dateFr(new Date().toISOString().slice(0, 10))}`, PX_W - M, r.y + 10 * U, { size: 8.5, color: MUTED, align: 'right' });
  r.y += 22 * U;
  r.font(30, 400, DISPLAY);
  for (const l of wrap(r.ctx, event.name.toUpperCase(), r.w, 2)) { r.text(l, M, r.y + 30 * PT * 0.95, { size: 30, family: DISPLAY }); r.y += 30 * PT * 1.05; }
  r.y += 2 * U;
  const when = event.end && event.end !== event.start ? `Du ${dateFr(event.start)} au ${dateFr(event.end)}` : dateFr(event.start);
  r.text([when, event.place, event.type].filter(Boolean).join(' · '), M, r.y + 4 * U, { size: 11, color: MUTED });
  if (event.reference) r.text(`Réf. ${event.reference}`, PX_W - M, r.y + 4 * U, { size: 9, color: MUTED, align: 'right' });
  r.y += 9 * U;
  // Bande à chevrons, comme sur les badges
  const bandH = 3 * U;
  r.ctx.save(); r.ctx.beginPath(); r.ctx.rect(M, r.y, r.w, bandH); r.ctx.clip();
  r.ctx.fillStyle = BRAND; r.ctx.fillRect(M, r.y, r.w, bandH);
  r.ctx.fillStyle = 'rgba(255,255,255,.28)';
  for (let x = M - bandH; x < M + r.w; x += bandH * 1.6) { r.ctx.beginPath(); r.ctx.moveTo(x, r.y); r.ctx.lineTo(x + bandH * 0.6, r.y); r.ctx.lineTo(x + bandH * 1.1, r.y + bandH / 2); r.ctx.lineTo(x + bandH * 0.6, r.y + bandH); r.ctx.lineTo(x, r.y + bandH); r.ctx.lineTo(x + bandH * 0.5, r.y + bandH / 2); r.ctx.fill(); }
  r.ctx.restore();
  r.y += bandH + 6 * U;

  // 1. Bilan chiffré
  r.section('Bilan chiffré');
  const figures: [string, string, string, string?][] = [
    ['Participants', st.attendance !== undefined ? num(st.attendance) : '—', expected ? `${num(expected)} attendus${st.attendanceRate !== undefined ? ` · ${st.attendanceRate} %` : ''}` : 'Nombre attendu non renseigné'],
    ['Budget dépensé', money(st.spent), st.planned ? `${st.budgetRate} % de ${money(st.planned)}` : 'Aucun budget prévu', st.gap > 0 ? '#c0262d' : undefined],
    ['Tâches terminées', st.tasks ? `${st.tasksDone} / ${st.tasks}` : '—', st.tasksRate !== undefined ? `${st.tasksRate} %` : 'Aucune tâche'],
    ['Programme', `${st.sessions} session${st.sessions > 1 ? 's' : ''}`, `${st.speakersConfirmed} intervenants confirmés · ${st.speakersAbsent} empêchés`],
    ['Sponsoring reçu', money(st.sponsorAmount), `${st.sponsorsPaid} payés sur ${st.sponsorsConfirmed} confirmés`],
    ['Badges émis', num(st.badges), `${st.people} personnes dans les équipes`],
    ['Satisfaction générale', ev.satisfaction ? `${ev.satisfaction} / 5` : '—', verdict(ev.satisfaction), ev.satisfaction ? scoreColor(ev.satisfaction) : undefined],
    ['Note moyenne des fiches', overall !== undefined ? `${fmtScore(overall)} / 5` : '—', verdict(overall), overall !== undefined ? scoreColor(overall) : undefined],
  ];
  const gap = 3 * U, bw = (r.w - 3 * gap) / 4, bh = 25 * U;
  figures.forEach(([label, value, sub, tone], i) => {
    const col = i % 4;
    if (col === 0 && i) r.y += bh + gap;
    if (col === 0) r.need(bh);
    const x = M + col * (bw + gap);
    r.ctx.fillStyle = SAND; r.ctx.beginPath(); r.ctx.roundRect(x, r.y, bw, bh, 2.5 * U); r.ctx.fill();
    r.text(label, x + 3.5 * U, r.y + 6 * U, { size: 8, weight: 600, color: MUTED });
    r.font(19, 400, DISPLAY);
    r.text(wrap(r.ctx, value, bw - 7 * U, 1)[0], x + 3.5 * U, r.y + 15 * U, { size: 19, family: DISPLAY, color: tone ?? INK });
    r.font(7.5);
    r.text(wrap(r.ctx, sub, bw - 7 * U, 1)[0], x + 3.5 * U, r.y + 21 * U, { size: 7.5, color: MUTED });
  });
  r.y += bh + 4 * U;

  // 2. Budget par poste
  if (data.budget.length) {
    r.section('Budget par poste');
    const cols = [M, M + r.w * 0.46, M + r.w * 0.64, M + r.w * 0.82, PX_W - M];
    const head = ['Poste', 'Prévu', 'Dépensé', 'Écart'];
    const rowH = 8 * U;
    const row = (cells: string[], o: { bold?: boolean; head?: boolean; color?: string } = {}) => {
      r.need(rowH);
      if (o.head) { r.ctx.fillStyle = SAND; r.ctx.fillRect(M, r.y, r.w, rowH); }
      cells.forEach((c, i) => {
        const right = i > 0;
        r.font(9, o.bold || o.head ? 600 : 400);
        const t = wrap(r.ctx, c, (right ? cols[i + 1] - cols[i] : cols[1] - cols[0]) - 4 * U, 1)[0] ?? '';
        r.text(t, right ? cols[i + 1] - 2 * U : M + 2 * U, r.y + 5.4 * U,
          { size: 9, weight: o.bold || o.head ? 600 : 400, align: right ? 'right' : 'left', color: o.head ? MUTED : i === 3 && o.color ? o.color : INK });
      });
      r.y += rowH; r.rule();
    };
    row(head, { head: true });
    for (const b of data.budget) row([b.label, money(b.planned), money(b.spent), `${b.spent - b.planned > 0 ? '+' : ''}${money(b.spent - b.planned)}`], { color: b.spent > b.planned ? '#c0262d' : '#00876f' });
    row(['Total', money(st.planned), money(st.spent), `${st.gap > 0 ? '+' : ''}${money(st.gap)}`], { bold: true, color: st.gap > 0 ? '#c0262d' : '#00876f' });
    r.y += 4 * U;
  }

  // 3. Bilan général
  r.section('Bilan général');
  r.need(10 * U);
  r.text('Satisfaction générale', M, r.y + 4.5 * U, { size: 10, weight: 600 });
  r.stars(M + 48 * U, r.y + 0.8 * U, ev.satisfaction, 4.6 * U);
  r.text(ev.satisfaction ? `${ev.satisfaction} / 5 · ${verdict(ev.satisfaction)}` : 'Non notée', M + 78 * U, r.y + 4.5 * U, { size: 10, color: MUTED });
  r.y += 10 * U;
  for (const [label, value] of [['Points forts', ev.strengths], ['Points à améliorer', ev.improvements], ['Recommandations pour la prochaine édition', ev.recommendations]] as const) {
    r.need(14 * U);
    r.text(label, M, r.y + 4 * U, { size: 10.5, weight: 600, color: BRAND });
    r.y += 7 * U;
    if (value.trim()) r.para(value);
    else r.para('Non renseigné.', { color: MUTED, italic: true });
    r.y += 3 * U;
  }

  // 4. Performance
  r.section('Performance');
  for (const k of EVAL_KINDS) {
    const list = subjects.filter((s) => s.kind === k.id);
    const avg = averageOf(list.map((s) => ev.entries[s.key]));
    const done = list.filter((s) => scoreOf(ev.entries[s.key]) !== undefined).length;
    r.need(24 * U);
    r.y += 2 * U;
    r.text(k.label, M, r.y + 5 * U, { size: 12.5, weight: 600 });
    r.text(`${done} évalué${done > 1 ? 's' : ''} sur ${list.length}${avg !== undefined ? ` · moyenne ${fmtScore(avg)} / 5` : ''}`, PX_W - M, r.y + 5 * U, { size: 9, color: avg !== undefined ? scoreColor(avg) : MUTED, weight: 600, align: 'right' });
    r.y += 8 * U; r.rule(INK);
    if (!list.length) { r.y += 2 * U; r.para('Rien à évaluer dans cette catégorie.', { color: MUTED, italic: true, size: 9 }); r.y += 2 * U; continue; }
    // Les fiches remplies, de la meilleure note à la moins bonne ; les autres sont seulement nommées.
    const sorted = list.filter((s) => ev.entries[s.key] && (scoreOf(ev.entries[s.key]) !== undefined || ev.entries[s.key].again || ev.entries[s.key].comment))
      .sort((a, b) => (scoreOf(ev.entries[b.key]) ?? -1) - (scoreOf(ev.entries[a.key]) ?? -1));
    const pending = list.filter((s) => !sorted.includes(s));
    for (const s of sorted) {
      const e = ev.entries[s.key], n = scoreOf(e);
      const nameW = r.w * 0.5;
      r.font(8, 400, SANS, true);
      const comment = e?.comment ? wrap(r.ctx, `« ${e.comment.replace(/\s+/g, ' ')} »`, r.w - 4 * U, 4) : [];
      const crit = Object.entries(e?.scores ?? {}).map(([c, v]) => `${c} ${v}/5`).join('  ·  ');
      const h = 12 * U + (crit ? 4.5 * U : 0) + comment.length * 4.2 * U + 2 * U;
      r.need(h);
      const y0 = r.y;
      r.font(10, 600);
      r.text(wrap(r.ctx, s.name, nameW, 1)[0], M + 2 * U, y0 + 5.5 * U, { size: 10, weight: 600 });
      r.font(8);
      r.text(wrap(r.ctx, s.detail, nameW, 1)[0] ?? '', M + 2 * U, y0 + 10 * U, { size: 8, color: MUTED });
      r.stars(M + r.w * 0.54, y0 + 2.2 * U, n, 3.6 * U);
      r.text(fmtScore(n), M + r.w * 0.54 + 23 * U, y0 + 5.6 * U, { size: 10.5, weight: 600, color: scoreColor(n) });
      r.text(verdict(n), M + r.w * 0.54 + 32 * U, y0 + 5.6 * U, { size: 8.5, color: MUTED });
      if (e?.again) {
        const label = e.again === 'Oui' ? 'À reconduire' : e.again === 'Non' ? 'À ne pas reconduire' : 'Avec réserves';
        const col = e.again === 'Oui' ? '#00876f' : e.again === 'Non' ? '#c0262d' : '#c2620a';
        r.text(label, PX_W - M - 2 * U, y0 + 5.6 * U, { size: 8.5, weight: 600, color: col, align: 'right' });
      }
      let yy = y0 + 12 * U;
      if (crit) { r.font(7.5); r.text(wrap(r.ctx, crit, r.w - 4 * U, 1)[0], M + 2 * U, yy + 2.5 * U, { size: 7.5, color: MUTED }); yy += 4.5 * U; }
      for (const l of comment) { r.text(l, M + 2 * U, yy + 3 * U, { size: 8, color: '#3d4d65', italic: true }); yy += 4.2 * U; }
      r.y = yy + 2 * U; r.rule();
    }
    if (pending.length) {
      r.y += 2 * U;
      r.para(`Non évalué${pending.length > 1 ? 's' : ''} (${pending.length}) : ${pending.map((s) => s.name).join(', ')}.`, { size: 8.5, color: MUTED, italic: true });
    }
    r.y += 4 * U;
  }

  // Pied de page sur chaque page
  r.pages.forEach((c, i) => {
    const g = c.getContext('2d')!;
    g.font = `400 ${7.5 * PT}px ${SANS}`; g.fillStyle = MUTED;
    g.textAlign = 'left'; g.fillText(`CODES Africa — ${event.name}`, M, PX_H - 9 * U);
    g.textAlign = 'right'; g.fillText(`Page ${i + 1} / ${r.pages.length}`, PX_W - M, PX_H - 9 * U);
    g.fillStyle = DARK; g.fillRect(0, PX_H - 3 * U, PX_W, 3 * U);
  });

  const jpegs = await Promise.all(r.pages.map((c) => new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : reject(new Error('Dessin du rapport impossible.'))), 'image/jpeg', 0.9))));
  const mm = 72 / 25.4, pw = 210 * mm, ph = 297 * mm;
  const pdf = buildPdf(jpegs.map((jpeg) => ({ w: pw, h: ph, cut: false, images: [{ jpeg, x: 0, y: 0, w: pw, h: ph, px: [PX_W, PX_H] as [number, number] }] })));
  const name = `rapport-evaluation-${slug(event.name)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob: pdf, name };
}

export async function downloadBilanPdf(event: PlatformEvent, data: EventData) {
  const { blob, name } = await buildBilanPdf(event, data);
  saveBlob(blob, name);
  return name;
}
