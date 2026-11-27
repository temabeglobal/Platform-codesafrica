/* Téléchargement des badges en PDF, généré dans le navigateur (rien n'est envoyé à un serveur, aucune bibliothèque).
   Chaque badge est dessiné sur un canevas à 300 dpi (9 × 13,5 cm), puis placé dans un PDF :
   - un seul badge : une page au format du badge ;
   - plusieurs badges : planche A4, 4 badges par page, avec un pointillé de découpe. */

import { CODES_LOGO, badgeCode, badgeStyle, qrPayload, initialsOf, type Badge, type BadgeTheme } from './accreditation';
import { slug } from './excel';
import { qrMatrix } from './qr';

export interface BadgeEvent { name: string; dates: string; place: string; reference?: string }

const MM = 72 / 25.4; // points PDF par millimètre
const BADGE_W = 90, BADGE_H = 135; // mm
const PX_W = 1063, PX_H = 1595; // 300 dpi
const SANS = 'Inter, system-ui, sans-serif';
const DISPLAY = 'Anton, Impact, sans-serif';

export const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
  img.src = src;
});

/** Coupe un texte en lignes (au plus `max`), avec « … » si le texte est trop long. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    let last = lines[max - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last.trimEnd()}…`;
  }
  // Un seul mot trop long : on le réduit aussi.
  return lines.map((l) => {
    let s = l;
    while (s.length > 1 && ctx.measureText(s).width > width) s = s.slice(0, -2) + '…';
    return s;
  });
}

/** Bande décorative à chevrons, dans la couleur de la catégorie. */
function chevrons(ctx: CanvasRenderingContext2D, y: number, h: number, color: string) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, y, PX_W, h); ctx.clip();
  ctx.fillStyle = color;
  const step = h * 1.1;
  for (let x = -h; x < PX_W + h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + h * 0.45, y + h); ctx.lineTo(x + h * 0.95, y); ctx.lineTo(x + h * 0.5, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Cartouche blanc arrondi (sous le texte quand le badge a une image de fond). */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.restore();
}

async function drawBadge(b: Badge, event: BadgeEvent, codes: HTMLImageElement, logo?: HTMLImageElement, bg?: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W; canvas.height = PX_H;
  const ctx = canvas.getContext('2d')!;
  const u = PX_W / 100; // même unité que le badge à l'écran (cqw)
  const { color } = badgeStyle[b.category];
  const cx = PX_W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PX_W, PX_H);
  const lh = 11 * u, extra = 0; // hauteur des logos
  if (bg) {
    const r = Math.max(PX_W / bg.naturalWidth, PX_H / bg.naturalHeight);
    const w = bg.naturalWidth * r, h = bg.naturalHeight * r;
    ctx.drawImage(bg, (PX_W - w) / 2, (PX_H - h) / 2, w, h);
    plate(ctx, 5 * u, 3 * u, 90 * u, 29.5 * u + extra, 3 * u);
  }

  // En-tête : logo, événement, dates et lieu
  // Logo CODES Africa, et à côté le logo de l'événement s'il y en a un (séparés par un trait).
  const fit = (img: HTMLImageElement) => {
    let h = lh, w = h * (img.naturalWidth / img.naturalHeight || 1);
    const max = (logo ? 40 : 50) * u;
    if (w > max) { h *= max / w; w = max; }
    return { img, w, h };
  };
  const logos = [fit(codes), ...(logo ? [fit(logo)] : [])];
  const gap = 3 * u;
  let lx = cx - (logos.reduce((a, l) => a + l.w, 0) + (logos.length - 1) * (2 * gap + 1)) / 2;
  logos.forEach((l, i) => {
    if (i) {
      ctx.fillStyle = '#d0d8e0'; ctx.fillRect(lx + gap, 6 * u, Math.max(1, u * 0.2), lh);
      lx += 2 * gap + 1;
    }
    ctx.drawImage(l.img, lx, 6 * u + (lh - l.h) / 2, l.w, l.h);
    lx += l.w;
  });
  ctx.fillStyle = '#0d1520'; ctx.font = `600 ${5 * u}px ${SANS}`;
  ctx.fillText(wrap(ctx, event.name, 86 * u, 1)[0] ?? '', cx, 25 * u + extra);
  ctx.fillStyle = '#5a6a82'; ctx.font = `400 ${3.6 * u}px ${SANS}`;
  ctx.fillText(wrap(ctx, [event.dates, event.place].filter(Boolean).join(' · '), 86 * u, 1)[0] ?? '', cx, 30 * u + extra);
  const bandY = 34 * u + extra;
  chevrons(ctx, bandY, 4 * u, color);

  // Bas : bande de la catégorie
  const footH = 24 * u, footY = PX_H - footH;
  ctx.fillStyle = color; ctx.fillRect(0, footY, PX_W, footH);
  // QR code unique à droite, en blanc directement sur la couleur de la catégorie
  const box = 20 * u, pad = 1.5 * u, bx = PX_W - 4 * u - box, by = footY + (footH - box) / 2;
  const qr = qrMatrix(qrPayload(b, event.reference ?? ''));
  const cell = (box - 2 * pad) / qr.length;
  ctx.fillStyle = '#fff';
  qr.forEach((row, y) => row.forEach((on, x) => { if (on) ctx.fillRect(bx + pad + x * cell, by + pad + y * cell, Math.ceil(cell), Math.ceil(cell)); }));
  // Catégorie et n°, centrés dans la place restante
  const tx = (4 * u + bx - 3 * u) / 2;
  ctx.fillStyle = '#fff'; ctx.font = `${(b.category.length > 9 ? 7 : 8.5) * u}px ${DISPLAY}`;
  ctx.letterSpacing = `${(b.category.length > 9 ? 0.7 : 0.85) * u}px`;
  ctx.fillText(b.category.toUpperCase(), tx + 0.4 * u, footY + 12.5 * u);
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `400 ${3.4 * u}px ${SANS}`;
  ctx.letterSpacing = `${0.7 * u}px`;
  ctx.fillText(`N° ${badgeCode(b)}`, tx + 0.35 * u, footY + 18 * u);
  ctx.letterSpacing = '0px';

  // Milieu : photo (ou initiales), nom, fonction — centrés verticalement
  ctx.font = `${8.5 * u}px ${DISPLAY}`;
  const nameLines = wrap(ctx, b.name, 86 * u, 2);
  ctx.font = `400 ${4.2 * u}px ${SANS}`;
  const orgLines = b.org.trim() ? wrap(ctx, b.org, 86 * u, 2) : [];
  const photoD = 42 * u, nameLH = 9 * u, orgLH = 5.4 * u;
  const blockH = photoD + 5 * u + nameLines.length * nameLH + (orgLines.length ? 1.5 * u + orgLines.length * orgLH : 0);
  const top = bandY + 4 * u + (footY - bandY - 4 * u - blockH) / 2;
  const pcy = top + photoD / 2;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, pcy, photoD / 2, 0, Math.PI * 2); ctx.fill();
  const inner = photoD / 2 - 1.2 * u;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, pcy, inner, 0, Math.PI * 2); ctx.fill();
  if (b.photo) {
    const photo = await loadImage(b.photo);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, pcy, inner, 0, Math.PI * 2); ctx.clip();
    const s = Math.min(photo.naturalWidth, photo.naturalHeight);
    ctx.drawImage(photo, (photo.naturalWidth - s) / 2, (photo.naturalHeight - s) / 2, s, s, cx - inner, pcy - inner, inner * 2, inner * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = color; ctx.font = `${15 * u}px ${DISPLAY}`; ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(b.name), cx, pcy + 0.5 * u);
    ctx.textBaseline = 'alphabetic';
  }
  let y = top + photoD + 5 * u;
  if (bg) {
    ctx.font = `${8.5 * u}px ${DISPLAY}`;
    let tw = Math.max(...nameLines.map((l) => ctx.measureText(l).width));
    ctx.font = `400 ${4.2 * u}px ${SANS}`;
    if (orgLines.length) tw = Math.max(tw, ...orgLines.map((l) => ctx.measureText(l).width));
    const ph = blockH - photoD - 5 * u + 3.5 * u;
    plate(ctx, cx - tw / 2 - 3 * u, y - 1.5 * u, tw + 6 * u, ph, 3 * u);
  }
  ctx.fillStyle = '#0d1520'; ctx.font = `${8.5 * u}px ${DISPLAY}`;
  for (const l of nameLines) { y += nameLH; ctx.fillText(l, cx, y - 1.2 * u); }
  if (orgLines.length) {
    y += 1.5 * u;
    ctx.fillStyle = '#3d4d65'; ctx.font = `400 ${4.2 * u}px ${SANS}`;
    for (const l of orgLines) { y += orgLH; ctx.fillText(l, cx, y - 1.2 * u); }
  }

  return new Promise((resolve, reject) => canvas.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('Dessin du badge impossible.'))), 'image/jpeg', 0.92));
}

/** PDF minimal : chaque page porte des images JPEG (DCTDecode) et, en option, des traits de découpe. */
/** PDF minimal : chaque page porte des images JPEG (px = taille de l'image en pixels, badge par défaut). */
export function buildPdf(pages: { w: number; h: number; images: { jpeg: Uint8Array; x: number; y: number; w: number; h: number; px?: [number, number] }[]; cut: boolean }[]) {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (c: Uint8Array | string) => { const b = typeof c === 'string' ? enc.encode(c) : c; chunks.push(b); size += b.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = size; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  let next = 3;
  const pageIds: number[] = [];
  const later: (() => void)[] = [];
  for (const p of pages) {
    const pageId = next++, contentId = next++;
    const imgIds = p.images.map(() => next++);
    pageIds.push(pageId);
    const ops = p.images.map((im, i) => `q ${im.w.toFixed(2)} 0 0 ${im.h.toFixed(2)} ${im.x.toFixed(2)} ${im.y.toFixed(2)} cm /Im${i} Do Q`);
    if (p.cut) ops.push('0.66 0.71 0.76 RG 0.5 w [3 3] 0 d', ...p.images.map((im) => `${im.x.toFixed(2)} ${im.y.toFixed(2)} ${im.w.toFixed(2)} ${im.h.toFixed(2)} re S`));
    const content = enc.encode(ops.join('\n'));
    later.push(() => {
      obj(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}] /Resources << /XObject << ${imgIds.map((id, i) => `/Im${i} ${id} 0 R`).join(' ')} >> >> /Contents ${contentId} 0 R >>`]);
      obj(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
      p.images.forEach((im, i) => obj(imgIds[i], [
        `<< /Type /XObject /Subtype /Image /Width ${im.px?.[0] ?? PX_W} /Height ${im.px?.[1] ?? PX_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`,
        im.jpeg, '\nendstream',
      ]));
    });
  }
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`]);
  later.forEach((f) => f());
  const xref = size;
  push(`xref\n0 ${next}\n0000000000 65535 f \n${offsets.slice(1, next).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/** Télécharge les badges en PDF. Un badge : page au format du badge ; plusieurs : planche A4 (4 par page). */
export async function downloadBadgesPdf(badges: Badge[], event: BadgeEvent, theme: BadgeTheme = {}) {
  if (!badges.length) return;
  await Promise.all([document.fonts.load(`40px Anton`), document.fonts.load(`600 40px Inter`), document.fonts.load(`400 40px Inter`)]).catch(() => undefined);
  const codes = await loadImage(CODES_LOGO);
  const logo = theme.logo ? await loadImage(theme.logo) : undefined;
  const bg = theme.background ? await loadImage(theme.background) : undefined;
  const jpegs: Uint8Array[] = [];
  for (const b of badges) jpegs.push(new Uint8Array(await (await drawBadge(b, event, codes, logo, bg)).arrayBuffer()));

  const bw = BADGE_W * MM, bh = BADGE_H * MM;
  let pdf: Blob;
  if (badges.length === 1) {
    pdf = buildPdf([{ w: bw, h: bh, cut: false, images: [{ jpeg: jpegs[0], x: 0, y: 0, w: bw, h: bh }] }]);
  } else {
    const pw = 210 * MM, ph = 297 * MM, gx = 6 * MM, gy = 4 * MM;
    const x0 = (pw - 2 * bw - gx) / 2, y0 = (ph - 2 * bh - gy) / 2;
    const pages = [];
    for (let i = 0; i < jpegs.length; i += 4) {
      pages.push({ w: pw, h: ph, cut: true, images: jpegs.slice(i, i + 4).map((jpeg, k) => ({
        jpeg, w: bw, h: bh,
        x: x0 + (k % 2) * (bw + gx),
        y: ph - y0 - bh - Math.floor(k / 2) * (bh + gy), // origine PDF en bas à gauche
      })) });
    }
    pdf = buildPdf(pages);
  }

  const day = new Date().toISOString().slice(0, 10);
  const name = badges.length === 1
    ? `badge-${badgeCode(badges[0]).toLowerCase()}-${slug(badges[0].name)}.pdf`
    : `badges-${slug(event.name)}-${day}.pdf`;
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
