import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, FileDown, Palette, IdCard, Loader2, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useEvents } from '../events';
import { uid } from '../demo';
import { BADGE_CATEGORIES, badgeCode, badgeStyle, hasTheme, newToken, nextNumber, qrPayload, type Badge, type BadgeCategory, type BadgeTheme } from '../accreditation';
import BadgeCard from '../components/BadgeCard';
import BadgeModal, { type BadgeDraft } from '../components/BadgeModal';
import BadgeThemeModal from '../components/BadgeThemeModal';
import { downloadSheet, slug } from '../excel';

/* Accréditations : générer et imprimer les badges de l'événement (staff, visiteurs, médias, intervenants…).
   Photo facultative ; sans photo, le badge affiche les initiales.
   Maquette : rien n'est encore enregistré en base. */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const datesOf = (start: string, end: string) => {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = (end || start).split('-').map(Number);
  if (!y1) return '';
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${d1} ${MONTHS[m1 - 1]} ${y1}` : `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y1}`;
  return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
};


export default function AccreditationView() {
  const { current, data: { badges, badgeTheme }, addBadges, updateBadge, removeBadge, setBadgeTheme } = useEvents();
  const event = { name: current.name, dates: datesOf(current.start, current.end), place: current.place, reference: current.reference };
  const [category, setCategory] = useState<BadgeCategory | null>(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ edit?: Badge } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Badge[] | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Identifiant du PDF en préparation : 'all' pour la liste affichée, ou l'id d'un badge. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const themed = hasTheme(badgeTheme);
  const applyTheme = (t: BadgeTheme) => {
    setBadgeTheme(t); setThemeOpen(false);
    flash(hasTheme(t) ? 'Habillage appliqué à tous les badges de l’événement' : 'Badges remis au modèle standard');
  };

  const flash = (m: string) => { setToast(`${m} — enregistré sur cet appareil`); setTimeout(() => setToast(''), 4000); };
  const closeModal = useCallback(() => setModal(null), []);

  const q = fold(query);
  const sorted = [...badges].sort((a, b) => BADGE_CATEGORIES.indexOf(a.category) - BADGE_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, 'fr'));
  const shown = sorted.filter((b) => (!category || b.category === category) && (!q || fold(`${b.name} ${b.org} ${badgeCode(b)}`).includes(q)));
  const countOf = (c: BadgeCategory) => badges.filter((b) => b.category === c).length;
  const withPhoto = badges.filter((b) => b.photo).length;

  const save = (d: BadgeDraft) => {
    if (modal?.edit) {
      const id = modal.edit.id;
      updateBadge(id, (b) => ({ ...b, ...d }));
      flash(`Badge de ${d.name} modifié`);
    } else {
      addBadges([{ ...d, id: uid(), number: nextNumber(badges), token: newToken() }]);
      setCategory(null); setQuery('');
      flash(`Badge ${d.category} créé pour ${d.name}`);
    }
    setModal(null);
  };

  // Impression : la planche (4 badges par page A4) est rendue hors de l'application, puis on attend ses images.
  useEffect(() => {
    if (!printing) return;
    let cancelled = false;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    (async () => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('.badge-print img')];
      await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
      if (!cancelled) window.print();
    })();
    return () => { cancelled = true; window.removeEventListener('afterprint', done); };
  }, [printing]);

  const doExport = async () => {
    setExporting(true);
    try {
      await downloadSheet({
        title: 'Accréditations', sheet: 'Badges', eventName: current.name,
        fileBase: ['accreditations', category && slug(category), query.trim() && slug(query)].filter(Boolean).join('-'),
        filters: [category ? `catégorie ${category}` : 'toutes les catégories', query.trim() && `recherche « ${query.trim()} »`].filter(Boolean).join(' · '),
        headers: ['N° de badge', 'Nom', 'Catégorie', 'Fonction ou organisation', 'Photo', 'Contenu du QR code'],
        widths: [14, 30, 16, 40, 10, 44],
        rows: shown.map((b) => [badgeCode(b), b.name, b.category, b.org || null, b.photo ? 'Oui' : 'Non', qrPayload(b, current.reference)]),
      });
    } finally { setExporting(false); }
  };

  const downloadPdf = async (list: Badge[], key: string) => {
    setPdfBusy(key);
    try {
      const { downloadBadgesPdf } = await import('../badgePdf');
      const name = await downloadBadgesPdf(list, event, badgeTheme);
      setToast(`PDF téléchargé : ${name}`); setTimeout(() => setToast(''), 4000);
    } catch (e) {
      setToast(`Le PDF n’a pas pu être créé : ${(e as Error).message}`); setTimeout(() => setToast(''), 5000);
    } finally { setPdfBusy(null); }
  };

  const remove = (b: Badge) => { removeBadge(b.id); setConfirmId(null); flash(`Badge de ${b.name} supprimé`); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-500">
          {badges.length} badge{badges.length > 1 ? 's' : ''} · {withPhoto} avec photo
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setThemeOpen(true)} aria-label={themed ? 'Habillage des badges (activé)' : 'Habillage des badges'}
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold ring-1 ${themed ? 'bg-brand-50 ring-brand-400 text-brand-800' : 'bg-white ring-ink-200 hover:ring-brand-400'}`}>
            <Palette size={17} /> Habillage{themed && <span className="w-2 h-2 rounded-full bg-brand-500" aria-hidden="true" />}
          </button>
          <button type="button" onClick={doExport} disabled={!shown.length || exporting}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-white ring-1 ring-ink-200 hover:ring-brand-400 disabled:opacity-50">
            {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} Excel
          </button>
          <button type="button" onClick={() => downloadPdf(shown, 'all')} disabled={!shown.length || !!pdfBusy}
            title={shown.length > 1 ? 'Planche A4, 4 badges par page' : 'Un badge au format 9 × 13,5 cm'}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-white ring-1 ring-ink-200 hover:ring-brand-400 disabled:opacity-50">
            {pdfBusy === 'all' ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} />} PDF {shown.length > 0 && `(${shown.length})`}
          </button>
          <button type="button" onClick={() => setPrinting(shown)} disabled={!shown.length}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold bg-brand-950 text-white hover:bg-brand-900 disabled:opacity-50">
            <Printer size={17} /> Imprimer {shown.length > 0 && `(${shown.length})`}
          </button>
          <button type="button" onClick={() => setModal({})} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
            className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
            <Plus size={18} /> Nouveau badge
          </button>
        </div>
      </div>

      <div className="tile p-4 sm:p-5 space-y-4">
        <div role="group" aria-label="Filtrer par catégorie" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!category} onClick={() => setCategory(null)}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold ring-1 transition ${!category ? 'bg-brand-950 text-white ring-brand-950' : 'bg-white ring-ink-200 hover:ring-ink-400'}`}>
            Toutes <span className="opacity-70">{badges.length}</span>
          </button>
          {BADGE_CATEGORIES.map((c) => {
            const on = category === c;
            const n = countOf(c);
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => setCategory(on ? null : c)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold ring-1 transition ${on ? 'text-white' : 'bg-white ring-ink-200 hover:ring-ink-400'} ${!n && !on ? 'opacity-60' : ''}`}
                style={on ? { backgroundColor: badgeStyle[c].color, ['--tw-ring-color' as string]: badgeStyle[c].color } : undefined}>
                {!on && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: badgeStyle[c].color }} />}
                {c} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un badge"
            placeholder="Rechercher un nom, une organisation ou un n° de badge"
            className="h-11 w-full rounded-xl bg-[var(--sand)] pl-11 pr-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
        </label>
      </div>

      {shown.length ? (
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5" aria-label="Badges">
          {shown.map((b) => (
            <li key={b.id} className="relative">
              <BadgeCard badge={b} event={event} theme={badgeTheme} className="shadow-[0_12px_32px_-16px_rgba(1,33,43,.35)] rounded-[8px]" />
              <div className="mt-2 flex items-center justify-center gap-1">
                <button type="button" onClick={() => setPrinting([b])} aria-label={`Imprimer le badge de ${b.name}`} title="Imprimer"
                  className="w-9 h-9 grid place-items-center rounded-full text-ink-600 hover:bg-white hover:text-brand-700"><Printer size={16} /></button>
                <button type="button" onClick={() => downloadPdf([b], b.id)} disabled={!!pdfBusy} aria-label={`Télécharger le badge de ${b.name} en PDF`} title="Télécharger en PDF"
                  className="w-9 h-9 grid place-items-center rounded-full text-ink-600 hover:bg-white hover:text-brand-700 disabled:opacity-50">
                  {pdfBusy === b.id ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}</button>
                <button type="button" onClick={() => setModal({ edit: b })} aria-label={`Modifier le badge de ${b.name}`} title="Modifier"
                  className="w-9 h-9 grid place-items-center rounded-full text-ink-600 hover:bg-white hover:text-brand-700"><Pencil size={16} /></button>
                <button type="button" onClick={() => setConfirmId(b.id)} aria-label={`Supprimer le badge de ${b.name}`} title="Supprimer"
                  className="w-9 h-9 grid place-items-center rounded-full text-ink-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
              </div>
              {confirmId === b.id && (
                <div role="alertdialog" aria-label={`Supprimer le badge de ${b.name}`}
                  className="absolute inset-x-0 bottom-12 mx-2 rounded-2xl bg-white shadow-xl ring-1 ring-red-200 p-3 text-center">
                  <p className="text-sm font-semibold">Supprimer le badge de {b.name} ?</p>
                  <div className="mt-2 flex justify-center gap-2">
                    <button type="button" autoFocus onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-ink-100">Annuler</button>
                    <button type="button" onClick={() => remove(b)} className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Supprimer</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="tile p-10 text-center">
          <IdCard size={32} className="mx-auto text-brand-500" />
          <p className="mt-3 font-semibold">{badges.length ? 'Aucun badge ne correspond à ce filtre.' : 'Aucun badge pour cet événement.'}</p>
          <p className="text-sm text-ink-500 mt-1">
            {badges.length ? 'Changez de catégorie ou de recherche.' : 'Créez le premier badge avec « Nouveau badge ».'}
          </p>
        </div>
      )}

      <BadgeModal open={!!modal} event={event} theme={badgeTheme} initial={modal?.edit} number={nextNumber(badges)} onClose={closeModal} onSubmit={save} />

      <BadgeThemeModal open={themeOpen} event={event} initial={badgeTheme} onClose={closeTheme} onSubmit={applyTheme}
        sample={shown[0] ?? badges[0] ?? { name: 'M. Kalonji', category: 'Intervenant', org: 'Exemple de fonction', number: 1 }} />

      {printing && createPortal(
        <div className="badge-print" aria-hidden="true">
          {printing.map((b) => <BadgeCard key={b.id} badge={b} event={event} theme={badgeTheme} className="badge-print-card" />)}
        </div>,
        document.body,
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
    </div>
  );
}
