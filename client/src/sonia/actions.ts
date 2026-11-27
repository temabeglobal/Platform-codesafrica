/* Actions que Sonia peut PROPOSER dans la plateforme.
   Sonia ne modifie jamais rien elle-même : elle propose une liste d'actions, chacune est résumée en clair,
   et rien n'est appliqué tant que la personne connectée ne l'a pas autorisée.
   Les actions passent par les mêmes fonctions que les formulaires : enregistrement sur l'appareil d'abord,
   puis synchronisation en ligne comme n'importe quelle modification. */

import type { EventsState as EventsStateForSonia } from '../events';
import { commChannels, paymentStatuses, providerStages, billingStatuses, sponsorStages, pipelineStages, standSizes, uid, fmtDate,
  type Lead, type Stage, type TaskStatus } from '../demo';
import { participantStages } from '../wmt';
import { SPEAKER_STATUSES } from '../programme';
import { syntheseFor } from './synthese';
import { emptyEvaluation } from '../evaluation';
import { BADGE_CATEGORIES, newToken, nextNumber, type BadgeCategory } from '../accreditation';

export interface ProposedAction { id: string; name: string; args: Record<string, unknown> }

type Json = Record<string, unknown>;
interface Def {
  description: string;
  parameters: Json;
  /** Résumé en une ou plusieurs lignes, montré avant l'autorisation. */
  summary: (a: any, s: EventsStateForSonia) => string;
  /** Applique l'action ; lève une erreur (message en français) si elle n'est pas possible. */
  run: (a: any, s: EventsStateForSonia) => void;
}

// —— Aides pour les schémas ——
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const oneOf = (values: readonly string[], description = '') => ({ type: 'string', enum: [...values], description });
const date = (description = 'Date au format AAAA-MM-JJ') => ({ type: 'string', description });
const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const list = (items: Json, description = '') => ({ type: 'array', items, description, minItems: 1, maxItems: 500 });

const TASK_STATUSES = ['À faire', 'En cours', 'Terminée'] as const;
const LEAD_KINDS = ['partenaires', 'sponsors'] as const;
const EVENT_FIELDS = {
  name: str('Nom'), start: date('Début, AAAA-MM-JJ'), end: date('Fin, AAAA-MM-JJ'), place: str('Lieu'), type: str('Type (Forum, Conférence…)'),
  description: str('Description'), budget: str('Budget prévu, en dollars (chiffres seulement)'), owner: str('Responsable'), attendees: str('Participants attendus (chiffres seulement)'),
};

// —— Contrôles ——
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const need = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);
const amount = (v: unknown) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
const usd = (n: number) => `${n.toLocaleString('fr-FR')} $`;
const day = (d: string) => (isDate(d) ? fmtDate(d) : d || 'date à préciser');
const items = (a: { items?: unknown[] }) => (Array.isArray(a.items) ? a.items : []) as Json[];
const many = (n: number, one: string, more: string) => `${n} ${n > 1 ? more : one}`;
const bullet = (lines: string[], max = 8) => lines.slice(0, max).map((l) => `• ${l}`).join('\n') + (lines.length > max ? `\n• … et ${lines.length - max} de plus` : '');

/* Les éléments existants sont désignés par leur NOM (intitulé, thématique…), jamais par un identifiant interne :
   un nom se lit et se vérifie, un identifiant se confond facilement. Majuscules, accents et espaces ne comptent pas ;
   un nom absent ou porté par plusieurs éléments est refusé plutôt que deviné. */
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
function findOne<T>(list: readonly T[], label: (x: T) => string, value: unknown, what: string, where = 'la page concernée'): T {
  const hits = list.filter((x) => norm(label(x)) === norm(value));
  need(norm(value) && hits.length, `${what} « ${value ?? ''} » introuvable.`);
  need(hits.length === 1, `Plusieurs éléments (${what.toLowerCase()}) s’appellent « ${value} » : faites cette modification depuis ${where}.`);
  return hits[0];
}
const taskNamed = (s: EventsStateForSonia, title: unknown) => findOne(s.data.tasks, (t) => t.title, title, 'Tâche', 'la page Tâches');
const teamNamed = (s: EventsStateForSonia, name: unknown) => findOne(s.data.teams, (t) => t.name, name, 'Équipe', 'la page Équipes');
const providerNamed = (s: EventsStateForSonia, name: unknown) => findOne(s.data.providers, (p) => p.name, name, 'Prestataire', 'la page Prestataires');
const badgesByName = (s: EventsStateForSonia, names: unknown[]) => names.map((n) => findOne(s.data.badges, (b) => b.name, n, 'Badge', 'la page Accréditations'));
/** Intervenant d'une session, par son nom (« M. Diallo » retrouve aussi « M. Diallo (exemple) »). */
const speakerIn = (p: { theme: string; speakers: { id: string; name: string; title: string; status: string }[] }, name: unknown) => {
  const exact = p.speakers.filter((x) => norm(x.name) === norm(name));
  const bare = (v: unknown) => norm(String(v ?? '').replace(/\([^)]*\)/g, ''));
  return findOne(exact.length ? exact : p.speakers.filter((x) => bare(x.name) === bare(name)), (x) => (exact.length ? x.name : String(name)), name, `Intervenant de « ${p.theme} »`, 'la page Programme › Thématiques');
};
/** Session désignée par sa thématique (et son jour si deux sessions ont la même thématique). */
const sessionNamed = (s: EventsStateForSonia, theme: unknown, date?: unknown) =>
  findOne(s.data.programme.filter((p) => !isDate(date) || p.date === date), (p) => p.theme, theme, 'Session', 'la page Programme');
const leadsOf = (s: EventsStateForSonia, kind: string) => (kind === 'sponsors' ? s.data.sponsors : s.data.partners);

export const ACTIONS: Record<string, Def> = {
  // —— Événements ——
  creer_evenement: {
    description: 'Crée un nouvel événement et en fait l’événement actif.',
    parameters: obj({ ...EVENT_FIELDS }, ['name', 'start', 'end']),
    summary: (a) => `Créer l’événement « ${a.name} » (${day(a.start)} → ${day(a.end)}${a.place ? `, ${a.place}` : ''}).`,
    run: (a, s) => {
      need(text(a.name) && isDate(a.start) && isDate(a.end), 'Nom ou dates de l’événement invalides.');
      const year = a.start.slice(0, 4);
      s.add({ name: text(a.name), start: a.start, end: a.end, place: text(a.place), type: text(a.type) || 'Forum', color: '#0A86A8',
        reference: `CA-${text(a.name).replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'EVT'}-${year}-${String(Math.floor(Math.random() * 900) + 100)}`,
        description: text(a.description, 2000), budget: String(amount(a.budget) || ''), owner: text(a.owner) || 'Équipe organisation', attendees: String(amount(a.attendees) || '') });
    },
  },
  modifier_evenement: {
    description: 'Modifie les informations de l’événement actif (seuls les champs fournis changent).',
    parameters: obj({ ...EVENT_FIELDS }),
    summary: (a, s) => `Modifier « ${s.current.name} » : ${Object.entries(a).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k} → ${v}`).join(', ')}.`,
    run: (a, s) => {
      const { id, ...cur } = s.current;
      const next = { ...cur };
      for (const k of Object.keys(EVENT_FIELDS) as (keyof typeof EVENT_FIELDS)[]) if (typeof a[k] === 'string' && a[k].trim()) next[k] = text(a[k], 2000);
      need(isDate(next.start) && isDate(next.end), 'Dates invalides.');
      s.update(id, next);
    },
  },
  changer_evenement: {
    description: 'Change l’événement actif (pour travailler sur un autre événement), désigné par son nom exact.',
    parameters: obj({ name: str('Nom exact de l’événement (liste « evenements »)') }, ['name']),
    summary: (a, s) => `Ouvrir l’événement « ${findOne(s.events, (e) => e.name, a.name, 'Événement').name} ».`,
    run: (a, s) => s.select(findOne(s.events, (e) => e.name, a.name, 'Événement').id),
  },

  supprimer_evenement: {
    description: 'Supprime un événement entier (tâches, budget, contacts, programme, badges… compris), désigné par son nom exact. Il disparaît pour toute l’équipe.',
    parameters: obj({ name: str('Nom exact de l’événement (liste « evenements »)') }, ['name']),
    summary: (a, s) => {
      const e = findOne(s.events, (x) => x.name, a.name, 'Événement');
      const d = e.id === s.current.id ? s.data : undefined;
      const detail = d ? ` : ${[many(d.tasks.length, 'tâche', 'tâches'), many(d.budget.length, 'poste de budget', 'postes de budget'), many(d.providers.length, 'prestataire', 'prestataires'),
        many(d.partners.length + d.sponsors.length, 'partenaire ou sponsor', 'partenaires et sponsors'), many(d.programme.length, 'session', 'sessions'), many(d.badges.length, 'badge', 'badges')].join(', ')}` : '';
      return `Supprimer l’événement « ${e.name} » (${day(e.start)} → ${day(e.end)}) et toutes ses données${detail}.\nIl disparaîtra pour toute l’équipe.`;
    },
    run: (a, s) => s.remove(findOne(s.events, (x) => x.name, a.name, 'Événement').id),
  },

  // —— Tâches ——
  ajouter_taches: {
    description: 'Ajoute une ou plusieurs tâches, avec leurs phases et sous-tâches si elles sont données.',
    parameters: obj({ items: list(obj({
      title: str('Intitulé'), owner: str('Responsable'), due: date('Échéance AAAA-MM-JJ'), status: oneOf(TASK_STATUSES),
      phases: { type: 'array', items: obj({ title: str('Nom de la phase'), subtasks: { type: 'array', items: { type: 'string' } } }, ['title', 'subtasks']) },
    }, ['title', 'due'])) }, ['items']),
    summary: (a) => `Ajouter ${many(items(a).length, 'tâche', 'tâches')} :\n${bullet(items(a).map((t) => {
      const phases = Array.isArray(t.phases) ? (t.phases as Json[]) : [];
      const detail = phases.map((p) => `\n   ${text(p.title) || 'Phase'} : ${(Array.isArray(p.subtasks) ? p.subtasks : []).map((x) => text(x)).filter(Boolean).join(', ') || 'aucune sous-tâche'}`).join('');
      return `${t.title} — ${t.owner || 'sans responsable'}, pour le ${day(t.due as string)}${detail}`;
    }))}`,
    run: (a, s) => {
      const list = items(a);
      need(list.length && list.every((t) => text(t.title) && isDate(t.due)), 'Chaque tâche doit avoir un intitulé et une échéance valide.');
      for (const t of list) {
        const created = s.addTask({ title: text(t.title), owner: text(t.owner), due: t.due as string, progress: 0, status: pick(t.status, TASK_STATUSES, 'À faire') as TaskStatus });
        const phases = Array.isArray(t.phases) ? (t.phases as Json[]) : [];
        if (phases.length) s.updateTask(created.id, (x) => ({ ...x, phases: phases.map((p) => ({ id: uid(), title: text(p.title) || 'Phase',
          subtasks: (Array.isArray(p.subtasks) ? p.subtasks : []).map((st) => ({ id: uid(), title: text(st), done: false })).filter((st) => st.title) })) }));
      }
    },
  },
  modifier_tache: {
    description: 'Modifie une tâche existante, désignée par son intitulé exact (intitulé, responsable, échéance, statut).',
    parameters: obj({ task: str('Intitulé exact actuel de la tâche'), title: str('Nouvel intitulé'), owner: str('Nouveau responsable'), due: date('Nouvelle échéance'), status: oneOf(TASK_STATUSES) }, ['task']),
    summary: (a, s) => `Modifier la tâche « ${taskNamed(s, a.task).title} »${[a.title && `intitulé → ${a.title}`, a.owner && `responsable → ${a.owner}`, a.due && `échéance → ${day(a.due)}`, a.status && `statut → ${a.status}`].filter(Boolean).map((x) => ` ; ${x}`).join('')}.`,
    run: (a, s) => {
      const task = taskNamed(s, a.task);
      need(!a.due || isDate(a.due), 'Échéance invalide.');
      s.updateTask(task.id, (t) => ({ ...t, title: text(a.title) || t.title, owner: text(a.owner) || t.owner, due: a.due || t.due,
        status: a.status ? pick(a.status, TASK_STATUSES, t.status) as TaskStatus : t.status }));
    },
  },
  cocher_sous_taches: {
    description: 'Coche ou décoche des sous-tâches d’une tâche (l’avancement se recalcule). Tâche et sous-tâches désignées par leur intitulé exact.',
    parameters: obj({ task: str('Intitulé exact de la tâche'), subtasks: list({ type: 'string' }, 'Intitulés exacts des sous-tâches'), done: { type: 'boolean' } }, ['task', 'subtasks', 'done']),
    summary: (a, s) => {
      const task = taskNamed(s, a.task);
      const all = [...task.phases.flatMap((p) => p.subtasks), ...(task.loose ?? [])];
      const found = (a.subtasks ?? []).map((n: unknown) => findOne(all, (x) => x.title, n, 'Sous-tâche'));
      return `${a.done ? 'Cocher' : 'Décocher'} dans « ${task.title} » :\n${bullet(found.map((x: { title: string }) => x.title), 20)}`;
    },
    run: (a, s) => {
      const task = taskNamed(s, a.task);
      const all = [...task.phases.flatMap((p) => p.subtasks), ...(task.loose ?? [])];
      const ids = new Set((a.subtasks ?? []).map((n: unknown) => findOne(all, (x) => x.title, n, 'Sous-tâche').id));
      const mark = (st: { id: string; title: string; done: boolean }) => (ids.has(st.id) ? { ...st, done: !!a.done } : st);
      s.updateTask(task.id, (t) => ({ ...t, phases: t.phases.map((p) => ({ ...p, subtasks: p.subtasks.map(mark) })), loose: t.loose?.map(mark) }));
    },
  },
  supprimer_taches: {
    description: 'Supprime des tâches, désignées par leur intitulé exact.',
    parameters: obj({ tasks: list({ type: 'string' }, 'Intitulés exacts des tâches') }, ['tasks']),
    summary: (a, s) => `Supprimer ${many((a.tasks ?? []).length, 'tâche', 'tâches')} :\n${bullet((a.tasks ?? []).map((n: unknown) => { const t = taskNamed(s, n); return `${t.title} — ${t.owner || 'sans responsable'}, pour le ${day(t.due)}`; }), 20)}`,
    run: (a, s) => { for (const t of (a.tasks ?? []).map((n: unknown) => taskNamed(s, n))) s.removeTask(t.id); },
  },

  supprimer_sous_taches: {
    description: 'Supprime des sous-tâches et/ou des phases entières d’une tâche (l’avancement se recalcule). Tout est désigné par son intitulé exact.',
    parameters: obj({ task: str('Intitulé exact de la tâche'), subtasks: { type: 'array', items: { type: 'string' }, description: 'Intitulés exacts des sous-tâches à supprimer' },
      phases: { type: 'array', items: { type: 'string' }, description: 'Noms exacts des phases à supprimer (avec leurs sous-tâches)' } }, ['task']),
    summary: (a, s) => {
      const task = taskNamed(s, a.task);
      const all = [...task.phases.flatMap((p) => p.subtasks), ...(task.loose ?? [])];
      const ph = (a.phases ?? []).map((n: unknown) => findOne(task.phases, (x) => x.title, n, 'Phase'));
      const st = (a.subtasks ?? []).map((n: unknown) => findOne(all, (x) => x.title, n, 'Sous-tâche'));
      need(ph.length || st.length, 'Aucune sous-tâche ni phase désignée.');
      return `Dans la tâche « ${task.title} », supprimer :\n${bullet([...ph.map((p: { title: string; subtasks: unknown[] }) => `la phase « ${p.title} » (${many(p.subtasks.length, 'sous-tâche', 'sous-tâches')})`), ...st.map((x: { title: string }) => x.title)], 20)}`;
    },
    run: (a, s) => {
      const task = taskNamed(s, a.task);
      const all = [...task.phases.flatMap((p) => p.subtasks), ...(task.loose ?? [])];
      const phases = new Set((a.phases ?? []).map((n: unknown) => findOne(task.phases, (x) => x.title, n, 'Phase').id));
      const subs = new Set((a.subtasks ?? []).map((n: unknown) => findOne(all, (x) => x.title, n, 'Sous-tâche').id));
      need(phases.size || subs.size, 'Aucune sous-tâche ni phase désignée.');
      s.updateTask(task.id, (t) => ({ ...t, phases: t.phases.filter((p) => !phases.has(p.id)).map((p) => ({ ...p, subtasks: p.subtasks.filter((x) => !subs.has(x.id)) })),
        loose: t.loose?.filter((x) => !subs.has(x.id)) }));
    },
  },

  // —— Communication ——
  ajouter_publications: {
    description: 'Planifie des publications dans le calendrier de communication.',
    parameters: obj({ items: list(obj({ date: date(), channel: oneOf(commChannels), subject: str('Sujet') }, ['date', 'channel', 'subject'])) }, ['items']),
    summary: (a) => `Planifier ${many(items(a).length, 'publication', 'publications')} :\n${bullet(items(a).map((c) => `${day(c.date as string)} · ${c.channel} · ${c.subject}`))}`,
    run: (a, s) => {
      const list = items(a);
      need(list.length && list.every((c) => isDate(c.date) && text(c.subject)), 'Chaque publication doit avoir une date valide et un sujet.');
      for (const c of list) s.addComm({ date: c.date as string, channel: pick(c.channel, commChannels, 'Réseaux sociaux'), subject: text(c.subject) });
    },
  },
  supprimer_publication: {
    description: 'Supprime une publication du calendrier (repérée par sa date et son sujet exact).',
    parameters: obj({ date: date(), subject: str('Sujet exact') }, ['date', 'subject']),
    summary: (a) => `Supprimer la publication du ${day(a.date)} « ${a.subject} ».`,
    run: (a, s) => {
      s.removeComm(findOne(s.data.communication.filter((x) => x.date === a.date), (x) => x.subject, a.subject, 'Publication', 'le calendrier de communication'));
    },
  },

  // —— Prestataires ——
  ajouter_prestataires: {
    description: 'Ajoute des prestataires (traiteur, sonorisation, hôtel…).',
    parameters: obj({ items: list(obj({ name: str('Nom'), category: str('Catégorie'), phone: str('Téléphone'), email: str('E-mail'), status: oneOf(providerStages) }, ['name', 'category'])) }, ['items']),
    summary: (a) => `Ajouter ${many(items(a).length, 'prestataire', 'prestataires')} :\n${bullet(items(a).map((p) => `${p.name} (${p.category})${p.phone ? ` · ${p.phone}` : ''}${p.email ? ` · ${p.email}` : ''}`))}`,
    run: (a, s) => {
      const list = items(a);
      need(list.length && list.every((p) => text(p.name)), 'Chaque prestataire doit avoir un nom.');
      for (const p of list) s.addProvider({ name: text(p.name), category: text(p.category) || 'Autre', phone: text(p.phone), email: text(p.email), status: pick(p.status, providerStages, 'À contacter') });
    },
  },
  modifier_prestataire: {
    description: 'Modifie un prestataire, désigné par son nom exact (statut, coordonnées, catégorie, nouveau nom).',
    parameters: obj({ provider: str('Nom exact actuel du prestataire'), name: str('Nouveau nom'), category: str('Catégorie'), phone: str('Téléphone'), email: str('E-mail'), status: oneOf(providerStages) }, ['provider']),
    summary: (a, s) => `Modifier le prestataire « ${providerNamed(s, a.provider).name} »${[a.name && `nom → ${a.name}`, a.category && `catégorie → ${a.category}`, a.status && `statut → ${a.status}`, a.phone && `tél. → ${a.phone}`, a.email && `e-mail → ${a.email}`].filter(Boolean).map((x) => ` ; ${x}`).join('')}.`,
    run: (a, s) => {
      const prov = providerNamed(s, a.provider);
      s.updateProvider(prov.id, (p) => ({ ...p, name: text(a.name) || p.name, category: text(a.category) || p.category, phone: text(a.phone) || p.phone, email: text(a.email) || p.email,
        status: a.status ? pick(a.status, providerStages, p.status) : p.status }));
    },
  },

  supprimer_prestataires: {
    description: 'Supprime des prestataires (avec leur dossier : devis, commandes, factures), désignés par leur nom exact. Les dépenses liées restent, sans prestataire.',
    parameters: obj({ names: list({ type: 'string' }, 'Noms exacts des prestataires à supprimer') }, ['names']),
    summary: (a, s) => {
      const found = (a.names ?? []).map((n: unknown) => providerNamed(s, n));
      return `Supprimer ${many(found.length, 'prestataire', 'prestataires')} :\n${bullet(found.map((p: { name: string; category: string; status: string; docs: unknown[] }) => `${p.name} (${p.category}) — ${p.status}${p.docs.length ? `, ${many(p.docs.length, 'document', 'documents')} dans son dossier` : ''}`), 20)}`;
    },
    run: (a, s) => {
      const found = (a.names ?? []).map((n: unknown) => providerNamed(s, n));
      need(found.length, 'Aucun prestataire désigné.');
      for (const p of found) s.removeProvider(p.id);
    },
  },

  supprimer_documents_prestataire: {
    description: 'Supprime des documents (devis, commandes, factures) du dossier d’un prestataire, désignés par leur référence exacte.',
    parameters: obj({ provider: str('Nom exact du prestataire'), refs: list({ type: 'string' }, 'Références exactes des documents') }, ['provider', 'refs']),
    summary: (a, s) => {
      const p = providerNamed(s, a.provider);
      const docs = (a.refs ?? []).map((r: unknown) => findOne(p.docs, (d) => d.ref, r, 'Document'));
      return `Supprimer du dossier de « ${p.name} » :\n${bullet(docs.map((d: { kind: string; ref: string; amount: number; date: string }) => `${d.kind} ${d.ref} — ${usd(d.amount)}, ${day(d.date)}`), 20)}`;
    },
    run: (a, s) => {
      const p = providerNamed(s, a.provider);
      const ids = new Set((a.refs ?? []).map((r: unknown) => findOne(p.docs, (d) => d.ref, r, 'Document').id));
      s.updateProvider(p.id, (x) => ({ ...x, docs: x.docs.filter((d) => !ids.has(d.id)) }));
    },
  },

  // —— Budget ——
  ajouter_depenses: {
    description: 'Ajoute des dépenses à un poste du budget (le poste est créé s’il n’existe pas).',
    parameters: obj({
      poste: str('Poste de budget (ex. Restauration, Logistique)'), prevu: num('Montant prévu du poste, en dollars (facultatif)'),
      items: list(obj({ label: str('Libellé'), qty: num('Quantité'), unitPrice: num('Prix unitaire en dollars'), date: date(), payment: oneOf(paymentStatuses), paidOn: date('Date du paiement') }, ['label', 'qty', 'unitPrice', 'date'])),
    }, ['poste', 'items']),
    summary: (a) => {
      const l = items(a);
      const total = l.reduce((t, e) => t + (amount(e.qty) || 0) * (amount(e.unitPrice) || 0), 0);
      return `Ajouter ${many(l.length, 'dépense', 'dépenses')} au poste « ${a.poste} » (total ${usd(total)}${a.prevu ? `, prévu ${usd(amount(a.prevu))}` : ''}) :\n${bullet(l.map((e) => `${e.label} — ${amount(e.qty)} × ${usd(amount(e.unitPrice))}, ${e.payment ?? 'Payé'}`))}`;
    },
    run: (a, s) => {
      const l = items(a);
      need(text(a.poste) && l.length && l.every((e) => text(e.label) && amount(e.qty) > 0 && amount(e.unitPrice) >= 0 && isDate(e.date)), 'Chaque dépense doit avoir un libellé, une quantité, un prix et une date valides.');
      l.forEach((e, i) => {
        const qty = amount(e.qty), unitPrice = amount(e.unitPrice);
        s.addExpense(text(a.poste), { id: uid(), label: text(e.label), qty, unitPrice, amount: Math.round(qty * unitPrice * 100) / 100, date: e.date as string,
          payment: pick(e.payment, paymentStatuses, 'Payé'), paidOn: isDate(e.paidOn) ? e.paidOn : (e.date as string) }, i === 0 && a.prevu !== undefined ? amount(a.prevu) : undefined);
      });
    },
  },
  supprimer_depense: {
    description: 'Supprime une dépense d’un poste du budget, désignée par le poste et le libellé exact de la dépense.',
    parameters: obj({ poste: str('Poste exact'), label: str('Libellé exact de la dépense'), date: date('Date de la dépense, si deux dépenses ont le même libellé') }, ['poste', 'label']),
    summary: (a, s) => {
      const line = findOne(s.data.budget, (b) => b.label, a.poste, 'Poste de budget', 'la page Budget');
      const e = findOne((line.expenses ?? []).filter((x) => !isDate(a.date) || x.date === a.date), (x) => x.label, a.label, 'Dépense', 'la page Budget');
      return `Supprimer la dépense « ${e.label} » (${usd(e.amount)}, ${day(e.date)}) du poste « ${line.label} ».`;
    },
    run: (a, s) => {
      const line = findOne(s.data.budget, (b) => b.label, a.poste, 'Poste de budget', 'la page Budget');
      const e = findOne((line.expenses ?? []).filter((x) => !isDate(a.date) || x.date === a.date), (x) => x.label, a.label, 'Dépense', 'la page Budget');
      s.removeExpense(line.label, e.id);
    },
  },

  supprimer_postes: {
    description: 'Supprime des postes du budget, avec toutes leurs dépenses, désignés par leur nom exact.',
    parameters: obj({ postes: list({ type: 'string' }, 'Noms exacts des postes') }, ['postes']),
    summary: (a, s) => {
      const found = (a.postes ?? []).map((n: unknown) => findOne(s.data.budget, (b) => b.label, n, 'Poste de budget', 'la page Budget'));
      return `Supprimer ${many(found.length, 'poste de budget', 'postes de budget')} :\n${bullet(found.map((b: { label: string; planned: number; spent: number; expenses?: unknown[] }) => `${b.label} — prévu ${usd(b.planned)}, dépensé ${usd(b.spent)}${b.expenses?.length ? ` (${many(b.expenses.length, 'dépense supprimée', 'dépenses supprimées')} aussi)` : ''}`), 20)}`;
    },
    run: (a, s) => { for (const b of (a.postes ?? []).map((n: unknown) => findOne(s.data.budget, (x) => x.label, n, 'Poste de budget', 'la page Budget'))) s.removeBudgetLine(b.label); },
  },

  // —— Partenaires et sponsors ——
  ajouter_contacts: {
    description: 'Ajoute des partenaires ou des sponsors.',
    parameters: obj({
      kind: oneOf(LEAD_KINDS),
      items: list(obj({ name: str('Organisation'), contact: str('Personne de contact'), stage: oneOf([...new Set([...pipelineStages, ...sponsorStages])], 'Étape du suivi'),
        note: str('Note'), budget: num('Sponsors : montant en dollars'), billing: oneOf(billingStatuses), stand: oneOf(standSizes) }, ['name', 'contact'])),
    }, ['kind', 'items']),
    summary: (a) => `Ajouter ${many(items(a).length, a.kind === 'sponsors' ? 'sponsor' : 'partenaire', a.kind === 'sponsors' ? 'sponsors' : 'partenaires')} :\n${bullet(items(a).map((l) => `${l.name} — ${l.contact || 'contact à préciser'}${l.budget ? `, ${usd(amount(l.budget))}` : ''}`))}`,
    run: (a, s) => {
      const kind = pick(a.kind, LEAD_KINDS, 'partenaires');
      const stages: readonly Stage[] = kind === 'sponsors' ? sponsorStages : pipelineStages;
      const existing = new Set(leadsOf(s, kind).map((l) => l.name.toLowerCase()));
      const l = items(a);
      need(l.length && l.every((x) => text(x.name)), 'Chaque contact doit avoir un nom.');
      for (const x of l) {
        const name = text(x.name);
        need(!existing.has(name.toLowerCase()), `« ${name} » existe déjà.`);
        existing.add(name.toLowerCase());
        const lead: Lead = { name, contact: text(x.contact), stage: pick(x.stage, stages, stages[0]), note: text(x.note, 1000) || undefined };
        if (kind === 'sponsors') {
          if (amount(x.budget) > 0) lead.budget = amount(x.budget);
          if (x.billing) lead.billing = pick(x.billing, billingStatuses, 'Facture élaborée');
          if (x.stand) lead.stand = pick(x.stand, standSizes, '9 m²');
        }
        s.addLead(kind, lead);
      }
    },
  },
  modifier_contact: {
    description: 'Modifie un partenaire ou un sponsor (repéré par son nom exact).',
    parameters: obj({ kind: oneOf(LEAD_KINDS), name: str('Nom exact actuel'), newName: str('Nouveau nom'), contact: str('Contact'),
      stage: oneOf([...new Set([...pipelineStages, ...sponsorStages])]), note: str('Note'), budget: num('Montant en dollars'), billing: oneOf(billingStatuses), stand: oneOf(standSizes) }, ['kind', 'name']),
    summary: (a) => `Modifier ${a.kind === 'sponsors' ? 'le sponsor' : 'le partenaire'} « ${a.name} »${[a.newName && `nom → ${a.newName}`, a.contact && `contact → ${a.contact}`, a.stage && `étape → ${a.stage}`, a.billing && `facturation → ${a.billing}`, a.budget && `montant → ${usd(amount(a.budget))}`, a.stand && `stand → ${a.stand}`, a.note && `note → ${a.note}`].filter(Boolean).map((x) => ` ; ${x}`).join('')}.`,
    run: (a, s) => {
      const kind = pick(a.kind, LEAD_KINDS, 'partenaires');
      const old = findOne(leadsOf(s, kind), (l) => l.name, a.name, kind === 'sponsors' ? 'Sponsor' : 'Partenaire');
      const stages: readonly Stage[] = kind === 'sponsors' ? sponsorStages : pipelineStages;
      const next: Lead = { ...old!, name: text(a.newName) || old!.name, contact: text(a.contact) || old!.contact, stage: a.stage ? pick(a.stage, stages, old!.stage) : old!.stage,
        note: text(a.note, 1000) || old!.note };
      if (kind === 'sponsors') {
        if (a.budget !== undefined && amount(a.budget) >= 0) next.budget = amount(a.budget);
        if (a.billing) next.billing = pick(a.billing, billingStatuses, old!.billing ?? 'Facture élaborée');
        if (a.stand) next.stand = pick(a.stand, standSizes, old!.stand ?? '9 m²');
      }
      s.updateLead(kind, old!.name, next);
    },
  },
  supprimer_contact: {
    description: 'Supprime un partenaire ou un sponsor (nom exact).',
    parameters: obj({ kind: oneOf(LEAD_KINDS), name: str('Nom exact') }, ['kind', 'name']),
    summary: (a) => `Supprimer ${a.kind === 'sponsors' ? 'le sponsor' : 'le partenaire'} « ${a.name} ».`,
    run: (a, s) => { const kind = pick(a.kind, LEAD_KINDS, 'partenaires'); s.removeLead(kind, findOne(leadsOf(s, kind), (l) => l.name, a.name, kind === 'sponsors' ? 'Sponsor' : 'Partenaire').name); },
  },

  // —— Équipes ——
  ajouter_equipe: {
    description: 'Crée une équipe avec ses membres et leurs responsabilités.',
    parameters: obj({ name: str('Nom de l’équipe'), lead: str('Responsable'), members: { type: 'array', items: obj({ name: str('Nom'), role: str('Responsabilité') }, ['name', 'role']) } }, ['name', 'lead', 'members']),
    summary: (a) => `Créer l’équipe « ${a.name} » (responsable ${a.lead || 'à désigner'}) avec ${many((a.members ?? []).length, 'membre', 'membres')}${(a.members ?? []).length ? ` :\n${bullet((a.members as Json[]).map((m) => `${m.name} — ${m.role}`))}` : '.'}`,
    run: (a, s) => {
      need(text(a.name), 'Nom d’équipe manquant.');
      s.addTeam({ id: uid(), name: text(a.name), lead: text(a.lead), members: (Array.isArray(a.members) ? a.members as Json[] : []).filter((m) => text(m.name)).map((m) => ({ id: uid(), name: text(m.name), role: text(m.role) })) });
    },
  },
  ajouter_membres: {
    description: 'Ajoute des membres à une équipe existante, désignée par son nom exact.',
    parameters: obj({ team: str('Nom exact de l’équipe'), members: list(obj({ name: str('Nom'), role: str('Responsabilité') }, ['name', 'role'])) }, ['team', 'members']),
    summary: (a, s) => `Ajouter à l’équipe « ${teamNamed(s, a.team).name} » :\n${bullet((a.members as Json[] ?? []).map((m) => `${m.name} — ${m.role}`))}`,
    run: (a, s) => {
      const team = teamNamed(s, a.team);
      const add = (a.members as Json[] ?? []).filter((m) => text(m.name)).map((m) => ({ id: uid(), name: text(m.name), role: text(m.role) }));
      s.updateTeam(team.id, (t) => ({ ...t, members: [...t.members, ...add] }));
    },
  },
  supprimer_equipe: {
    description: 'Supprime une équipe et ses membres, désignée par son nom exact.',
    parameters: obj({ team: str('Nom exact de l’équipe') }, ['team']),
    summary: (a, s) => { const t = teamNamed(s, a.team); return `Supprimer l’équipe « ${t.name} » et ses ${many(t.members.length, 'membre', 'membres')}.`; },
    run: (a, s) => s.removeTeam(teamNamed(s, a.team).id),
  },

  retirer_membres: {
    description: 'Retire des membres d’une équipe, désignés par leur nom exact.',
    parameters: obj({ team: str('Nom exact de l’équipe'), members: list({ type: 'string' }, 'Noms exacts des membres à retirer') }, ['team', 'members']),
    summary: (a, s) => {
      const team = teamNamed(s, a.team);
      const found = (a.members ?? []).map((n: unknown) => findOne(team.members, (m) => m.name, n, 'Membre'));
      return `Retirer de l’équipe « ${team.name} » :\n${bullet(found.map((m: { name: string; role: string }) => `${m.name} — ${m.role || 'sans rôle'}`), 20)}`;
    },
    run: (a, s) => {
      const team = teamNamed(s, a.team);
      const ids = new Set((a.members ?? []).map((n: unknown) => findOne(team.members, (m) => m.name, n, 'Membre').id));
      s.updateTeam(team.id, (t) => ({ ...t, members: t.members.filter((m) => !ids.has(m.id)) }));
    },
  },

  // —— Programme ——
  ajouter_sessions: {
    description: 'Ajoute des sessions au programme (heure, thématique, modérateur, intervenants).',
    parameters: obj({ items: list(obj({
      date: date(), start: str('Début HH:MM'), end: str('Fin HH:MM (facultative)'), theme: str('Thématique'), moderator: str('Modérateur (vide = à désigner)'),
      speakers: { type: 'array', items: obj({ name: str('Nom'), title: str('Fonction ou organisation'), status: oneOf(SPEAKER_STATUSES) }, ['name']) },
    }, ['date', 'start', 'theme'])) }, ['items']),
    summary: (a) => `Ajouter ${many(items(a).length, 'session', 'sessions')} au programme :\n${bullet(items(a).map((p) => `${day(p.date as string)} ${p.start}${p.end ? `–${p.end}` : ''} · ${p.theme}${(p.speakers as unknown[] | undefined)?.length ? ` (${(p.speakers as unknown[]).length} intervenant(s))` : ''}`))}`,
    run: (a, s) => {
      const l = items(a);
      const hhmm = (v: unknown) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : '';
      need(l.length && l.every((p) => isDate(p.date) && hhmm(p.start) && text(p.theme)), 'Chaque session doit avoir une date, une heure de début (HH:MM) et une thématique.');
      const add = l.map((p) => ({ id: uid(), date: p.date as string, start: hhmm(p.start), end: hhmm(p.end), theme: text(p.theme), moderator: text(p.moderator),
        speakers: (Array.isArray(p.speakers) ? p.speakers as Json[] : []).filter((x) => text(x.name)).map((x) => ({ id: uid(), name: text(x.name), title: text(x.title), status: pick(x.status, SPEAKER_STATUSES, 'En cours') })) }));
      s.updateProgramme((list) => [...list, ...add]);
    },
  },
  modifier_session: {
    description: 'Modifie une session du programme, désignée par sa thématique exacte (et son jour si deux sessions ont la même) : horaire, jour, thématique, modérateur, '
      + 'et ses intervenants (en ajouter, en retirer, changer leur statut — par exemple remplacer un intervenant empêché). Seuls les champs fournis changent.',
    parameters: obj({
      theme: str('Thématique exacte de la session'), date: date('Jour actuel de la session, AAAA-MM-JJ (facultatif, pour départager)'),
      nouvelle_thematique: str('Nouvelle thématique'), nouveau_jour: date('Nouveau jour AAAA-MM-JJ'), start: str('Nouvelle heure de début HH:MM'), end: str('Nouvelle heure de fin HH:MM'),
      moderator: str('Nouveau modérateur'),
      ajouter_intervenants: { type: 'array', items: obj({ name: str('Nom'), title: str('Fonction ou organisation'), status: oneOf(SPEAKER_STATUSES) }, ['name']) },
      retirer_intervenants: { type: 'array', items: { type: 'string' }, description: 'Noms exacts des intervenants à retirer de la session' },
      statuts_intervenants: { type: 'array', items: obj({ name: str('Nom exact de l’intervenant'), status: oneOf(SPEAKER_STATUSES) }, ['name', 'status']) },
    }, ['theme']),
    summary: (a, s) => {
      const p = sessionNamed(s, a.theme, a.date);
      const sp = (n: unknown) => speakerIn(p, n).name;
      const ch = [
        a.nouvelle_thematique && `thématique → « ${text(a.nouvelle_thematique)} »`,
        isDate(a.nouveau_jour) && `jour → ${day(a.nouveau_jour)}`,
        (a.start || a.end) && `horaire → ${a.start || p.start}${(a.end || p.end) ? `–${a.end || p.end}` : ''}`,
        a.moderator !== undefined && `modérateur → ${text(a.moderator) || 'à désigner'}`,
        ...((a.retirer_intervenants ?? []) as unknown[]).map((n) => `retirer ${sp(n)}`),
        ...((a.ajouter_intervenants ?? []) as Json[]).map((x) => `ajouter ${text(x.name)}${text(x.title) ? ` (${text(x.title)})` : ''} — ${pick(x.status, SPEAKER_STATUSES, 'En cours')}`),
        ...((a.statuts_intervenants ?? []) as Json[]).map((x) => `${sp(x.name)} → ${pick(x.status, SPEAKER_STATUSES, 'En cours')}`),
      ].filter(Boolean) as string[];
      need(ch.length, 'Aucune modification indiquée pour cette session.');
      return `Modifier la session « ${p.theme} » (${day(p.date)} à ${p.start}) :\n${bullet(ch)}`;
    },
    run: (a, s) => {
      const p = sessionNamed(s, a.theme, a.date);
      const hhmm = (v: unknown) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : '';
      if (a.start) need(hhmm(a.start), 'Heure de début invalide (HH:MM).');
      if (a.end) need(hhmm(a.end), 'Heure de fin invalide (HH:MM).');
      const remove = new Set(((a.retirer_intervenants ?? []) as unknown[]).map((n) => speakerIn(p, n).id));
      const status = new Map(((a.statuts_intervenants ?? []) as Json[]).map((x) => [speakerIn(p, x.name).id, pick(x.status, SPEAKER_STATUSES, 'En cours')]));
      const added = ((a.ajouter_intervenants ?? []) as Json[]).filter((x) => text(x.name)).map((x) => ({ id: uid(), name: text(x.name), title: text(x.title), status: pick(x.status, SPEAKER_STATUSES, 'En cours') }));
      s.updateProgramme((list) => list.map((x) => x.id !== p.id ? x : {
        ...x,
        ...(text(a.nouvelle_thematique) ? { theme: text(a.nouvelle_thematique) } : {}),
        ...(isDate(a.nouveau_jour) ? { date: a.nouveau_jour as string } : {}),
        ...(hhmm(a.start) ? { start: hhmm(a.start) } : {}),
        ...(hhmm(a.end) ? { end: hhmm(a.end) } : {}),
        ...(a.moderator !== undefined ? { moderator: text(a.moderator) } : {}),
        speakers: [...x.speakers.filter((y) => !remove.has(y.id)).map((y) => status.has(y.id) ? { ...y, status: status.get(y.id)! } : y), ...added],
      }));
    },
  },
  supprimer_session: {
    description: 'Supprime une session du programme, désignée par sa thématique exacte (et son jour si deux sessions ont la même).',
    parameters: obj({ theme: str('Thématique exacte'), date: date('Jour de la session, AAAA-MM-JJ (facultatif)') }, ['theme']),
    summary: (a, s) => { const p = sessionNamed(s, a.theme, a.date); return `Supprimer la session « ${p.theme} » du ${day(p.date)} à ${p.start}.`; },
    run: (a, s) => { const id = sessionNamed(s, a.theme, a.date).id; s.updateProgramme((list) => list.filter((p) => p.id !== id)); },
  },

  // —— Accréditations ——
  ajouter_badges: {
    description: 'Crée des badges d’accréditation (numéros et QR codes attribués automatiquement).',
    parameters: obj({ items: list(obj({ name: str('Nom complet'), category: oneOf(BADGE_CATEGORIES), org: str('Fonction ou organisation') }, ['name', 'category'])) }, ['items']),
    summary: (a) => `Créer ${many(items(a).length, 'badge', 'badges')} :\n${bullet(items(a).map((b) => `${b.name} — ${b.category}${b.org ? `, ${b.org}` : ''}`))}`,
    run: (a, s) => {
      const l = items(a);
      need(l.length && l.every((b) => text(b.name)), 'Chaque badge doit avoir un nom.');
      let n = nextNumber(s.data.badges);
      s.addBadges(l.map((b) => ({ id: uid(), number: n++, token: newToken(), name: text(b.name), category: pick(b.category, BADGE_CATEGORIES, 'Participant') as BadgeCategory, org: text(b.org) })));
    },
  },
  supprimer_badges: {
    description: 'Supprime des badges, désignés par le nom exact de la personne (tel qu’il apparaît sur le badge).',
    parameters: obj({ names: list({ type: 'string' }, 'Noms des personnes dont le badge est à supprimer') }, ['names']),
    summary: (a, s) => {
      const found = badgesByName(s, a.names ?? []);
      return `Supprimer ${many(found.length, 'badge', 'badges')} :\n${bullet(found.map((b) => `${b.name} — ${b.category}${b.org ? `, ${b.org}` : ''} (n° ${b.number})`), 20)}`;
    },
    run: (a, s) => { for (const b of badgesByName(s, a.names ?? [])) s.removeBadge(b.id); },
  },
  // —— Women in MiningTech & Academy ——
  ajouter_participantes: {
    description: 'Inscrit des participantes à un programme Women in MiningTech ou Academy.',
    parameters: obj({ items: list(obj({ name: str('Nom'), organisation: str('Organisation'), email: str('E-mail'), program: str('Nom exact du programme (wmt.programs)'), status: oneOf(participantStages) }, ['name', 'program'])) }, ['items']),
    summary: (a, s) => `Inscrire ${many(items(a).length, 'participante', 'participantes')} :\n${bullet(items(a).map((p) => `${p.name}${p.organisation ? ` (${p.organisation})` : ''} → ${findOne(s.data.wmt.programs, (x) => x.name, p.program, 'Programme').name}`))}`,
    run: (a, s) => {
      const l = items(a);
      need(l.length && l.every((p) => text(p.name)), 'Chaque participante doit avoir un nom.');
      const add = l.map((p) => ({ id: uid(), name: text(p.name), organisation: text(p.organisation), email: text(p.email), programId: findOne(s.data.wmt.programs, (x) => x.name, p.program, 'Programme').id, status: pick(p.status, participantStages, 'Candidature') }));
      s.updateWmt((w) => ({ ...w, participants: [...w.participants, ...add] }));
    },
  },
  supprimer_participantes: {
    description: 'Supprime des participantes inscrites aux programmes Women in MiningTech ou Academy, désignées par leur nom exact.',
    parameters: obj({ names: list({ type: 'string' }, 'Noms exacts des participantes') }, ['names']),
    summary: (a, s) => {
      const found = (a.names ?? []).map((n: unknown) => findOne(s.data.wmt.participants, (p) => p.name, n, 'Participante', 'la page Women in MiningTech'));
      return `Supprimer ${many(found.length, 'participante', 'participantes')} :\n${bullet(found.map((p: { name: string; programId: string }) => `${p.name} — ${s.data.wmt.programs.find((x) => x.id === p.programId)?.name ?? 'sans programme'}`), 20)}`;
    },
    run: (a, s) => {
      const ids = new Set((a.names ?? []).map((n: unknown) => findOne(s.data.wmt.participants, (p) => p.name, n, 'Participante', 'la page Women in MiningTech').id));
      s.updateWmt((w) => ({ ...w, participants: w.participants.filter((p) => !ids.has(p.id)) }));
    },
  },
  supprimer_programmes_wmt: {
    description: 'Supprime des programmes Women in MiningTech ou Academy (avec leurs participantes et leurs sessions), désignés par leur nom exact.',
    parameters: obj({ names: list({ type: 'string' }, 'Noms exacts des programmes (wmt.programs)') }, ['names']),
    summary: (a, s) => {
      const found = (a.names ?? []).map((n: unknown) => findOne(s.data.wmt.programs, (p) => p.name, n, 'Programme', 'la page Women in MiningTech'));
      return `Supprimer ${many(found.length, 'programme', 'programmes')} :\n${bullet(found.map((p: { id: string; name: string }) => `${p.name} — avec ${many(s.data.wmt.participants.filter((x) => x.programId === p.id).length, 'participante', 'participantes')} et ${many(s.data.wmt.sessions.filter((x) => x.programId === p.id).length, 'session', 'sessions')}`), 20)}`;
    },
    run: (a, s) => {
      const ids = new Set((a.names ?? []).map((n: unknown) => findOne(s.data.wmt.programs, (p) => p.name, n, 'Programme', 'la page Women in MiningTech').id));
      s.updateWmt((w) => ({ programs: w.programs.filter((p) => !ids.has(p.id)), participants: w.participants.filter((p) => !ids.has(p.programId)), sessions: w.sessions.filter((p) => !ids.has(p.programId)) }));
    },
  },
  supprimer_sessions_wmt: {
    description: 'Supprime des sessions (ateliers, cours) des programmes Women in MiningTech ou Academy, désignées par leur titre exact.',
    parameters: obj({ titles: list({ type: 'string' }, 'Titres exacts des sessions (wmt.sessions)') }, ['titles']),
    summary: (a, s) => {
      const found = (a.titles ?? []).map((n: unknown) => findOne(s.data.wmt.sessions, (p) => p.title, n, 'Session', 'la page Women in MiningTech'));
      return `Supprimer ${many(found.length, 'session', 'sessions')} :\n${bullet(found.map((p: { title: string; date: string; time: string }) => `${p.title} — ${day(p.date)}${p.time ? ` à ${p.time}` : ''}`), 20)}`;
    },
    run: (a, s) => {
      const ids = new Set((a.titles ?? []).map((n: unknown) => findOne(s.data.wmt.sessions, (p) => p.title, n, 'Session', 'la page Women in MiningTech').id));
      s.updateWmt((w) => ({ ...w, sessions: w.sessions.filter((p) => !ids.has(p.id)) }));
    },
  },

  // —— Habillage des badges et évaluation ——
  retirer_habillage_badges: {
    description: 'Retire l’habillage personnalisé des badges (image de fond, logo) : les badges reprennent le modèle standard CODES Africa.',
    parameters: obj({ confirm: { type: 'boolean', description: 'Toujours vrai' } }),
    summary: () => 'Retirer l’habillage personnalisé des badges (fond et logo) : retour au badge standard CODES Africa.',
    run: (_a, s) => s.setBadgeTheme({}),
  },
  effacer_evaluation: {
    description: 'Efface l’évaluation de l’événement actif (bilan général, participants réels, satisfaction et toutes les fiches d’évaluation).',
    parameters: obj({ confirm: { type: 'boolean', description: 'Toujours vrai' } }),
    summary: (_a, s) => `Effacer toute l’évaluation de « ${s.current.name} » (bilan général et ${many(Object.keys(s.data.evaluation.entries).length, 'fiche', 'fiches')}).`,
    run: (_a, s) => s.updateEvaluation(() => emptyEvaluation()),
  },
};

/** Outils envoyés au modèle (format commun : nom, description, schéma JSON des paramètres). */
export const TOOLS = [
  ...Object.entries(ACTIONS).map(([name, d]) => ({ name, description: d.description, parameters: d.parameters })),
  {
    name: 'generer_bilan',
    description: 'Génère le fichier du bilan de l’événement actif (chiffres clés, budget, bilan général, évaluation des équipes, intervenants, prestataires et partenaires) et le met à télécharger directement dans le chat. Ne modifie rien : aucune autorisation n’est demandée. À utiliser dès qu’on demande le bilan, le rapport ou le compte rendu de l’événement en PDF, Word ou Excel. Sans format précisé, laisse « formats » vide : la personne choisira.',
    parameters: { type: 'object', properties: { formats: { type: 'array', items: { type: 'string', enum: ['pdf', 'word', 'excel'] }, description: 'Formats demandés (un ou plusieurs).' } } },
  },
];
/** Outils qui produisent un fichier dans le chat (rien n'est modifié, donc pas de carte d'autorisation). */
export const FILE_TOOLS = new Set(['generer_bilan']);

export const summarize = (a: ProposedAction, s: EventsStateForSonia) => {
  const def = ACTIONS[a.name];
  if (!def) return `Action inconnue : ${a.name}`;
  try { return def.summary(a.args, s); } catch (e) { return `${def.description}\n⚠ ${e instanceof Error ? e.message : 'Action incomplète.'}`; }
};

/** Applique une action autorisée. Renvoie un message d'erreur, ou rien si tout s'est bien passé. */
export const execute = (a: ProposedAction, s: EventsStateForSonia): string | undefined => {
  const def = ACTIONS[a.name];
  if (!def) return 'Action inconnue.';
  try { def.run(a.args ?? {}, s); return undefined; } catch (e) { return e instanceof Error ? e.message : 'Action impossible.'; }
};

/** Données envoyées à Sonia : sans images (photos, fonds de badge), trop lourdes et inutiles pour elle. */
export const contextFor = (s: EventsStateForSonia) => contextWith(s, syntheseFor(s));
const contextWith = (s: EventsStateForSonia, synthese: ReturnType<typeof syntheseFor>) => ({
  aujourdhui: synthese.aujourdhui,
  /** Chiffres déjà calculés (retards, restes, totaux…) : la source à privilégier pour répondre. */
  synthese,
  evenement_actif: s.current,
  evenements: s.events.map(({ id, name, start, end, place }) => ({ id, name, start, end, place })),
  donnees: { ...s.data, badges: s.data.badges.map(({ photo: _p, token: _t, ...b }) => b), badgeTheme: undefined },
});
