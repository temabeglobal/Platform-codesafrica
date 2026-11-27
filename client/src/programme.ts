/* Programme de l'événement : les sessions avec leur heure, leur thématique, leur modérateur et leurs intervenants.
   Données d'exemple fictives (noms inventés). */

/** Où en est la venue d'un intervenant. */
export const SPEAKER_STATUSES = ['Confirmé', 'En cours', 'Empêché'] as const;
export type SpeakerStatus = (typeof SPEAKER_STATUSES)[number];

/** Couleurs et explication de chaque statut. */
export const speakerStatusStyle: Record<SpeakerStatus, { dot: string; badge: string; on: string; hint: string }> = {
  'Confirmé': { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', on: 'bg-emerald-600 text-white ring-emerald-600', hint: 'Sa venue est confirmée' },
  'En cours': { dot: 'bg-royal-400', badge: 'bg-royal-50 text-royal-800 ring-royal-200', on: 'bg-royal-400 text-brand-950 ring-royal-400', hint: 'Invitation en cours, pas encore de réponse ferme' },
  'Empêché': { dot: 'bg-red-500', badge: 'bg-red-50 text-red-800 ring-red-200', on: 'bg-red-600 text-white ring-red-600', hint: 'Ne pourra pas intervenir' },
};

export interface Speaker {
  id: string;
  name: string;
  /** Fonction ou organisation (facultatif). */
  title: string;
  status: SpeakerStatus;
}

export interface ProgrammeItem {
  id: string;
  /** Jour, au format AAAA-MM-JJ. */
  date: string;
  /** Heure de début et de fin, au format HH:MM (la fin est facultative). */
  start: string;
  end: string;
  theme: string;
  /** Vide = modérateur à désigner. */
  moderator: string;
  speakers: Speaker[];
}

/** Ordre chronologique : jour, puis heure de début. */
export const byTime = (a: ProgrammeItem, b: ProgrammeItem) => (a.date + a.start).localeCompare(b.date + b.start);

/** Nombre d'intervenants par statut. */
export const speakerCounts = (list: Speaker[]) =>
  Object.fromEntries(SPEAKER_STATUSES.map((s) => [s, list.filter((x) => x.status === s).length])) as Record<SpeakerStatus, number>;

export const dayLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Tous les jours entre le début et la fin de l'événement. */
export function eventDays(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date((end || start) + 'T00:00:00Z');
  for (let i = 0; d <= last && i < 31; i++, d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

type RawSpeaker = [name: string, title: string, status: SpeakerStatus];
type Raw = Omit<ProgrammeItem, 'id' | 'speakers'> & { speakers?: RawSpeaker[] };
const items = (prefix: string, rows: Raw[]): ProgrammeItem[] => rows.map((r, i) => ({
  ...r,
  id: `${prefix}-${i + 1}`,
  speakers: (r.speakers ?? []).map(([name, title, status], j) => ({ id: `${prefix}-${i + 1}-s${j + 1}`, name, title, status })),
}));

export const demoProgramme: Record<string, ProgrammeItem[]> = {
  'ca-2027': items('ca27-pg', [
    { date: '2027-03-15', start: '08:30', end: '09:30', theme: 'Accueil et enregistrement des participants', moderator: '' },
    { date: '2027-03-15', start: '09:30', end: '10:30', theme: 'Cérémonie d’ouverture', moderator: 'M. Kalonji (exemple)', speakers: [
      ['M. Lukusa (exemple)', 'Ministère des Mines', 'Confirmé'],
      ['Mme Banza (exemple)', 'Gouvernorat du Haut-Katanga', 'En cours'],
    ] },
    { date: '2027-03-15', start: '11:00', end: '12:30', theme: 'Panel : l’avenir du secteur minier en Afrique centrale', moderator: 'M. Ilunga (exemple)', speakers: [
      ['Dr Kasongo (exemple)', 'Université de Lubumbashi', 'Confirmé'],
      ['Mme Mbuyi (exemple)', 'Chambre des mines', 'Confirmé'],
      ['M. Nkulu (exemple)', 'Société minière', 'En cours'],
      ['M. Diallo (exemple)', 'Banque de développement', 'Empêché'],
    ] },
    { date: '2027-03-15', start: '14:00', end: '15:30', theme: 'Transition énergétique et minerais critiques', moderator: 'Dr Mwamba (exemple)', speakers: [
      ['Mme Tshala (exemple)', 'Cabinet de conseil énergie', 'En cours'],
      ['M. Mutombo (exemple)', 'Raffinerie de cobalt', 'Confirmé'],
      ['Mme Ngalula (exemple)', 'ONG environnementale', 'En cours'],
    ] },
    { date: '2027-03-16', start: '09:00', end: '10:30', theme: 'Numérique et données au service des mines', moderator: 'Mme Tshibola (exemple)', speakers: [
      ['M. Kalonji (exemple)', 'Start-up géodonnées', 'Confirmé'],
      ['Mme Kayembe (exemple)', 'Opérateur télécom', 'Empêché'],
    ] },
    { date: '2027-03-16', start: '11:00', end: '12:30', theme: 'Panel « Femmes et innovation minière »', moderator: 'Mme Kalala (exemple)', speakers: [
      ['Mme Mujinga (exemple)', 'Ingénieure des mines', 'Confirmé'],
      ['Mme Kapinga (exemple)', 'Women in MiningTech', 'Confirmé'],
      ['Mme Ilunga (exemple)', 'Géologue', 'En cours'],
    ] },
    { date: '2027-03-16', start: '14:00', end: '16:00', theme: 'Rencontres d’affaires entre exposants et investisseurs', moderator: '' },
    { date: '2027-03-17', start: '09:30', end: '11:00', theme: 'Responsabilité sociale et communautés locales', moderator: 'M. Ngoy (exemple)', speakers: [
      ['M. Kabeya (exemple)', 'Association communautaire', 'En cours'],
      ['Mme Lumbu (exemple)', 'Fondation minière', 'Confirmé'],
    ] },
    { date: '2027-03-17', start: '15:00', end: '16:00', theme: 'Synthèse et cérémonie de clôture', moderator: 'M. Kalonji (exemple)', speakers: [
      ['M. Lukusa (exemple)', 'Ministère des Mines', 'En cours'],
    ] },
  ]),
  'wmt-2027': items('wmt27-pg', [
    { date: '2027-06-10', start: '09:00', end: '10:00', theme: 'Ouverture de la conférence', moderator: 'Mme Kapinga (exemple)', speakers: [
      ['Mme Mujinga (exemple)', 'Women in MiningTech', 'Confirmé'],
    ] },
    { date: '2027-06-10', start: '10:30', end: '12:00', theme: 'Parcours de femmes ingénieures', moderator: 'Mme Mujinga (exemple)', speakers: [
      ['Mme Kalala (exemple)', 'Ingénieure procédés', 'Confirmé'],
      ['Mme Tshibola (exemple)', 'Cheffe de site', 'En cours'],
    ] },
    { date: '2027-06-11', start: '09:30', end: '11:00', theme: 'Sécurité sur les sites : retours d’expérience', moderator: '', speakers: [
      ['M. Ngoy (exemple)', 'Responsable sécurité', 'Empêché'],
    ] },
    { date: '2027-06-11', start: '14:00', end: '15:00', theme: 'Remise des certificats Academy', moderator: 'Équipe programme' },
  ]),
  'ca-2026': items('ca26-pg', [
    { date: '2026-03-12', start: '09:00', end: '10:00', theme: 'Cérémonie d’ouverture', moderator: 'M. Kalonji (exemple)', speakers: [
      ['M. Lukusa (exemple)', 'Ministère des Mines', 'Confirmé'],
    ] },
    { date: '2026-03-13', start: '10:00', end: '12:00', theme: 'Panel : investir dans les mines responsables', moderator: 'M. Ilunga (exemple)', speakers: [
      ['Dr Kasongo (exemple)', 'Université de Lubumbashi', 'Confirmé'],
      ['M. Diallo (exemple)', 'Banque de développement', 'Confirmé'],
    ] },
    { date: '2026-03-14', start: '15:00', end: '16:00', theme: 'Clôture et remise des certificats', moderator: 'Équipe programme' },
  ]),
};
