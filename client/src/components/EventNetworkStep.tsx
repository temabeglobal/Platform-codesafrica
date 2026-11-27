import { useState, type ReactNode } from 'react';
import { ChevronDown, Handshake, Megaphone, Plus, Truck, Award, Users, X } from 'lucide-react';
import { commChannels, fmtDate, stagesFor, uid, type CommItem, type Lead, type Provider, type Stage, type Team } from '../demo';

/* Étape FACULTATIVE de la création d'un événement : on peut y préremplir
   prestataires, sponsors, partenaires, planning de communication et équipes. */

export interface NetworkInput {
  providers: Provider[];
  sponsors: Lead[];
  partners: Lead[];
  communication: CommItem[];
  teams: Team[];
}
export const emptyNetwork = (): NetworkInput => ({ providers: [], sponsors: [], partners: [], communication: [], teams: [] });

const field = 'w-full h-10 rounded-xl bg-[var(--sand)] px-3 text-sm outline-none ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500';

export default function EventNetworkStep({ value, onChange }: { value: NetworkInput; onChange: (v: NetworkInput) => void }) {
  const set = <K extends keyof NetworkInput>(k: K, list: NetworkInput[K]) => onChange({ ...value, [k]: list });
  const remove = <K extends keyof NetworkInput>(k: K, i: number) => set(k, value[k].filter((_, j) => j !== i) as NetworkInput[K]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500 px-1">Tout est <b className="text-brand-900">facultatif</b> : vous pourrez compléter ces listes plus tard dans chaque module.</p>

      <Block icon={Truck} title="Prestataires" count={value.providers.length}
        items={value.providers.map((p, i) => <Row key={i} title={p.name} meta={[p.category, p.phone, p.email].filter(Boolean).join(' · ')} onRemove={() => remove('providers', i)} />)}
        form={<ProviderForm onAdd={(p) => set('providers', [...value.providers, p])} />} />

      <Block icon={Award} title="Sponsors" count={value.sponsors.length}
        items={value.sponsors.map((l, i) => <Row key={i} title={l.name} meta={[l.contact, l.stage].filter(Boolean).join(' · ')} onRemove={() => remove('sponsors', i)} />)}
        form={<LeadForm kind="sponsor" onAdd={(l) => set('sponsors', [...value.sponsors, l])} />} />

      <Block icon={Handshake} title="Partenaires" count={value.partners.length}
        items={value.partners.map((l, i) => <Row key={i} title={l.name} meta={[l.contact, l.stage].filter(Boolean).join(' · ')} onRemove={() => remove('partners', i)} />)}
        form={<LeadForm kind="partenaire" onAdd={(l) => set('partners', [...value.partners, l])} />} />

      <Block icon={Megaphone} title="Planning de communication" count={value.communication.length}
        items={[...value.communication].map((c, i) => ({ c, i })).sort((a, b) => a.c.date.localeCompare(b.c.date))
          .map(({ c, i }) => <Row key={i} title={c.subject} meta={`${fmtDate(c.date)} · ${c.channel}`} onRemove={() => remove('communication', i)} />)}
        form={<CommForm onAdd={(c) => set('communication', [...value.communication, c])} />} />

      <Block icon={Users} title="Équipes" count={value.teams.length}
        items={value.teams.map((t, i) => <Row key={i} title={t.name} meta={[t.lead && `Resp. ${t.lead}`, t.members.map((m) => m.name).join(', ')].filter(Boolean).join(' · ')} onRemove={() => remove('teams', i)} />)}
        form={<TeamForm onAdd={(t) => set('teams', [...value.teams, t])} />} />
    </div>
  );
}

function Block({ icon: Icon, title, count, items, form }: { icon: typeof Truck; title: string; count: number; items: ReactNode[]; form: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-200 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-[var(--sand)]/60 transition">
        <span className="w-9 h-9 rounded-xl bg-brand-950 text-accent-400 grid place-items-center shrink-0"><Icon size={17} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-ink-500">{count ? `${count} ajouté${count > 1 ? 's' : ''}` : 'Facultatif'}</span>
        </span>
        {count > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-royal-300/50 text-royal-700">{count}</span>}
        <ChevronDown size={18} className={`text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-ink-100 px-4 sm:px-5 py-4 space-y-3">
          {items.length > 0 && <ul className="space-y-2">{items}</ul>}
          {form}
        </div>
      )}
    </div>
  );
}

function Row({ title, meta, onRemove }: { title: string; meta: string; onRemove: () => void }) {
  return (
    <li className="plate flex items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">{title}</span>
        {meta && <span className="block text-xs text-ink-500 truncate">{meta}</span>}
      </span>
      <button type="button" aria-label={`Retirer ${title}`} onClick={onRemove} className="w-7 h-7 rounded-full hover:bg-ink-100 grid place-items-center shrink-0"><X size={14} /></button>
    </li>
  );
}

function AddButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-10 px-4 rounded-xl text-sm font-semibold bg-brand-950 text-white flex items-center justify-center gap-1.5 disabled:opacity-40 shrink-0">
      <Plus size={16} /> Ajouter
    </button>
  );
}

function ProviderForm({ onAdd }: { onAdd: (p: Provider) => void }) {
  const blank = { name: '', category: '', phone: '', email: '' };
  const [f, setF] = useState(blank);
  const ok = f.name.trim().length > 0;
  const add = () => { if (!ok) return; onAdd({ ...f, id: uid(), name: f.name.trim(), status: 'À contacter', docs: [] }); setF(blank); };
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      <input aria-label="Nom du prestataire" placeholder="Nom du prestataire *" className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <input aria-label="Catégorie" placeholder="Catégorie (traiteur, son…)" className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      <input aria-label="Téléphone / WhatsApp" type="tel" placeholder="Téléphone / WhatsApp" className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <div className="flex gap-2">
        <input aria-label="E-mail" type="email" placeholder="E-mail" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <AddButton disabled={!ok} onClick={add} />
      </div>
    </div>
  );
}

function LeadForm({ kind, onAdd }: { kind: string; onAdd: (l: Lead) => void }) {
  const stages = stagesFor(kind === 'sponsor' ? 'sponsors' : 'partenaires');
  const blank = { name: '', contact: '', stage: stages[0] as Stage };
  const [f, setF] = useState(blank);
  const ok = f.name.trim().length > 0;
  const add = () => { if (!ok) return; onAdd({ ...f, name: f.name.trim(), contact: f.contact.trim() || 'À identifier' }); setF(blank); };
  return (
    <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
      <input aria-label={`Nom du ${kind}`} placeholder={`Nom du ${kind} *`} className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <input aria-label="Contact" placeholder="Personne de contact" className={field} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
      <select aria-label="Étape" className={field} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}>
        {stages.map((s) => <option key={s}>{s}</option>)}
      </select>
      <AddButton disabled={!ok} onClick={add} />
    </div>
  );
}

function CommForm({ onAdd }: { onAdd: (c: CommItem) => void }) {
  const blank = { date: '', channel: commChannels[0] as string, subject: '' };
  const [f, setF] = useState(blank);
  const ok = f.subject.trim().length > 0 && !!f.date;
  const add = () => { if (!ok) return; onAdd({ ...f, subject: f.subject.trim() }); setF(blank); };
  return (
    <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
      <input aria-label="Sujet de la publication" placeholder="Sujet (ex. annonce des dates) *" className={`${field} sm:col-span-3`} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <input aria-label="Date de publication" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <select aria-label="Canal" className={field} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
        {commChannels.map((c) => <option key={c}>{c}</option>)}
      </select>
      <AddButton disabled={!ok} onClick={add} />
    </div>
  );
}

function TeamForm({ onAdd }: { onAdd: (t: Team) => void }) {
  const blank = { name: '', lead: '', members: '' };
  const [f, setF] = useState(blank);
  const ok = f.name.trim().length > 0;
  const add = () => { if (!ok) return; onAdd({ id: uid(), name: f.name.trim(), lead: f.lead.trim(), members: f.members.split(',').map((n) => n.trim()).filter(Boolean).map((name) => ({ id: uid(), name, role: '' })) }); setF(blank); };
  return (
    <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <input aria-label="Nom de l’équipe" placeholder="Nom de l’équipe *" className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <input aria-label="Responsable de l’équipe" placeholder="Responsable" className={field} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} />
      <input aria-label="Membres" placeholder="Membres (ex. Paul, Aline)" className={field} value={f.members} onChange={(e) => setF({ ...f, members: e.target.value })} />
      <AddButton disabled={!ok} onClick={add} />
    </div>
  );
}
