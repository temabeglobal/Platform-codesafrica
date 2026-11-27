/* Évaluation après l'événement : bilan général et performance des équipes, intervenants, prestataires et partenaires.
   Les notes vont de 1 à 5 par critère ; la note d'une fiche est la moyenne de ses critères.
   Enregistré sur l'appareil avec le reste des données de l'événement. */

import type { EventData } from './demo';

export type EvalKind = 'equipe' | 'intervenant' | 'prestataire' | 'partenaire';

export interface EvalKindDef { id: EvalKind; label: string; one: string; criteria: string[] }

export const EVAL_KINDS: EvalKindDef[] = [
  { id: 'equipe', label: 'Équipes', one: 'équipe', criteria: ['Organisation', 'Réactivité', 'Qualité du travail', 'Respect des délais'] },
  { id: 'intervenant', label: 'Intervenants', one: 'intervenant', criteria: ['Qualité du contenu', 'Ponctualité', 'Interaction avec le public'] },
  { id: 'prestataire', label: 'Prestataires', one: 'prestataire', criteria: ['Qualité de la prestation', 'Respect des délais', 'Rapport qualité-prix', 'Communication'] },
  { id: 'partenaire', label: 'Partenaires & sponsors', one: 'partenaire', criteria: ['Engagement', 'Respect des engagements', 'Visibilité obtenue'] },
];
export const kindDef = (k: EvalKind) => EVAL_KINDS.find((d) => d.id === k)!;

/** À refaire lors de la prochaine édition ? */
export const AGAIN = ['Oui', 'Avec réserves', 'Non'] as const;
export type Again = (typeof AGAIN)[number];

export interface EvalEntry {
  /** Note de 1 à 5 par critère (critère absent = pas noté). */
  scores: Record<string, number>;
  again?: Again;
  comment: string;
  updatedAt?: string;
}

export interface Evaluation {
  /** Nombre réel de participants (vide = pas encore saisi). */
  attendance?: number;
  /** Satisfaction générale, de 1 à 5. */
  satisfaction?: number;
  strengths: string;
  improvements: string;
  recommendations: string;
  /** Fiches d'évaluation, rangées par `type:identifiant`. */
  entries: Record<string, EvalEntry>;
}

export const emptyEvaluation = (): Evaluation => ({ strengths: '', improvements: '', recommendations: '', entries: {} });

/** Ce qu'on évalue : une équipe, un intervenant, un prestataire… */
export interface Subject { key: string; kind: EvalKind; name: string; detail: string }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Tout ce qui peut être évalué pour l'événement, tiré des autres modules. */
export function subjectsOf(d: EventData): Subject[] {
  const out: Subject[] = [];
  for (const t of d.teams) {
    const n = t.members.length + (t.lead ? 1 : 0);
    out.push({ key: `equipe:${t.id}`, kind: 'equipe', name: t.name, detail: [t.lead && `Responsable : ${t.lead}`, `${n} personne${n > 1 ? 's' : ''}`].filter(Boolean).join(' · ') });
  }
  // Intervenants et modérateurs du programme : une seule fiche par personne, même si elle intervient dans plusieurs sessions.
  const people = new Map<string, { name: string; roles: Set<string>; title: string; sessions: number }>();
  const addPerson = (name: string, role: string, title = '') => {
    if (!name.trim()) return;
    const k = fold(name);
    const p = people.get(k) ?? { name: name.trim(), roles: new Set<string>(), title: '', sessions: 0 };
    p.roles.add(role); p.sessions++; if (!p.title && title) p.title = title;
    people.set(k, p);
  };
  for (const s of d.programme) {
    if (s.moderator) addPerson(s.moderator, 'Modérateur');
    for (const sp of s.speakers) if (sp.status !== 'Empêché') addPerson(sp.name, 'Intervenant', sp.title);
  }
  for (const [k, p] of people) {
    out.push({ key: `intervenant:${k}`, kind: 'intervenant', name: p.name,
      detail: [[...p.roles].join(' et '), p.title, `${p.sessions} session${p.sessions > 1 ? 's' : ''}`].filter(Boolean).join(' · ') });
  }
  // Prestataires retenus (confirmés ou payés) ; s'il n'y en a aucun, on propose tous ceux de la liste.
  const kept = d.providers.filter((p) => p.status === 'Confirmé' || p.status === 'Payé');
  for (const p of kept.length ? kept : d.providers) out.push({ key: `prestataire:${p.id}`, kind: 'prestataire', name: p.name, detail: `${p.category} · ${p.status}` });
  for (const [list, label] of [[d.partners, 'Partenaire'], [d.sponsors, 'Sponsor']] as const) {
    for (const l of list.filter((x) => x.stage === 'Confirmé')) {
      out.push({ key: `partenaire:${label}:${fold(l.name)}`, kind: 'partenaire', name: l.name,
        detail: [label, l.budget ? `${l.budget.toLocaleString('fr-FR')} $` : '', l.billing ?? ''].filter(Boolean).join(' · ') });
    }
  }
  return out;
}

/** Note d'une fiche : moyenne de ses critères notés (undefined = rien de noté). */
export function scoreOf(e?: EvalEntry): number | undefined {
  const v = Object.values(e?.scores ?? {}).filter((n) => n >= 1);
  return v.length ? v.reduce((a, n) => a + n, 0) / v.length : undefined;
}

/** Moyenne des notes d'une liste de fiches. */
export function averageOf(entries: (EvalEntry | undefined)[]): number | undefined {
  const v = entries.map(scoreOf).filter((n): n is number => n !== undefined);
  return v.length ? v.reduce((a, n) => a + n, 0) / v.length : undefined;
}

export const fmtScore = (n?: number) => (n === undefined ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** Appréciation en mots, pour le rapport. */
export const verdict = (n?: number) => n === undefined ? 'Non évalué' : n >= 4.5 ? 'Excellent' : n >= 3.5 ? 'Bon' : n >= 2.5 ? 'Moyen' : n >= 1.5 ? 'Insuffisant' : 'Très insuffisant';

export const scoreColor = (n?: number) => n === undefined ? '#7888a0' : n >= 3.5 ? '#00876f' : n >= 2.5 ? '#c2620a' : '#c0262d';

/** Les chiffres du bilan, calculés à partir des autres modules. */
export function statsOf(d: EventData, expected: number) {
  const planned = d.budget.reduce((a, b) => a + b.planned, 0);
  const spent = d.budget.reduce((a, b) => a + b.spent, 0);
  const done = d.tasks.filter((t) => t.status === 'Terminée').length;
  const speakers = d.programme.flatMap((s) => s.speakers);
  const sponsorsConfirmed = d.sponsors.filter((s) => s.stage === 'Confirmé');
  const sponsorsPaid = d.sponsors.filter((s) => s.billing === 'Paiement reçu');
  const ev = d.evaluation;
  return {
    expected,
    attendance: ev.attendance,
    attendanceRate: ev.attendance !== undefined && expected > 0 ? Math.round((ev.attendance / expected) * 100) : undefined,
    planned, spent, gap: spent - planned,
    budgetRate: planned > 0 ? Math.round((spent / planned) * 100) : undefined,
    tasks: d.tasks.length, tasksDone: done, tasksRate: d.tasks.length ? Math.round((done / d.tasks.length) * 100) : undefined,
    sessions: d.programme.length,
    speakers: speakers.length,
    speakersConfirmed: speakers.filter((s) => s.status === 'Confirmé').length,
    speakersAbsent: speakers.filter((s) => s.status === 'Empêché').length,
    sponsorsConfirmed: sponsorsConfirmed.length,
    sponsorsPaid: sponsorsPaid.length,
    sponsorAmount: sponsorsPaid.reduce((a, s) => a + (s.budget ?? 0), 0),
    partnersConfirmed: d.partners.filter((p) => p.stage === 'Confirmé').length,
    badges: d.badges.length,
    providers: d.providers.length,
    people: d.teams.reduce((a, t) => a + t.members.length + (t.lead ? 1 : 0), 0),
  };
}
export type EvalStats = ReturnType<typeof statsOf>;
