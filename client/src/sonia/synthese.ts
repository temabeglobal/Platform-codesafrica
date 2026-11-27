/* Synthèse calculée des données de l'événement actif, envoyée à Sonia avec les données brutes.
   Les chiffres (jours restants, retards, restes de budget, totaux encaissés…) sont calculés ici,
   exactement comme les pages de la plateforme les affichent : Sonia n'a plus à les recalculer, donc à se tromper. */

import type { EventsState } from '../events';
import type { EventData } from '../demo';

const DAY = 864e5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const between = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const usd = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} $`;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (f(x) || 0), 0);

export function syntheseFor(s: Pick<EventsState, 'current' | 'events'> & { data: EventData }, now = new Date()) {
  const today = iso(now);
  const ev = s.current;
  const d = s.data;
  // « dependsOn » contient l'intitulé de la tâche dont elle dépend (ou, pour d'anciennes données, son identifiant).
  const taskById = new Map([...d.tasks.map((t) => [t.id, t] as const), ...d.tasks.map((t) => [t.title, t] as const)]);
  const open = d.tasks.filter((t) => t.status !== 'Terminée');
  const tache = (t: EventData['tasks'][number]) => {
    const dep = t.dependsOn ? taskById.get(t.dependsOn) : undefined;
    const delta = between(today, t.due);
    return {
      intitule: t.title, responsable: t.owner, echeance: t.due, statut: t.status, avancement: `${t.progress} %`,
      ...(t.status === 'Terminée' ? {} : delta < 0 ? { retard_jours: -delta } : { dans_jours: delta }),
      ...(dep ? { depend_de: `${dep.title} (${dep.status}, ${dep.progress} %, échéance ${dep.due})`, bloquee: dep.status !== 'Terminée' } : {}),
      ...(dep && dep.due > t.due ? { incoherence: `échéance avant celle de la tâche dont elle dépend (${dep.due})` } : {}),
      sous_taches: `${sum(t.phases, (p) => p.subtasks.filter((x) => x.done).length) + (t.loose ?? []).filter((x) => x.done).length}/${sum(t.phases, (p) => p.subtasks.length) + (t.loose ?? []).length} faites`,
    };
  };

  const postes = d.budget.map((b) => {
    const avances = (b.expenses ?? []).filter((e) => e.payment === 'Avance');
    return {
      poste: b.label, prevu: usd(b.planned), depense: usd(b.spent), reste: usd(b.planned - b.spent),
      utilise: b.planned ? `${Math.round((b.spent / b.planned) * 100)} %` : '—',
      ...(b.spent > b.planned ? { depassement: usd(b.spent - b.planned) } : {}),
      ...(avances.length ? { avances_non_soldees: avances.map((e) => `${e.label} ${usd(e.amount)}`) } : {}),
    };
  });
  const prevu = sum(d.budget, (b) => b.planned), depense = sum(d.budget, (b) => b.spent);
  const avances = d.budget.flatMap((b) => (b.expenses ?? []).filter((e) => e.payment === 'Avance').map((e) => ({ ...e, poste: b.label })));

  const sponsor = (l: EventData['sponsors'][number]) => `${l.name} — ${l.stage}${l.billing ? `, ${l.billing}` : ''}${l.budget ? `, ${usd(l.budget)}` : ''}, contact ${l.contact || 'à identifier'}${l.note ? ` (${l.note})` : ''}`;
  const paid = d.sponsors.filter((l) => l.billing === 'Paiement reçu');
  const confirmedUnpaid = d.sponsors.filter((l) => l.stage === 'Confirmé' && l.billing !== 'Paiement reçu');
  const pipeline = d.sponsors.filter((l) => l.stage !== 'Confirmé');

  const docs = (p: EventData['providers'][number]) => p.docs.map((x) => `${x.kind} ${x.ref ? `${x.ref} ` : ''}du ${x.date} : ${usd(x.amount)}, ${x.status}`);
  const aPayer = d.providers.flatMap((p) => p.docs.filter((x) => x.kind === 'Facture' && x.status !== 'Payée').map((x) => `${p.name} : ${usd(x.amount)} (${x.status})`));

  const interventions = d.programme.flatMap((p) => p.speakers);
  const byStatus = (st: string) => interventions.filter((x) => x.status === st);
  const jours = [...new Set(d.programme.map((p) => p.date))].sort();

  // « M. Kalonji (exemple) » et « M. Kalonji » désignent la même personne.
  const key = (n: string) => n.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const badged = new Set(d.badges.map((b) => key(b.name)));
  const sansBadge = (names: string[]) => {
    const seen = new Set<string>();
    return names.filter((n) => n?.trim() && !badged.has(key(n)) && !seen.has(key(n)) && seen.add(key(n)));
  };

  const wmt = d.wmt;
  const late = open.filter((t) => t.due < today);
  const a_relancer = [
    ...confirmedUnpaid.map((l) => `Sponsor ${l.name} : confirmé, ${l.billing ?? 'pas encore facturé'}, ${usd(l.budget ?? 0)} à encaisser (contact ${l.contact || 'à identifier'})`),
    ...pipeline.sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0)).map((l) => `Sponsor ${l.name} : ${l.stage}, ${usd(l.budget ?? 0)} envisagés (contact ${l.contact || 'à identifier'})`),
    ...d.providers.filter((p) => p.status !== 'Confirmé' && p.status !== 'Payé').map((p) => `Prestataire ${p.name} (${p.category}) : ${p.status}${p.docs.find((x) => x.status === 'En attente') ? `, devis ${usd(p.docs.find((x) => x.status === 'En attente')!.amount)} en attente de réponse` : ''} (${p.phone})`),
    ...d.partners.filter((l) => l.stage === 'Contacté' || l.stage === 'En cours').map((l) => `Partenaire ${l.name} : ${l.stage} (contact ${l.contact || 'à identifier'})`),
    ...aPayer.map((x) => `Facture à régler : ${x}`),
  ];
  const alertes = [
    ...(late.length ? [`${late.length} tâche(s) en retard`] : []),
    ...late.flatMap((t) => {
      const dep = t.dependsOn ? taskById.get(t.dependsOn) : undefined; // dépendance supprimée : ignorée
      return dep && dep.status !== 'Terminée' ? [`« ${t.title} » est bloquée par « ${dep.title} » (${dep.status}, échéance ${dep.due})`] : [];
    }),
    ...d.programme.flatMap((p) => p.speakers.filter((x) => x.status === 'Empêché').map((x) => `${x.name} est empêché(e) : session « ${p.theme} » à compléter`)),
    ...d.budget.filter((b) => b.spent > b.planned).map((b) => `Poste ${b.label} dépassé de ${usd(b.spent - b.planned)}`),
    ...d.communication.filter((c) => c.date === today).map((c) => `Aujourd'hui en communication : ${c.subject} (${c.channel})`),
  ];
  return {
    aujourdhui: today,
    evenement: {
      nom: ev.name, lieu: ev.place, du: ev.start, au: ev.end,
      ...(ev.start >= today ? { jours_restants: between(today, ev.start) } : ev.end >= today ? { en_cours: true } : { termine_depuis_jours: between(ev.end, today) }),
      ...(ev.budget ? { enveloppe_globale_declaree: `${usd(Number(ev.budget))} (montant saisi dans la fiche de l'événement ; ce n'est PAS le budget des postes)` } : {}),
    },
    alertes,
    a_relancer_par_ordre_d_importance: a_relancer,
    taches: {
      total: d.tasks.length, terminees: d.tasks.length - open.length,
      en_retard: open.filter((t) => t.due < today).sort((a, b) => a.due.localeCompare(b.due)).map(tache),
      a_venir: open.filter((t) => t.due >= today).sort((a, b) => a.due.localeCompare(b.due)).map(tache),
      terminees_liste: d.tasks.filter((t) => t.status === 'Terminée').map((t) => t.title),
    },
    budget: {
      regle: 'Quand on parle du budget, utilise ces postes (prévu/dépensé/reste), jamais l’enveloppe globale déclarée.',
      total_prevu: usd(prevu), total_depense: usd(depense), reste: usd(prevu - depense), utilise: prevu ? `${Math.round((depense / prevu) * 100)} %` : '—',
      postes, avances_non_soldees_total: usd(sum(avances, (e) => e.amount)),
      avances_detail: avances.map((e) => `${e.label} : ${usd(e.amount)} (${e.poste})`),
      factures_prestataires_a_payer: aPayer,
    },
    sponsors: {
      encaisse: usd(sum(paid, (l) => l.budget ?? 0)), paiement_recu: paid.map(sponsor),
      confirmes_non_payes: confirmedUnpaid.map(sponsor), montant_confirme_non_paye: usd(sum(confirmedUnpaid, (l) => l.budget ?? 0)),
      en_discussion: pipeline.map(sponsor), montant_en_discussion: usd(sum(pipeline, (l) => l.budget ?? 0)),
    },
    exposants: {
      regle: 'Un exposant = un sponsor dont le paiement est reçu (page Exposants).',
      liste: paid.map((l) => `${l.name} — stand ${l.stand ?? 'à définir'}, contact ${l.contact || 'à identifier'}`),
      en_attente_de_paiement: confirmedUnpaid.map((l) => l.name),
    },
    partenaires: Object.fromEntries(['Confirmé', 'En cours', 'Contacté', 'Prospect'].map((st) => [st, d.partners.filter((l) => l.stage === st).map((l) => `${l.name} (contact ${l.contact || 'à identifier'}${l.note ? `, ${l.note}` : ''})`)])),
    prestataires: d.providers.map((p) => ({ nom: p.name, categorie: p.category, statut: p.status, telephone: p.phone, email: p.email, pieces: p.docs.length ? docs(p) : 'aucune pièce' })),
    programme: {
      jours: jours.map((j) => ({ jour: j, sessions: d.programme.filter((p) => p.date === j).sort((a, b) => a.start.localeCompare(b.start)).map((p) => `${p.start}–${p.end} ${p.theme} | modérateur : ${p.moderator || 'AUCUN'} | intervenants : ${p.speakers.map((x) => `${x.name} (${x.status})`).join(', ') || 'aucun'}`) })),
      interventions: interventions.length, confirmees: byStatus('Confirmé').length, en_cours: byStatus('En cours').length,
      empeches: byStatus('Empêché').map((x) => `${x.name} (${x.title}) — ${d.programme.find((p) => p.speakers.includes(x))?.theme}`),
      sessions_sans_moderateur: d.programme.filter((p) => !p.moderator?.trim()).map((p) => `${p.theme} (${p.date} ${p.start})`),
    },
    communication: {
      passees: d.communication.filter((c) => c.date < today).length,
      aujourdhui: d.communication.filter((c) => c.date === today).map((c) => `${c.channel} : ${c.subject}`),
      a_venir: d.communication.filter((c) => c.date > today).sort((a, b) => a.date.localeCompare(b.date)).map((c) => `${c.date} (dans ${between(today, c.date)} j) ${c.channel} : ${c.subject}`),
    },
    equipes: d.teams.map((t) => ({ equipe: t.name, responsable: t.lead, membres: t.members.map((m) => `${m.name} — ${m.role}`) })),
    badges: {
      total: d.badges.length,
      par_categorie: Object.fromEntries([...new Set(d.badges.map((b) => b.category))].map((c) => [c, d.badges.filter((b) => b.category === c).map((b) => b.name)])),
      sans_badge_equipe: sansBadge(d.teams.flatMap((t) => [t.lead, ...t.members.map((m) => m.name)])),
      sans_badge_intervenants_moderateurs: sansBadge([...interventions.map((x) => x.name), ...d.programme.map((p) => p.moderator)]),
    },
    women_in_miningtech: wmt.programs.map((p) => {
      const ps = wmt.participants.filter((x) => x.programId === p.id);
      const inSeat = ps.filter((x) => ['Retenue', 'En formation', 'Certifiée'].includes(x.status));
      return {
        programme: p.name, places: p.capacity, du: p.start, au: p.end, places_prises: inSeat.length, places_libres: p.capacity - inSeat.length,
        par_etape: Object.fromEntries([...new Set(ps.map((x) => x.status))].map((st) => [st, ps.filter((x) => x.status === st).map((x) => x.name)])),
      };
    }),
    sessions_wmt_a_venir: wmt.sessions.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date)).map((x) => `${x.date} ${x.time} ${x.title} (${x.speaker}, ${x.place})`),
    autres_evenements: s.events.filter((e) => e.id !== ev.id).map((e) => `${e.name} (${e.start} → ${e.end}, ${e.place}) — données non chargées : demander de passer sur cet événement`),
  };
}
