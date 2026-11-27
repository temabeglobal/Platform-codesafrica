/* Accréditations : un badge par personne (staff, visiteur, média, intervenant…), avec son nom et une photo facultative.
   Maquette : rien n'est encore enregistré en base. */

export const BADGE_CATEGORIES = ['Staff', 'Organisation', 'Intervenant', 'Modérateur', 'Média', 'Exposant', 'Partenaire', 'VIP', 'Participant', 'Visiteur'] as const;
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];

/** Couleur (assez foncée pour un texte blanc, y compris à l'impression) et préfixe du numéro de badge. */
export const badgeStyle: Record<BadgeCategory, { color: string; code: string }> = {
  Staff: { color: '#0088a8', code: 'STF' },
  Organisation: { color: '#10283a', code: 'ORG' },
  Intervenant: { color: '#2f6fde', code: 'INT' },
  Modérateur: { color: '#6d28d9', code: 'MOD' },
  Média: { color: '#d61f4e', code: 'MED' },
  Exposant: { color: '#00876f', code: 'EXP' },
  Partenaire: { color: '#c2620a', code: 'PAR' },
  VIP: { color: '#8a6a12', code: 'VIP' },
  Participant: { color: '#a3346f', code: 'PTC' },
  Visiteur: { color: '#4b5b70', code: 'VIS' },
};

export interface Badge {
  id: string;
  /** Numéro d'ordre dans l'événement, affiché avec le préfixe de la catégorie (ex. STF-0007). */
  number: number;
  name: string;
  category: BadgeCategory;
  /** Fonction ou organisation (facultatif). */
  org: string;
  /** Photo en data URL, recadrée en carré ; facultative. */
  photo?: string;
  /** Identifiant aléatoire et unique du badge, porté par son QR code (aucune donnée personnelle). */
  token?: string;
}

/** Habillage facultatif des badges d'un événement, selon son identité visuelle. */
export interface BadgeTheme {
  /** Image de fond du badge (data URL, recadrée au format 2:3). */
  background?: string;
  /** Logo de l'événement (data URL), affiché à côté du logo CODES Africa (facultatif). */
  logo?: string;
}
/** Logo officiel CODES Africa, présent sur tous les badges. */
export const CODES_LOGO = '/codes-africa-logo-badge.png';

export const hasTheme = (t?: BadgeTheme) => !!(t?.background || t?.logo);

// Alphabet sans caractères ambigus (pas de 0/O ni 1/I) : le jeton reste lisible s'il faut le saisir à la main.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Nouveau jeton aléatoire de 10 caractères (32^10 possibilités). */
export const newToken = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => ALPHABET[x % 32]).join('');
/** Jeton stable pour un badge créé avant les QR codes : dérivé de son identifiant (unique). */
const tokenFromId = (id: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let out = '';
  for (let i = 0; i < 10; i++) {
    // Mélange (finaliseur de MurmurHash3) pour que chaque caractère dépende de tout l'identifiant.
    let x = (h + Math.imul(i + 1, 0x9e3779b9)) | 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x ^= x >>> 16;
    out += ALPHABET[(x >>> 0) % 32];
  }
  return out;
};
export const badgeToken = (b: Pick<Badge, 'id' | 'token'>) => b.token ?? tokenFromId(b.id);
/** Contenu du QR code : référence de l'événement, n° du badge et jeton unique. Pas de nom ni de photo. */
export const qrPayload = (b: Pick<Badge, 'id' | 'token' | 'category' | 'number'>, eventRef: string) =>
  ['CA', eventRef || 'EVENEMENT', badgeCode(b), badgeToken(b)].join(':').toUpperCase().replace(/[^0-9A-Z $%*+\-./:]/g, '-');

export const badgeCode = (b: Pick<Badge, 'category' | 'number'>) => `${badgeStyle[b.category].code}-${String(b.number).padStart(4, '0')}`;
export const nextNumber = (list: Badge[]) => list.reduce((m, b) => Math.max(m, b.number), 0) + 1;
export const initialsOf = (name: string) =>
  name.replace(/\(.*?\)/g, '').replace(/^(M\.|Mme|Mlle|Dr|Pr)\s+/i, '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/** Lit une image choisie par l'utilisateur, la recadre en carré (centre) et la réduit pour rester légère. */
export async function readPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (JPG, PNG ou WebP).');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error('Impossible de lire cette image. Essayez une photo JPG ou PNG.'); }
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(600, side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const decode = async (file: File) => {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (JPG, PNG ou WebP).');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error('Impossible de lire cette image. Essayez un fichier JPG ou PNG.'); }
  return { img, done: () => URL.revokeObjectURL(url) };
};

/** Image de fond : recadrée au centre au format du badge (2:3), en JPEG. */
export async function readBackground(file: File): Promise<string> {
  const { img, done } = await decode(file);
  try {
    const W = 1000, H = 1500;
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.getContext('2d')!.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally { done(); }
}

/** Logo : proportions gardées, transparence conservée (PNG), largeur limitée. */
export async function readLogo(file: File): Promise<string> {
  const { img, done } = await decode(file);
  try {
    const r = Math.min(1, 800 / img.naturalWidth, 300 / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * r)); canvas.height = Math.max(1, Math.round(img.naturalHeight * r));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { done(); }
}

type RawBadge = Omit<Badge, 'id' | 'number'>;
/** Badges d'EXEMPLE (noms inventés, sans photo). */
export const demoBadges: Record<string, RawBadge[]> = {
  'ca-2027': [
    { name: 'M. Kasongo', category: 'Organisation', org: 'Responsable logistique' },
    { name: 'Aline Mwamba', category: 'Staff', org: 'Logistique' },
    { name: 'Sarah Tshibangu', category: 'Staff', org: 'Communication' },
    { name: 'M. Kalonji', category: 'Modérateur', org: 'Session d’ouverture' },
    { name: 'Grace Mujinga', category: 'Média', org: 'Radio Okapi (exemple)' },
    { name: 'Jean Ilunga', category: 'Visiteur', org: 'Étudiant, Université de Lubumbashi' },
  ],
};

export const buildDemoBadges = (eventId: string): Badge[] =>
  (demoBadges[eventId] ?? []).map((b, i) => ({ ...b, id: `${eventId}-bd${i + 1}`, number: i + 1 }));
