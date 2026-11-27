import { demoWmt, emptyWmt, type WmtData } from './wmt';
import { demoProgramme, type ProgrammeItem } from './programme';
import { buildDemoBadges, type Badge, type BadgeTheme } from './accreditation';
import { emptyEvaluation, type Evaluation } from './evaluation';
// Données d'EXEMPLE uniquement, pour le design. Remplacées par MongoDB ensuite.
export const pipelineStages = ['Prospect', 'Contacté', 'En cours', 'Confirmé'] as const;
/** Suivi des sponsors : on les contacte, on les relance, la discussion avance, puis ils confirment. */
export const sponsorStages = ['Contacté', 'Relancé', 'En cours', 'Confirmé'] as const;
export type Stage = (typeof pipelineStages)[number] | (typeof sponsorStages)[number];
export const stagesFor = (kind: 'partenaires' | 'sponsors'): readonly Stage[] => (kind === 'sponsors' ? sponsorStages : pipelineStages);
/** Facturation d'un sponsor (vide = pas encore facturé). */
export const billingStatuses = ['Facture élaborée', 'Facture envoyée', 'Paiement reçu'] as const;
export type Billing = (typeof billingStatuses)[number];
/** Taille du stand d'un exposant (sponsor dont le paiement est reçu). */
export const standSizes = ['9 m²', '18 m²'] as const;
export type StandSize = (typeof standSizes)[number];

export interface Lead {
  name: string; contact: string; stage: Stage; note?: string; billing?: Billing;
  /** Sponsors seulement : montant du sponsoring, en dollars. Totalement séparé du budget de l'événement. */
  budget?: number;
  /** Sponsors devenus exposants : taille du stand (vide = à définir). */
  stand?: StandSize;
}



export type TaskStatus = 'À faire' | 'En cours' | 'Terminée';
export interface Subtask { id: string; title: string; done: boolean }
export interface Phase { id: string; title: string; subtasks: Subtask[] }
export interface Task {
  id: string; title: string; owner: string; due: string; progress: number; dependsOn?: string; status: TaskStatus; phases: Phase[];
  /** Sous-tâches rangées dans aucune phase (comme les « Tâches sans phase » de Timly). */
  loose?: Subtask[];
}
/** Ce qu'on saisit pour créer une tâche (l'identifiant et les phases sont ajoutés automatiquement). */
export type NewTask = Omit<Task, 'id' | 'phases'>;

export const uid = () => Math.random().toString(36).slice(2, 10);

/** L'avancement n'est jamais saisi à la main : il vient des sous-tâches (et le statut avec lui).
    Sans sous-tâche, il suit le statut : 0 % à faire, 50 % en cours, 100 % terminée. */
/** Toutes les sous-tâches d'une tâche : celles des phases, puis celles sans phase. */
export const allSubtasks = (t: Task): Subtask[] => [...t.phases.flatMap((p) => p.subtasks), ...(t.loose ?? [])];

export const syncTask = (t: Task): Task => {
  const all = allSubtasks(t);
  if (!all.length) return { ...t, progress: t.status === 'Terminée' ? 100 : t.status === 'En cours' ? 50 : 0 };
  const progress = Math.round((all.filter((x) => x.done).length / all.length) * 100);
  const status: TaskStatus = progress === 100 ? 'Terminée' : progress > 0 ? 'En cours' : 'À faire';
  return { ...t, progress, status };
};


const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const today = () => startOfDay(new Date());
export const daysUntil = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - today().getTime()) / 86_400_000);
export const isLate = (t: Task) => t.status !== 'Terminée' && daysUntil(t.due) < 0;
export const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });


export const commChannels = ['Réseaux sociaux', 'E-mail', 'Site web', 'Presse', 'Radio / TV', 'Affichage'] as const;
export interface CommItem { date: string; channel: string; subject: string }
/** Membre d'une équipe et sa responsabilité. */
export interface TeamMember { id: string; name: string; role: string }
export interface Team { id: string; name: string; lead: string; members: TeamMember[] }
type RawTeam = { name: string; lead: string; members: Omit<TeamMember, 'id'>[] };
/** Dépense ajoutée à un poste de budget. */
/** Statut de paiement d'une dépense : payée en totalité, ou avance (acompte) versée. */
export const paymentStatuses = ['Payé', 'Avance'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export interface Expense { id: string; label: string; /** Prix total = quantité × prix unitaire. */ amount: number; qty?: number; unitPrice?: number; date: string; payment?: PaymentStatus; /** Date du paiement ou de l'avance. */ paidOn?: string }
/** Statut et date de paiement, avec des valeurs par défaut pour les anciennes dépenses. */
export const paymentOf = (e: Expense) => ({ status: e.payment ?? 'Payé', on: e.paidOn ?? e.date });
/** Quantité et prix unitaire (une dépense ancienne sans détail compte pour 1 × son montant). */
export const detailOf = (e: Expense) => ({ qty: e.qty ?? 1, unit: e.unitPrice ?? e.amount });
export interface BudgetLine { label: string; planned: number; spent: number; expenses?: Expense[] }
/** Suivi d'un prestataire, étape par étape. */
export const providerStages = ['À contacter', 'Contacté', 'Devis reçu', 'Confirmé', 'Payé'] as const;
export type ProviderStage = (typeof providerStages)[number];

/** Pièces du dossier d'un prestataire. `sens` : reçue du prestataire, ou émise par la plateforme vers lui. */
export const docKinds = ['Devis', 'Commande', 'Facture'] as const;
export type DocKind = (typeof docKinds)[number];
export type DocDirection = 'reçu' | 'émis';
export const docStatuses: Record<DocKind, string[]> = {
  Devis: ['En attente', 'Accepté', 'Refusé'],
  Commande: ['Envoyée', 'Confirmée', 'Livrée', 'Annulée'],
  Facture: ['À payer', 'Payée partiellement', 'Payée'],
};
/** Sens habituel : le devis vient du prestataire, la commande part de la plateforme, la facture vient du prestataire. */
export const defaultDirection: Record<DocKind, DocDirection> = { Devis: 'reçu', Commande: 'émis', Facture: 'reçu' };
export interface ProviderDoc { id: string; kind: DocKind; direction: DocDirection; ref: string; date: string; amount: number; status: string; fileName?: string;
  /** Clé du fichier dans le stockage en ligne (Neon), quand il a été envoyé. */
  fileKey?: string; note?: string }
export interface Provider { id: string; name: string; category: string; phone: string; email: string; status: ProviderStage; docs: ProviderDoc[] }
type RawProvider = Omit<Provider, 'id' | 'docs'> & { docs?: Omit<ProviderDoc, 'id'>[] };

/** Toutes les données qui appartiennent à UN événement.
    Chaque module lit uniquement les données de l'événement actif. */
export interface EventData {
  tasks: Task[];
  budget: BudgetLine[];
  partners: Lead[];
  sponsors: Lead[];
  providers: Provider[];
  communication: CommItem[];
  teams: Team[];
  /** Women in MiningTech & Academy. */
  wmt: WmtData;
  /** Programme : sessions avec heure, thématique et modérateur. */
  programme: ProgrammeItem[];
  /** Accréditations : badges du staff, des visiteurs, des médias, des intervenants… */
  badges: Badge[];
  /** Habillage des badges (image de fond, logo) ; vide = badge standard CODES Africa. */
  badgeTheme: BadgeTheme;
  /** Évaluation après l'événement : bilan et performance des équipes, intervenants, prestataires… */
  evaluation: Evaluation;
}

export const emptyEventData = (): EventData => ({ tasks: [], budget: [], partners: [], sponsors: [], providers: [], communication: [], teams: [], wmt: emptyWmt(), programme: [], badges: [], badgeTheme: {}, evaluation: emptyEvaluation() });

/** Données d'EXEMPLE par événement (clé = identifiant de l'événement). */
type RawBudgetLine = Omit<BudgetLine, 'expenses'> & { expenses?: Omit<Expense, 'id'>[] };
const rawDemo: Record<string, Omit<EventData, 'tasks' | 'communication' | 'teams' | 'providers' | 'budget' | 'wmt' | 'programme' | 'badges' | 'badgeTheme' | 'evaluation'> & { budget: RawBudgetLine[] } & { providers: RawProvider[] } & Partial<Pick<EventData, 'communication'>> & { teams?: RawTeam[] } & { tasks: (NewTask & { phases?: Phase[] })[] }> = {
  'ca-2027': {
    communication: [
      { date: '2026-11-04', channel: 'Réseaux sociaux', subject: 'Teaser vidéo de l’édition 2027' },
      { date: '2026-11-10', channel: 'Site web', subject: 'Mise en ligne de la page événement' },
      { date: '2026-11-13', channel: 'Site web', subject: 'Ouverture des inscriptions' },
      { date: '2026-11-13', channel: 'Réseaux sociaux', subject: 'Visuel : inscriptions ouvertes' },
      { date: '2026-11-18', channel: 'E-mail', subject: 'Lettre d’information partenaires' },
      { date: '2026-11-20', channel: 'Réseaux sociaux', subject: 'Annonce des dates' },
      { date: '2026-11-25', channel: 'Affichage', subject: 'Affiches dans les universités' },
      { date: '2026-11-27', channel: 'Radio / TV', subject: 'Interview radio de l’organisatrice' },
      { date: '2026-12-03', channel: 'Réseaux sociaux', subject: 'Portrait d’une intervenante' },
      { date: '2026-12-10', channel: 'E-mail', subject: 'Appel aux sponsors' },
      { date: '2027-01-15', channel: 'Presse', subject: 'Communiqué : programme' },
    ],
    teams: [
      { name: 'Logistique', lead: 'M. Kasongo', members: [
        { name: 'Aline Mwamba', role: 'Réservation des salles' },
        { name: 'Patrick Ngoy', role: 'Transport et navettes' },
        { name: 'Ruth Kalenga', role: 'Hébergement des intervenants' },
        { name: 'Joël Banza', role: 'Matériel et signalétique' },
      ] },
      { name: 'Communication', lead: 'Mme Mbuyi', members: [
        { name: 'Sarah Tshibangu', role: 'Réseaux sociaux' },
        { name: 'David Mukendi', role: 'Relations presse' },
        { name: 'Esther Lukusa', role: 'Design et visuels' },
      ] },
    ],
    partners: [
      { name: 'Université de Kinshasa', contact: 'Direction recherche', stage: 'Confirmé' },
      { name: 'Incubateur Lubumbashi', contact: 'M. Kabeya', stage: 'En cours' },
      { name: 'Réseau Mines & Tech', contact: 'Mme Ilunga', stage: 'Contacté' },
      { name: 'Fondation Avenir', contact: 'À identifier', stage: 'Prospect' },
      { name: 'Hub Numérique Kolwezi', contact: 'M. Mutombo', stage: 'Contacté' },
    ],
    sponsors: [
      { name: 'Groupe minier (exemple A)', contact: 'Relations publiques', stage: 'En cours', budget: 15000 },
      { name: 'Opérateur télécom (exemple B)', contact: 'Marketing', stage: 'Relancé', budget: 8000 },
      { name: 'Banque régionale (exemple C)', contact: 'À identifier', stage: 'Contacté', budget: 5000 },
      { name: 'Assureur (exemple D)', contact: 'M. Banza', stage: 'Confirmé', billing: 'Paiement reçu', budget: 10000, stand: '18 m²' },
      { name: 'Brasserie (exemple G)', contact: 'Mme Mbuyi', stage: 'Confirmé', billing: 'Facture élaborée', budget: 6000 },
      { name: 'Cimenterie (exemple H)', contact: 'M. Kalonji, +243 000 000 000', stage: 'Confirmé', billing: 'Paiement reçu', budget: 4000 },
    ],
    tasks: [
      { title: 'Valider le lieu de l’événement', owner: 'Équipe logistique', due: '2026-10-30', progress: 100, status: 'Terminée' },
      { title: 'Publier le programme', owner: 'Communication', due: '2026-11-05', progress: 10, dependsOn: 'Confirmer les intervenants', status: 'En cours',
        phases: [
          { id: 'ph1', title: 'Contenu', subtasks: [
            { id: 's1', title: 'Rassembler les sessions', done: true },
            { id: 's2', title: 'Rédiger les descriptions', done: false },
            { id: 's3', title: 'Valider avec le comité', done: false },
          ] },
          { id: 'ph2', title: 'Mise en ligne', subtasks: [
            { id: 's4', title: 'Mettre en page le PDF', done: false },
            { id: 's5', title: 'Publier sur le site', done: false },
          ] },
        ] },
      { title: 'Réserver l’hébergement des intervenants', owner: 'Équipe logistique', due: '2026-11-10', progress: 30, status: 'En cours' },
      { title: 'Lancer la campagne sponsors', owner: 'Partenariats', due: '2026-11-16', progress: 0, status: 'À faire' },
      { title: 'Signer le contrat traiteur', owner: 'Équipe logistique', due: '2026-11-20', progress: 40, dependsOn: 'Valider le lieu de l’événement', status: 'En cours' },
      { title: 'Confirmer les intervenants', owner: 'Programme', due: '2026-12-05', progress: 0, status: 'À faire' },
    ],
    budget: [
      { label: 'Lieu & logistique', planned: 12000, spent: 7400, expenses: [
        { label: 'Acompte location de la salle', amount: 5000, date: '2026-09-15', payment: 'Avance', paidOn: '2026-09-15' },
        { label: 'Repérage sur place', amount: 900, qty: 3, unitPrice: 300, date: '2026-10-02', payment: 'Payé', paidOn: '2026-10-03' },
        { label: 'Location de tentes (acompte)', amount: 1500, qty: 5, unitPrice: 300, date: '2026-10-28', payment: 'Avance', paidOn: '2026-10-28' },
      ] },
      { label: 'Communication', planned: 5000, spent: 1800, expenses: [
        { label: 'Conception de l’identité visuelle', amount: 1200, date: '2026-09-20' },
        { label: 'Campagne réseaux sociaux', amount: 600, qty: 4, unitPrice: 150, date: '2026-10-10' },
      ] },
      { label: 'Restauration', planned: 8000, spent: 0 },
      { label: 'Intervenants', planned: 6500, spent: 2100, expenses: [
        { label: 'Billets d’avion de deux intervenantes', amount: 1600, qty: 2, unitPrice: 800, date: '2026-10-18' },
        { label: 'Frais de visa', amount: 500, qty: 2, unitPrice: 250, date: '2026-11-05', payment: 'Payé', paidOn: '2026-11-06' },
      ] },
    ],
    providers: [
      { name: 'Traiteur Soleil', category: 'Restauration', phone: '+243 000 000 001', email: 'contact@exemple.cd', status: 'Devis reçu',
        docs: [
          { kind: 'Devis', direction: 'reçu', ref: 'DEV-2026-041', date: '2026-11-06', amount: 7800, status: 'En attente', fileName: 'Devis_Traiteur_Soleil.pdf', note: 'Buffet 2 jours, 400 personnes' },
        ] },
      { name: 'Studio Lumière', category: 'Photo & vidéo', phone: '+243 000 000 002', email: 'studio@exemple.cd', status: 'À contacter' },
      { name: 'Sono Events', category: 'Son & éclairage', phone: '+243 000 000 003', email: 'sono@exemple.cd', status: 'Confirmé',
        docs: [
          { kind: 'Devis', direction: 'reçu', ref: 'SE-D-118', date: '2026-10-20', amount: 3200, status: 'Accepté', fileName: 'Devis_Sono_Events.pdf' },
          { kind: 'Commande', direction: 'émis', ref: 'BC-2026-007', date: '2026-10-28', amount: 3200, status: 'Confirmée', fileName: 'Bon_de_commande_BC-2026-007.pdf' },
          { kind: 'Facture', direction: 'reçu', ref: 'SE-F-204', date: '2026-11-04', amount: 1600, status: 'À payer', fileName: 'Facture_acompte_SE-F-204.pdf', note: 'Acompte de 50 %' },
        ] },
    ],
  },
  'wmt-2027': {
    partners: [
      { name: 'Association Femmes des Mines', contact: 'Mme Kalala', stage: 'Confirmé' },
      { name: 'École Tech Kolwezi', contact: 'Direction', stage: 'Contacté' },
    ],
    sponsors: [
      { name: 'Groupe minier (exemple E)', contact: 'RSE', stage: 'Contacté', budget: 12000 },
      { name: 'Fondation éducation (exemple F)', contact: 'À identifier', stage: 'Contacté' },
    ],
    tasks: [
      { title: 'Définir le programme Academy', owner: 'Programme', due: '2026-12-15', progress: 20, status: 'En cours' },
      { title: 'Ouvrir les candidatures', owner: 'Communication', due: '2027-01-20', progress: 0, dependsOn: 'Définir le programme Academy', status: 'À faire' },
      { title: 'Réserver la salle à Kolwezi', owner: 'Équipe logistique', due: '2027-02-01', progress: 0, status: 'À faire' },
    ],
    budget: [
      { label: 'Lieu & logistique', planned: 6000, spent: 0 },
      { label: 'Bourses Academy', planned: 10000, spent: 1500, expenses: [
        { label: 'Première tranche des bourses', amount: 1500, date: '2026-10-30' },
      ] },
      { label: 'Communication', planned: 2500, spent: 400, expenses: [
        { label: 'Affiches et flyers', amount: 400, qty: 500, unitPrice: 0.8, date: '2026-11-03' },
      ] },
    ],
    providers: [
      { name: 'Hôtel Kolwezi Centre', category: 'Hébergement', phone: '+243 000 000 010', email: 'hotel@exemple.cd', status: 'À contacter' },
    ],
  },
  'ca-2026': {
    partners: [
      { name: 'Université de Kinshasa', contact: 'Direction recherche', stage: 'Confirmé' },
      { name: 'Incubateur Lubumbashi', contact: 'M. Kabeya', stage: 'Confirmé' },
    ],
    sponsors: [
      { name: 'Groupe minier (exemple A)', contact: 'Relations publiques', stage: 'Confirmé', billing: 'Paiement reçu', budget: 12000, stand: '18 m²' },
      { name: 'Assureur (exemple D)', contact: 'M. Banza', stage: 'Confirmé', billing: 'Paiement reçu', budget: 8000, stand: '9 m²' },
    ],
    tasks: [
      { title: 'Valider le lieu de l’événement', owner: 'Équipe logistique', due: '2025-11-15', progress: 100, status: 'Terminée' },
      { title: 'Publier le programme', owner: 'Communication', due: '2026-01-10', progress: 100, status: 'Terminée' },
      { title: 'Bilan de l’édition', owner: 'Coordination', due: '2026-04-15', progress: 100, status: 'Terminée' },
    ],
    budget: [
      { label: 'Lieu & logistique', planned: 11000, spent: 10800, expenses: [
        { label: 'Location de la salle', amount: 9000, date: '2026-01-10' },
        { label: 'Sonorisation et éclairage', amount: 1800, date: '2026-03-10' },
      ] },
      { label: 'Communication', planned: 4500, spent: 4600, expenses: [
        { label: 'Campagne presse et radio', amount: 2800, date: '2026-01-25' },
        { label: 'Impressions', amount: 1800, qty: 1200, unitPrice: 1.5, date: '2026-02-20' },
      ] },
      { label: 'Restauration', planned: 7500, spent: 7200, expenses: [
        { label: 'Traiteur Soleil – facture finale', amount: 7200, date: '2026-03-20' },
      ] },
    ],
    providers: [
      { name: 'Traiteur Soleil', category: 'Restauration', phone: '+243 000 000 001', email: 'contact@exemple.cd', status: 'Payé',
        docs: [
          { kind: 'Devis', direction: 'reçu', ref: 'DEV-2025-087', date: '2025-12-02', amount: 7100, status: 'Accepté' },
          { kind: 'Commande', direction: 'émis', ref: 'BC-2025-019', date: '2025-12-10', amount: 7100, status: 'Livrée' },
          { kind: 'Facture', direction: 'reçu', ref: 'TS-F-2026-012', date: '2026-03-20', amount: 7200, status: 'Payée', note: 'Supplément café : 100 $' },
        ] },
    ],
  },
};

/** Données d'exemple avec un identifiant unique par tâche. */
export const demoData: Record<string, EventData> = Object.fromEntries(
  Object.entries(rawDemo).map(([eventId, d]) => [eventId, {
    ...d,
    communication: d.communication ?? [],
    wmt: demoWmt[eventId] ?? emptyWmt(),
    programme: demoProgramme[eventId] ?? [],
    badges: buildDemoBadges(eventId),
    badgeTheme: {},
    evaluation: emptyEvaluation(),
    budget: d.budget.map((b, i) => ({ ...b, expenses: (b.expenses ?? []).map((x, j) => ({ ...x, id: `${eventId}-b${i + 1}-x${j + 1}` })) })),
    teams: (d.teams ?? []).map((t, i) => ({ ...t, id: `${eventId}-e${i + 1}`, members: t.members.map((m, j) => ({ ...m, id: `${eventId}-e${i + 1}-m${j + 1}` })) })),
    providers: d.providers.map((p, i) => ({ ...p, id: `${eventId}-p${i + 1}`, docs: (p.docs ?? []).map((x, j) => ({ ...x, id: `${eventId}-p${i + 1}-d${j + 1}` })) })),
    tasks: d.tasks.map((t, i) => syncTask({ ...t, id: `${eventId}-t${i + 1}`, phases: t.phases ?? [] })),
  }]),
);
