import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Plus, Search, Store, Trash2 } from 'lucide-react';
import { useEvents } from '../events';
import { standSizes, type Lead, type StandSize } from '../demo';
import ExposantModal from '../components/ExposantModal';
import RowMenu from '../components/RowMenu';

/* Exposants : tous les sponsors dont le paiement est reçu y apparaissent automatiquement,
   avec leur contact et la taille de leur stand (9 m² ou 18 m²).
   Maquette : rien n'est encore enregistré en base. */

const area = (s?: StandSize) => (s === '18 m²' ? 18 : s === '9 m²' ? 9 : 0);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ExposantsView() {
  const { current, data: { sponsors }, updateLead, addLead, removeLead } = useEvents();
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState<StandSize | 'none' | null>(null);
  const [toast, setToast] = useState('');

  const exposants = sponsors.filter((l) => l.billing === 'Paiement reçu').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  // Sponsors confirmés dont on attend encore le paiement : ils deviendront exposants ensuite.
  const waiting = sponsors.filter((l) => l.stage === 'Confirmé' && l.billing !== 'Paiement reçu').length;
  const count = (s: StandSize | 'none') => exposants.filter((l) => (l.stand ?? 'none') === s).length;
  const surface = exposants.reduce((a, l) => a + area(l.stand), 0);
  const q = fold(query.trim());
  const shown = exposants.filter((l) => (!size || (l.stand ?? 'none') === size) && (!q || fold(l.name + ' ' + l.contact).includes(q)));

  const flash = (m: string) => { setToast(`${m} — enregistré sur cet appareil`); setTimeout(() => setToast(''), 3500); };
  const add = (l: Lead) => { addLead('sponsors', l); setAdding(false); setSize(null); setQuery(''); flash(`${l.name} ajouté aux exposants`); };
  const remove = (l: Lead) => { removeLead('sponsors', l.name); setConfirmName(null); flash(`${l.name} supprimé des exposants et des sponsors`); };
  const setStand = (l: Lead, s: StandSize) => {
    if (l.stand === s) return;
    updateLead('sponsors', l.name, { ...l, stand: s });
    flash(`${l.name} : stand de ${s}`);
  };

  const tiles: { key: StandSize | 'none'; label: string; n: number }[] = [
    { key: '9 m²', label: 'Stands de 9 m²', n: count('9 m²') },
    { key: '18 m²', label: 'Stands de 18 m²', n: count('18 m²') },
    { key: 'none', label: 'Stand à définir', n: count('none') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-500">
          {exposants.length} exposant{exposants.length > 1 ? 's' : ''}
          {waiting > 0 && <> · {waiting} sponsor{waiting > 1 ? 's' : ''} confirmé{waiting > 1 ? 's' : ''} en attente de paiement</>}
        </span>
        <div className="flex items-center gap-4">
          <Link to="/sponsors" className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">Voir les sponsors <ArrowUpRight size={15} /></Link>
          <button type="button" onClick={() => setAdding(true)} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
            className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
            <Plus size={18} /> Ajouter un exposant
          </button>
        </div>
      </div>
      <ExposantModal open={adding} eventName={current.name} existing={sponsors.map((l) => l.name)} onClose={closeAdd} onSubmit={add} />

      <div className="tile p-4 sm:p-5">
        <div role="group" aria-label="Filtrer par taille de stand" className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-2xl p-3.5 bg-brand-950 text-white">
            <span className="text-sm font-medium text-white/70">Surface totale</span>
            <span className="font-display text-3xl mt-1 block">{surface} m²</span>
          </div>
          {tiles.map((t) => {
            const on = size === t.key;
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => setSize(on ? null : t.key)}
                className={`text-left rounded-2xl p-3.5 ring-1 transition ${on ? 'bg-brand-500 text-white ring-brand-500' : 'bg-[var(--sand)] ring-transparent hover:ring-brand-400'}`}>
                <span className="text-sm font-medium">{t.label}</span>
                <span className="font-display text-3xl mt-1 block">{t.n}</span>
              </button>
            );
          })}
        </div>
        {size && <p className="text-xs text-ink-500 mt-3">Filtré sur « {tiles.find((t) => t.key === size)!.label} ». <button type="button" onClick={() => setSize(null)} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button></p>}
      </div>

      {exposants.length > 0 && (
        <label className="relative block">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
          <input type="search" aria-label="Rechercher un exposant" placeholder="Rechercher un exposant ou un contact" value={query} onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-full bg-white pl-10 pr-4 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500" />
        </label>
      )}

      {!exposants.length ? (
        <div className="tile p-10 text-center">
          <Store className="mx-auto text-ink-400" size={28} />
          <div className="font-semibold mt-3">Aucun exposant pour l’instant</div>
          <p className="text-sm text-ink-500 mt-1">Un sponsor apparaît ici dès que sa facturation passe à « Paiement reçu ».</p>
        </div>
      ) : !shown.length ? (
        <div className="tile p-8 text-center text-sm text-ink-500">
          Aucun exposant ne correspond. <button type="button" onClick={() => { setQuery(''); setSize(null); }} className="font-semibold text-brand-700 underline underline-offset-2">Tout afficher</button>
        </div>
      ) : (
        <div className="tile">
          <div className="hidden md:grid grid-cols-[1.3fr_1.2fr_auto_2.25rem] gap-4 px-6 py-3 border-b border-ink-100 text-xs font-semibold uppercase tracking-wider text-ink-500">
            <span>Exposant</span><span>Contact</span><span className="w-[230px]">Stand</span><span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {shown.map((l) => (
              <li key={l.name} className={`relative grid md:grid-cols-[1.3fr_1.2fr_auto_2.25rem] gap-x-4 gap-y-2 items-center px-5 md:px-6 py-4 ${confirmName === l.name ? 'bg-red-50/70' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-400/20 text-accent-700 grid place-items-center"><Store size={18} /></span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{l.name}</div>
                    <div className="text-xs text-accent-700 flex items-center gap-1"><Check size={12} /> Paiement reçu</div>
                  </div>
                </div>
                <div className="text-sm text-ink-600 md:pl-0 pl-[3.25rem] break-words">{l.contact}</div>
                <div className="md:w-[230px] pl-[3.25rem] md:pl-0 flex items-center gap-2">
                  <div role="radiogroup" aria-label={`Stand de ${l.name}`} className="flex rounded-full bg-[var(--sand)] ring-1 ring-ink-200 p-0.5">
                    {standSizes.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={l.stand === s} onClick={() => setStand(l, s)}
                        className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${l.stand === s ? 'bg-brand-950 text-white' : 'text-ink-600 hover:text-brand-950'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {!l.stand && <span className="text-xs text-royal-700 font-medium">À définir</span>}
                </div>
                <div className="absolute top-3 right-3 md:static">
                  <RowMenu name={l.name} deleteLabel="Supprimer l’exposant" onDelete={() => setConfirmName(l.name)} />
                </div>
                {confirmName === l.name && (
                  <div role="alertdialog" aria-label={`Confirmer la suppression de ${l.name}`} className="md:col-span-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white ring-1 ring-red-200 px-4 py-3">
                    <p className="text-sm text-red-800">Supprimer « {l.name} » ? Il sera aussi retiré des sponsors et du budget sponsoring.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmName(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-ink-700 hover:bg-ink-100">Annuler</button>
                      <button type="button" onClick={() => remove(l)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Trash2 size={15} /> Supprimer</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-brand-950 text-white text-sm px-5 py-3 rounded-full shadow-xl max-w-[92vw]">
          <Check size={16} className="text-accent-400 shrink-0" /> {toast}
        </div>
      )}
    </div>
  );
}

