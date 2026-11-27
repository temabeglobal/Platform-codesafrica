import {
  CheckSquare, Wallet, Handshake, Award, Truck, Users, Megaphone, Sparkles, LayoutDashboard,
  Network, GraduationCap, Store, CalendarClock, CalendarDays, Clock, BookOpen, Mic, IdCard, ClipboardCheck,
  type LucideIcon,
} from 'lucide-react';

export type GroupId = 'taches' | 'programme' | 'budget' | 'reseau' | 'exposants' | 'contenu' | 'equipe' | 'wmt';

export interface ModuleDef {
  path: string;
  label: string;
  icon: LucideIcon;
  group: GroupId;
  description: string;
  features: string[];
}

/** `short` : libellé plus court sur téléphone. */
export interface GroupDef { id: GroupId; label: string; short?: string; icon: LucideIcon; description: string }

export const dashboard = { path: '/', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard };

export const groups: GroupDef[] = [
  { id: 'taches', label: 'Tâches', icon: CheckSquare, description: 'Planifier et suivre le travail de l’édition.' },
  { id: 'programme', label: 'Programme', icon: CalendarClock, description: 'Heures, thématiques et modérateurs.' },
  { id: 'budget', label: 'Organisation & budget', short: 'Budget', icon: Wallet, description: 'Organisation générale, budget, dépenses, prestataires et bilan après l’événement.' },
  { id: 'reseau', label: 'Réseau', icon: Network, description: 'Partenaires et sponsors.' },
  { id: 'exposants', label: 'Exposants', icon: Store, description: 'Sponsors dont le paiement est reçu, et leur stand.' },
  { id: 'contenu', label: 'Communication', icon: Megaphone, description: 'Calendrier des actions de communication.' },
  { id: 'equipe', label: 'Équipe', icon: Users, description: 'Membres, rôles, responsabilités et accréditations.' },
  { id: 'wmt', label: 'Women in MiningTech & Academy', short: 'WMT & Academy', icon: GraduationCap, description: 'Programmes Women in MiningTech et Academy.' },
];

export const modules: ModuleDef[] = [
  { path: '/taches', group: 'taches', label: 'Tâches', icon: CheckSquare, description: 'Planifier et suivre le travail de l’édition.', features: ['Date limite', 'Dépendances entre tâches', 'Suivi d’avancement'] },
  { path: '/calendrier', group: 'taches', label: 'Calendrier', icon: CalendarDays, description: 'Les échéances du mois : jalons, tâches, tâches critiques, début et fin de l’événement.', features: ['Vue mois', 'Jalons', 'Tâches critiques'] },
  { path: '/horaires', group: 'programme', label: 'Heure', icon: Clock, description: 'Les sessions jour par jour, heure par heure.', features: ['Heure de début et de fin', 'Jour'] },
  { path: '/thematiques', group: 'programme', label: 'Thématiques', icon: BookOpen, description: 'Chaque thématique et ses intervenants : confirmés, en cours ou empêchés.', features: ['Intervenants', 'Statut de venue'] },
  { path: '/moderateurs', group: 'programme', label: 'Modérateurs', icon: Mic, description: 'Qui modère quelle session.', features: ['Modérateurs', 'Sessions à modérer'] },
  { path: '/organisation', group: 'budget', label: 'Organisation & budget', icon: Wallet, description: 'Suivre l’organisation générale et le budget.', features: ['Postes de budget', 'Prévu / dépensé', 'Suivi de l’organisation'] },
  { path: '/prestataires', group: 'budget', label: 'Prestataires', icon: Truck, description: 'Suivi des prestataires et contact direct.', features: ['Fiches prestataires', 'Contact par WhatsApp', 'Contact par SMS', 'Contact par e-mail', 'Historique des échanges'] },
  { path: '/bilan', group: 'budget', label: 'Bilan & évaluation', icon: ClipboardCheck, description: 'Après l’événement : le bilan chiffré, et l’évaluation des équipes, des intervenants, des prestataires et des partenaires. Le rapport se télécharge en PDF.', features: ['Bilan chiffré', 'Notes par critère', 'Rapport PDF'] },
  { path: '/partenaires', group: 'reseau', label: 'Partenaires', icon: Handshake, description: 'Pipeline des partenaires.', features: ['Prospect', 'Contacté', 'En cours', 'Confirmé'] },
  { path: '/sponsors', group: 'reseau', label: 'Sponsors', icon: Award, description: 'Suivi des sponsors, de la prise de contact au paiement.', features: ['Contacté', 'Relancé', 'En cours', 'Confirmé', 'Facturation'] },
  { path: '/exposants', group: 'exposants', label: 'Exposants', icon: Store, description: 'Les sponsors dont le paiement est reçu, avec leur contact et la taille de leur stand.', features: ['Paiement reçu', 'Contact', 'Stand de 9 m² ou 18 m²'] },
  { path: '/communication', group: 'contenu', label: 'Planning communication', icon: Megaphone, description: 'Calendrier des actions de communication.', features: ['Calendrier éditorial', 'Canaux', 'Statut de publication'] },
  { path: '/equipe', group: 'equipe', label: 'Équipe', icon: Users, description: 'Membres, rôles et responsabilités.', features: ['Membres', 'Rôles', 'Responsabilités'] },
  { path: '/accreditations', group: 'equipe', label: 'Accréditations', icon: IdCard, description: 'Les badges de l’événement : staff, visiteurs, médias, intervenants… Avec le nom et, si vous le souhaitez, une photo.', features: ['Badges par catégorie', 'Photo facultative', 'Impression'] },
  { path: '/wmt-academy', group: 'wmt', label: 'Women in MiningTech & Academy', icon: Sparkles, description: 'Programmes Women in MiningTech et Academy.', features: ['Programmes', 'Participantes', 'Sessions'] },
];

export const modulesOf = (g: GroupId) => modules.filter((m) => m.group === g);
export const moduleAt = (pathname: string) => modules.find((m) => pathname.startsWith(m.path));
