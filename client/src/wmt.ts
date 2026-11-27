/* Women in MiningTech & Academy : programmes, participantes et sessions d'un événement.
   Données d'exemple fictives (noms et structures inventés). */

export const programKinds = ['Women in MiningTech', 'Academy'] as const;
export type ProgramKind = (typeof programKinds)[number];

/** Parcours d'une participante, de la candidature au certificat. */
export const participantStages = ['Candidature', 'Retenue', 'En formation', 'Certifiée', 'Désistée'] as const;
export type ParticipantStage = (typeof participantStages)[number];

export interface Program { id: string; kind: ProgramKind; name: string; description: string; capacity: number; start: string; end: string }
export interface Participant { id: string; name: string; organisation: string; email: string; programId: string; status: ParticipantStage }
export interface WmtSession { id: string; programId: string; title: string; date: string; time: string; place: string; speaker: string }
export interface WmtData { programs: Program[]; participants: Participant[]; sessions: WmtSession[] }

export const emptyWmt = (): WmtData => ({ programs: [], participants: [], sessions: [] });

/** Les places occupées : retenues, en formation ou certifiées (pas les candidatures ni les désistements). */
export const takesSeat = (s: ParticipantStage) => s === 'Retenue' || s === 'En formation' || s === 'Certifiée';

const people = (prefix: string, programId: string, rows: [string, string, ParticipantStage][]): Participant[] =>
  rows.map(([name, organisation, status], i) => ({
    id: `${prefix}-${i + 1}`, name, organisation, programId, status,
    email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@exemple.cd`,
  }));

export const demoWmt: Record<string, WmtData> = {
  'ca-2027': {
    programs: [
      { id: 'ca27-wmt', kind: 'Women in MiningTech', name: 'Women in MiningTech 2027', description: 'Mentorat de femmes ingénieures et techniciennes du secteur minier, avec un panel pendant le forum.', capacity: 20, start: '2027-01-15', end: '2027-03-17' },
      { id: 'ca27-aca', kind: 'Academy', name: 'Academy — Données et mines', description: 'Formation pratique à l’analyse de données appliquée à l’exploitation minière.', capacity: 30, start: '2027-02-01', end: '2027-03-14' },
    ],
    participants: [
      ...people('ca27-wmt-p', 'ca27-wmt', [
        ['Bénédicte Kalala', 'Ingénieure géologue (exemple)', 'Retenue'],
        ['Christelle Mbayo', 'Étudiante en génie minier', 'Retenue'],
        ['Nadine Kasongo', 'Technicienne de laboratoire (exemple)', 'Candidature'],
        ['Rachel Ilunga', 'Cheffe de projet environnement', 'Candidature'],
        ['Sylvie Mwanza', 'Ingénieure procédés (exemple)', 'Candidature'],
      ]),
      ...people('ca27-aca-p', 'ca27-aca', [
        ['Grâce Tshibola', 'Analyste de données junior', 'Retenue'],
        ['Mireille Kabwe', 'Étudiante en informatique', 'Candidature'],
        ['Divine Ngoie', 'Topographe (exemple)', 'Candidature'],
      ]),
    ],
    sessions: [
      { id: 'ca27-s1', programId: 'ca27-wmt', title: 'Lancement du mentorat', date: '2027-01-15', time: '10:00', place: 'En ligne', speaker: 'Équipe programme' },
      { id: 'ca27-s2', programId: 'ca27-aca', title: 'Introduction aux données minières', date: '2027-02-01', time: '09:00', place: 'Lubumbashi — salle B', speaker: 'Formatrice invitée (exemple)' },
      { id: 'ca27-s3', programId: 'ca27-wmt', title: 'Panel « Femmes et innovation minière »', date: '2027-03-16', time: '14:30', place: 'Forum — grande salle', speaker: 'Intervenantes du forum' },
    ],
  },
  'wmt-2027': {
    programs: [
      { id: 'wmt27-wmt', kind: 'Women in MiningTech', name: 'Cohorte Kolwezi 2027', description: 'Six mois de mentorat et de visites de sites pour 15 femmes du secteur minier et technologique.', capacity: 15, start: '2026-12-01', end: '2027-06-11' },
      { id: 'wmt27-aca', kind: 'Academy', name: 'Academy — Sécurité et maintenance', description: 'Cycle de formation certifiant sur la sécurité des sites et la maintenance des équipements.', capacity: 25, start: '2027-01-20', end: '2027-05-30' },
    ],
    participants: [
      ...people('wmt27-wmt-p', 'wmt27-wmt', [
        ['Aimée Kapinga', 'Ingénieure électricienne (exemple)', 'En formation'],
        ['Esther Mujinga', 'Responsable HSE (exemple)', 'En formation'],
        ['Joëlle Banza', 'Étudiante en géologie', 'En formation'],
        ['Laetitia Mukendi', 'Data analyst (exemple)', 'Retenue'],
        ['Patience Lunda', 'Technicienne de maintenance', 'Retenue'],
        ['Rose Kalenga', 'Ingénieure des mines (exemple)', 'Candidature'],
        ['Sarah Ngalula', 'Entrepreneure (exemple)', 'Désistée'],
      ]),
      ...people('wmt27-aca-p', 'wmt27-aca', [
        ['Clarisse Mbuyi', 'Opératrice de machine (exemple)', 'Retenue'],
        ['Deborah Kayembe', 'Étudiante en électromécanique', 'Retenue'],
        ['Fanny Tshiala', 'Technicienne HSE (exemple)', 'Candidature'],
        ['Gloria Mwamba', 'Superviseure de site (exemple)', 'Candidature'],
      ]),
    ],
    sessions: [
      { id: 'wmt27-s1', programId: 'wmt27-wmt', title: 'Rencontre mentors et mentorées', date: '2026-12-01', time: '10:00', place: 'Kolwezi — centre de conférences', speaker: 'Équipe programme' },
      { id: 'wmt27-s2', programId: 'wmt27-wmt', title: 'Atelier « Prendre la parole en réunion »', date: '2026-11-28', time: '15:00', place: 'En ligne', speaker: 'Coach invitée (exemple)' },
      { id: 'wmt27-s3', programId: 'wmt27-aca', title: 'Module 1 — Règles de sécurité sur site', date: '2027-01-20', time: '09:00', place: 'Kolwezi — salle de formation', speaker: 'Formateur HSE (exemple)' },
      { id: 'wmt27-s4', programId: 'wmt27-wmt', title: 'Visite d’un site minier', date: '2027-02-12', time: '08:30', place: 'Site partenaire (exemple)', speaker: 'Ingénieure référente' },
      { id: 'wmt27-s5', programId: 'wmt27-wmt', title: 'Atelier CV et candidatures', date: '2026-11-05', time: '14:00', place: 'En ligne', speaker: 'Équipe programme' },
    ],
  },
  'ca-2026': {
    programs: [
      { id: 'ca26-wmt', kind: 'Women in MiningTech', name: 'Women in MiningTech 2026', description: 'Première édition du programme de mentorat.', capacity: 12, start: '2026-01-10', end: '2026-03-14' },
    ],
    participants: people('ca26-wmt-p', 'ca26-wmt', [
      ['Agnès Mutombo', 'Ingénieure des mines (exemple)', 'Certifiée'],
      ['Béatrice Lukusa', 'Géologue (exemple)', 'Certifiée'],
      ['Carine Nsenga', 'Étudiante en génie minier', 'Certifiée'],
      ['Dorcas Mbala', 'Technicienne (exemple)', 'Désistée'],
    ]),
    sessions: [
      { id: 'ca26-s1', programId: 'ca26-wmt', title: 'Remise des certificats', date: '2026-03-14', time: '16:00', place: 'Forum — grande salle', speaker: 'Équipe programme' },
    ],
  },
};
