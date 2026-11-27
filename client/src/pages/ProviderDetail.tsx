import { useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, FilePlus2, FileText, Mail, MessageCircle, Paperclip, Pencil, Receipt, ShoppingCart, Smartphone } from 'lucide-react';
import EventSwitcher from '../components/EventSwitcher';
import DocModal from '../components/DocModal';
import { useEvents } from '../events';
import { docKinds, docStatuses, fmtDate, providerStages, type DocDirection, type DocKind, type ProviderDoc, type ProviderStage } from '../demo';
import { fileUrl } from '../cloud/neon';
import { ChipMenu, contactLinks, docStatusStyle, initials, money, stageStyle } from './providers-ui';

/* Dossier d'un prestataire : son suivi étape par étape et toutes les pièces échangées
   (devis, commandes, factures), reçues du prestataire ou émises par la plateforme. */

const KIND_ICON: Record<DocKind, typeof FileText> = { Devis: FileText, Commande: ShoppingCart, Facture: Receipt };
const KIND_PLURAL: Record<DocKind, string> = { Devis: 'Devis', Commande: 'Commandes', Facture: 'Factures' };

export default function ProviderDetail() {
  const { providerId } = useParams();
  const { data, updateProvider } = useEvents();
  const provider = data.providers.find((p) => p.id === providerId);
  const [kind, setKind] = useState<DocKind | null>(null);
  const [dir, setDir] = useState<DocDirection | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [modal, setModal] = useState<{ doc?: ProviderDoc } | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  // Le prestataire n'appartient pas à l'événement choisi (ex. on vient de changer d'événement) : retour à la liste.
  if (!provider) return <Navigate to="/prestataires" replace />;

  const p = provider;
  const setDocs = (fn: (d: ProviderDoc[]) => ProviderDoc[]) => updateProvider(p.id, (x) => ({ ...x, docs: fn(x.docs) }));
  const setStage = (s: ProviderStage) => updateProvider(p.id, (x) => ({ ...x, status: s }));
  const links = contactLinks(p.phone, p.email);

  // Totaux du dossier
  const sum = (k: DocKind, ok?: (d: ProviderDoc) => boolean) => p.docs.filter((d) => d.kind === k && (!ok || ok(d))).reduce((a, d) => a + d.amount, 0);
  const quoted = sum('Devis', (d) => d.status === 'Accepté') || sum('Devis', (d) => d.status !== 'Refusé');
  const ordered = sum('Commande', (d) => d.status !== 'Annulée');
  const invoiced = sum('Facture');
  const paid = sum('Facture', (d) => d.status === 'Payée');
  const toPay = invoiced - paid;

  // Statuts proposés : ceux du type choisi (ou de tous les types), dans l'ordre du suivi.
  const byKindDir = p.docs.filter((d) => (!kind || d.kind === kind) && (!dir || d.direction === dir));
  const statusOptions = [...new Set((kind ? [kind] : docKinds).flatMap((k) => docStatuses[k]))]
    .filter((st) => byKindDir.some((d) => d.status === st) || st === status);
  const shown = [...byKindDir]
    .filter((d) => !status || d.status === status)
    .sort((a, b) => b.date.localeCompare(a.date));
  const stageIndex = providerStages.indexOf(p.status);

  return (
    <div>
      <div className="relative z-20 flex items-stretch gap-3 mb-8">
        <Link to="/prestataires" aria-label="Retour aux prestataires" style={{ ['--fx' as string]: '#d4a83f', ['--fx-o' as string]: 0.18 }}
          className="tile-fx fx-sm shrink-0 flex items-center gap-2 px-4 sm:px-5 rounded-2xl bg-brand-950 text-white text-sm font-semibold shadow-[0_12px_32px_-16px_rgba(1,33,43,.6)]">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Retour aux prestataires</span>
        </Link>
        <EventSwitcher />
      </div>

      {/* En-tête du dossier */}
      <div className="flex flex-wrap items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-brand-900 text-accent-400 font-display text-3xl grid place-items-center shrink-0">{initials(p.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-brand-800">Dossier prestataire · {p.category || 'Sans catégorie'}</div>
          <h1 className="font-display text-4xl md:text-5xl leading-[0.95] tracking-wide mt-1">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-ink-500">
            {p.phone && <span>{p.phone}</span>}{p.email && <span>{p.email}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={links.whatsapp} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp ${p.name}`} className="w-11 h-11 rounded-full bg-accent-500 text-white grid place-items-center hover:scale-105 transition"><MessageCircle size={19} /></a>
          <a href={links.sms} title="SMS" aria-label={`SMS ${p.name}`} className="w-11 h-11 rounded-full bg-brand-600 text-white grid place-items-center hover:scale-105 transition"><Smartphone size={19} /></a>
          <a href={links.mail} title="E-mail" aria-label={`E-mail ${p.name}`} className="w-11 h-11 rounded-full bg-brand-950 text-white grid place-items-center hover:scale-105 transition"><Mail size={19} /></a>
        </div>
      </div>

      {/* Suivi par étapes : on clique sur une étape pour y placer le prestataire */}
      <section className="tile p-5 sm:p-6 mt-7">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold">Suivi</h2>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${stageStyle[p.status].chip}`}>{p.status}</span>
        </div>
        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {providerStages.map((s, i) => {
            const done = i < stageIndex, cur = i === stageIndex;
            return (
              <li key={s}>
                <button type="button" onClick={() => setStage(s)} aria-current={cur ? 'step' : undefined} aria-label={`Passer à l’étape ${s}`}
                  className="w-full group text-left">
                  <span className={`block h-2 rounded-full transition ${done || cur ? 'bg-brand-500' : 'bg-ink-100 group-hover:bg-brand-200'}`} />
                  <span className={`mt-2 flex items-center gap-1 text-[11px] sm:text-xs ${cur ? 'font-semibold text-brand-950' : done ? 'text-ink-700' : 'text-ink-400'}`}>
                    {done && <Check size={12} className="text-brand-600 shrink-0" />}<span className="truncate">{s}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Totaux */}
      <section className="relative overflow-hidden rounded-[28px] bg-brand-950 text-white p-6 md:p-7 mt-5">
        <div className="pattern bg-[#2a98b8] opacity-[0.12]" />
        <div className="relative grid grid-cols-2 md:grid-cols-5 gap-5">
          {[
            ['Devis', quoted, 'text-white'],
            ['Commandé', ordered, 'text-white'],
            ['Facturé', invoiced, 'text-white'],
            ['Payé', paid, 'text-accent-400'],
            ['Reste à payer', toPay, toPay > 0 ? 'text-accent-300' : 'text-white/70'],
          ].map(([label, v, color]) => (
            <div key={label as string}>
              <div className="text-xs text-white/60">{label}</div>
              <div className={`font-display text-2xl md:text-3xl mt-1 ${color}`}>{money(v as number)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pièces du dossier */}
      <div className="flex flex-wrap items-center gap-3 mt-8 mb-4">
        <h2 className="font-display text-3xl tracking-wide mr-auto">Pièces du dossier</h2>
        <button type="button" onClick={() => setModal({})} style={{ ['--fx' as string]: '#00131a', ['--fx-o' as string]: 0.16 }}
          className="tile-fx fx-sm flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold bg-brand-500 text-white shadow-[0_10px_24px_-10px_rgba(0,163,204,.45)]">
          <FilePlus2 size={18} /> Ajouter une pièce
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Type de pièce">
          {[null, ...docKinds].map((k) => {
            const n = k ? p.docs.filter((d) => d.kind === k).length : p.docs.length;
            return (
              <button key={k ?? 'tous'} type="button" onClick={() => { setKind(k); if (status && k && !docStatuses[k].includes(status)) setStatus(null); }} aria-pressed={kind === k}
                className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium transition ${kind === k ? 'bg-brand-950 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`}>
                {k ? KIND_PLURAL[k] : 'Toutes'} <span className="opacity-60 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex p-1 rounded-full bg-white ring-1 ring-ink-100 sm:ml-auto" role="group" aria-label="Sens">
          {([[null, 'Tous les sens'], ['reçu', 'Reçues'], ['émis', 'Émises']] as const).map(([v, label]) => (
            <button key={label} type="button" onClick={() => setDir(v)} aria-pressed={dir === v}
              className={`text-sm px-3.5 py-1 rounded-full transition ${dir === v ? 'bg-brand-950 text-white' : 'text-ink-700 hover:bg-ink-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      {statusOptions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] mb-4" role="group" aria-label="Statut">
          <span className="shrink-0 text-xs text-ink-500 mr-1">Statut</span>
          <button type="button" onClick={() => setStatus(null)} aria-pressed={!status}
            className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition ${!status ? 'bg-brand-500 text-white' : 'bg-white ring-1 ring-ink-200 text-ink-700 hover:ring-brand-400'}`}>
            Tous
          </button>
          {statusOptions.map((st) => {
            const n = byKindDir.filter((d) => d.status === st).length;
            const on = status === st;
            return (
              <button key={st} type="button" onClick={() => setStatus(on ? null : st)} aria-pressed={on}
                className={`shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold transition ${on ? 'ring-2 ring-brand-950 ' + docStatusStyle(st) : docStatusStyle(st) + ' hover:brightness-95'}`}>
                {st} <span className="opacity-60 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((d) => {
            const Icon = KIND_ICON[d.kind];
            const received = d.direction === 'reçu';
            return (
              <li key={d.id} className="tile p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-4">
                <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 bg-brand-950 text-accent-400"><Icon size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{d.kind} {d.ref}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${received ? 'bg-brand-500/10 text-brand-700' : 'bg-royal-400/20 text-royal-700'}`}>
                      {received ? <><ArrowDownLeft size={12} /> Reçue du prestataire</> : <><ArrowUpRight size={12} /> Émise par la plateforme</>}
                    </span>
                  </div>
                  <div className="text-xs text-ink-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{fmtDate(d.date)} {d.date.slice(0, 4)}</span>
                    {d.fileName && (d.fileKey
                      ? <OpenFile name={d.fileName} fileKey={d.fileKey} />
                      : <span className="flex items-center gap-1 min-w-0"><Paperclip size={12} className="shrink-0" /><span className="truncate max-w-[220px]">{d.fileName}</span></span>)}
                    {d.note && <span className="truncate max-w-[260px]">{d.note}</span>}
                  </div>
                </div>
                <div className="font-display text-xl sm:text-2xl tabular-nums">{money(d.amount)}</div>
                <ChipMenu label="Statut" value={d.status} options={docStatuses[d.kind]} chip={docStatusStyle} align="right"
                  onChange={(v) => setDocs((list) => list.map((x) => (x.id === d.id ? { ...x, status: v } : x)))} />
                <button type="button" onClick={() => setModal({ doc: d })} aria-label={`Modifier ${d.kind} ${d.ref}`} title="Modifier"
                  className="w-9 h-9 rounded-full grid place-items-center text-ink-500 hover:text-brand-900 hover:bg-ink-100 transition"><Pencil size={15} /></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="tile p-10 text-center">
          <div className="font-semibold">{p.docs.length ? 'Aucune pièce ne correspond à ce filtre' : 'Le dossier est encore vide'}</div>
          <p className="text-sm text-ink-500 mt-1">{p.docs.length ? 'Changez le type, le sens ou le statut.' : 'Ajoutez le premier devis, la commande ou une facture.'}</p>
          {p.docs.length > 0 && (kind || dir || status) && (
            <button type="button" onClick={() => { setKind(null); setDir(null); setStatus(null); }} className="mt-3 text-sm text-brand-700 underline underline-offset-2">Tout afficher</button>
          )}
        </div>
      )}

      <DocModal open={!!modal} providerName={p.name} initial={modal?.doc} onClose={closeModal}
        onSubmit={(doc) => { setDocs((list) => (modal?.doc ? list.map((x) => (x.id === doc.id ? doc : x)) : [...list, doc])); setModal(null); }}
        onDelete={modal?.doc ? () => { setDocs((list) => list.filter((x) => x.id !== modal.doc!.id)); setModal(null); } : undefined} />
    </div>
  );
}

/** Pièce jointe stockée en ligne : ouverte par un lien temporaire signé (10 minutes). */
function OpenFile({ name, fileKey }: { name: string; fileKey: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const open = async () => {
    // Fenêtre ouverte tout de suite (sinon le navigateur la bloque), puis dirigée vers le lien signé.
    const w = window.open('', '_blank');
    setState('busy');
    try { const url = await fileUrl(fileKey); if (w) w.location.href = url; else window.location.href = url; setState('idle'); }
    catch { w?.close(); setState('error'); }
  };
  return (
    <button type="button" onClick={open} title={state === 'error' ? 'Impossible d’ouvrir le fichier (connexion requise)' : 'Ouvrir le fichier'}
      className={`relative z-10 flex items-center gap-1 min-w-0 hover:underline ${state === 'error' ? 'text-red-700' : 'text-brand-700'}`}>
      <Paperclip size={12} className="shrink-0" /><span className="truncate max-w-[220px]">{state === 'busy' ? 'Ouverture…' : name}</span>
    </button>
  );
}
