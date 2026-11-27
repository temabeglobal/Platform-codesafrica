/* Humeur de Sonia, partagée par tous ses portraits (bouton et panneau).
   Le visage lui-même est dans SoniaLive.tsx (même principe que dav, sur TIMLY). */

export type Mood = 'accueil' | 'repos' | 'ecoute' | 'reflexion' | 'parle' | 'parle-doux' | 'joie' | 'surprise';

export const MOOD_LABEL: Record<Mood, string> = {
  accueil: 'Vous accueille avec le sourire',
  repos: 'Sereine',
  ecoute: 'Vous écoute',
  reflexion: 'Réfléchit',
  parle: 'Vous répond',
  'parle-doux': 'Vous répond avec douceur',
  joie: 'Ravie',
  surprise: 'Amusée',
};

// Humeurs brèves : elles reviennent d'elles-mêmes à l'humeur suivante après ce délai (ms).
const SHORT: Partial<Record<Mood, number>> = { accueil: 5200, joie: 6000, surprise: 2600 };

const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let mood: Mood = 'accueil';
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(m: Mood) => void>();
const emit = () => listeners.forEach((l) => l(mood));

export const sonia = {
  onMood(l: (m: Mood) => void) { listeners.add(l); l(mood); return () => { listeners.delete(l); }; },
  /** Change d'humeur ; une humeur brève revient ensuite à `then`. */
  set(m: Mood, then: Mood = 'repos') {
    clearTimeout(timer);
    mood = m; emit();
    const d = SHORT[m];
    if (d) timer = setTimeout(() => { mood = then; emit(); }, d);
  },
  get mood() { return mood; },
  reduced,
};

/* ── Le visage : uniquement ses vraies images, dans l'ordre naturel de la vidéo ──
   La planche « mouvements.webp » contient 54 images : les 9 vraies poses de la vidéo
   (0-1 parle, 2 rit, 3 clin d'œil, 4 yeux fermés, 5-8 sourire calme), chacune suivie
   de 5 images intermédiaires calculées vers la pose suivante. On ne se déplace que d'une
   image voisine à l'autre, en avant ou en arrière : aucun visage n'est recomposé. */
export const FRAMES = 54;
export const COLS = 8;
export const ROWS = 7;
const POSE = (k: number) => k * 6;
export const CALM = POSE(6);

type Op = { go: number; ms: number; dir?: 1 | -1 } | { hold: number };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const wrap = (i: number) => ((i % FRAMES) + FRAMES) % FRAMES;

let pos = CALM; // position fractionnaire sur l'anneau de 54 images
const faceListeners = new Set<(p: number) => void>();
let queue: Op[] = [];
let cur: { from: number; dist: number; ms: number; t: number } | { hold: number; t: number } | null = null;
let blinkAt = 0;

/* Un pas de moins entre deux images = mouvement plus vif. Les mouvements calmes sont lents. */
const SLOW = 70, SOFT = 45, LIVE = 30, BLINK = 22;
const go = (to: number, perStep: number, dir?: 1 | -1): Op => ({ go: wrap(to), ms: perStep, dir });
const hold = (a: number, b = a): Op => ({ hold: rnd(a, b) });

/* Clignement : de la pose calme 5, on remonte vers 4 (yeux fermés) puis on revient. */
const blink = (): Op[] => [go(POSE(5), SOFT), go(POSE(4), BLINK, -1), hold(60, 110), go(POSE(5), BLINK + 6, 1)];
/* ——— Gestes : jamais deux fois le même ———
   Chaque geste est composé à la volée à partir de ses vraies images : jusqu'où elle va
   (un demi-sourire, un rire franc, un clin d'œil appuyé ou à peine esquissé), par quel
   chemin, à quelle vitesse, combien de temps elle garde l'expression, et dans quel ordre
   les moments s'enchaînent. Cela donne des dizaines de milliers de combinaisons ; les
   dernières sont mémorisées sur l'appareil pour ne pas les rejouer d'une ouverture à l'autre. */
const between = (a: number, b: number) => Math.round(rnd(a, b) * 2) / 2; // demi-images : plus de nuances
type Moment = { key: string; ops: (tempo: number) => Op[] };
const calmSpot = () => between(POSE(5) + 1, POSE(8) + 1);
const MOMENTS: (() => Moment)[] = [
  // Sourire qui s'ouvre jusqu'au rire (plus ou moins franc), retour par la bouche qui se referme.
  () => { const d = between(POSE(1) + 2, POSE(2)); const back = Math.random() < 0.5;
    return { key: `rire${d}${back}`, ops: (t) => [go(POSE(8), SOFT * t, 1), go(d, LIVE * t, 1), hold(250 * t, 900 * t),
      back ? go(POSE(8) + between(0, 3), SOFT * t, -1) : go(POSE(5), (LIVE + 8) * t, 1)] }; },
  // Rire, puis clin d'œil complice (plus ou moins appuyé).
  () => { const w = between(POSE(3) - 2, POSE(3)); return { key: `clin${w}`, ops: (t) => [go(POSE(8), SOFT * t, 1),
    go(POSE(2), LIVE * t, 1), hold(120 * t, 400 * t), go(w, (LIVE + 6) * t, 1), hold(200 * t, 600 * t), go(POSE(5), (LIVE + 10) * t, 1)] }; },
  // Regard qui se baisse tendrement, puis se relève.
  () => { const e = between(POSE(4), POSE(5) - 2); return { key: `baisse${e}`, ops: (t) => [go(POSE(5), SOFT * t),
    go(e, SLOW * t, -1), hold(400 * t, 1200 * t), go(POSE(5) + between(0, 3), SLOW * t, 1)] }; },
  // Les lèvres s'entrouvrent, comme pour dire quelque chose, puis se referment.
  () => { const m = between(POSE(8) + 2, FRAMES + 4); return { key: `levres${m}`, ops: (t) => [go(POSE(8), SOFT * t),
    go(m, SOFT * t, 1), hold(180 * t, 650 * t), go(POSE(8) - between(0, 3), SOFT * t, -1)] }; },
  // Rire timide : à peine commencé, aussitôt retenu.
  () => { const d = between(POSE(0) + 3, POSE(1) + 3); return { key: `timide${d}`, ops: (t) => [go(POSE(8), SOFT * t, 1),
    go(d, LIVE * t, 1), hold(80 * t, 300 * t), go(POSE(8) + between(1, 4), (SOFT + 10) * t, -1)] }; },
  // Yeux fermés un instant (contentement), puis sourire calme.
  () => { const c = between(POSE(4) - 1, POSE(4) + 2); return { key: `ferme${c}`, ops: (t) => [go(POSE(5), SOFT * t),
    go(c, (SOFT - 5) * t, -1), hold(300 * t, 900 * t), go(POSE(5) + between(1, 4), SOFT * t, 1)] }; },
  // Simple glissement d'un sourire calme à un autre.
  () => { const c = calmSpot(); return { key: `calme${c}`, ops: (t) => [go(c, SLOW * t), hold(500 * t, 1400 * t)] }; },
];
const RECENT_KEY = 'sonia-gestes';
let recent: string[] = [];
try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { /* rien d'enregistré */ }
function gesture(count: [number, number], lively: boolean): Op[] {
  for (let tries = 0; tries < 40; tries++) {
    const n = Math.round(rnd(count[0], count[1]));
    const tempo = rnd(0.8, 1.3);
    const pool = lively ? MOMENTS.slice(0, 6) : MOMENTS;
    const parts: Moment[] = [];
    for (let i = 0; i < n; i++) {
      let m = pick(pool)();
      if (parts.length && m.key.replace(/[\d.]+.*$/, '') === parts[parts.length - 1].key.replace(/[\d.]+.*$/, '')) m = pick(pool)();
      parts.push(m);
    }
    const key = `${parts.map((p) => p.key).join('|')}@${tempo.toFixed(1)}`;
    if (recent.includes(key) && tries < 39) continue;
    recent = [key, ...recent].slice(0, 400);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* stockage indisponible */ }
    return parts.flatMap((p, i) => (i ? [go(calmSpot(), SOFT * tempo), hold(150, 700)] : []).concat(p.ops(tempo)));
  }
  return [];
}

const SCRIPT: Record<Mood, () => Op[]> = {
  accueil: () => gesture([2, 3], true).concat(go(calmSpot(), SLOW, 1), hold(600, 1200)),
  joie: () => gesture([1, 2], true).concat(go(calmSpot(), SLOW)),
  surprise: () => [go(POSE(8), SOFT, 1), go(between(POSE(1) + 3, POSE(2)), LIVE - 4, 1), hold(350, 600)],
  repos: () => (Math.random() < 0.22 ? gesture([1, 1], false) : [go(calmSpot(), SLOW * rnd(0.85, 1.3)), hold(1600, 3800)]),
  ecoute: () => [go(between(POSE(6), POSE(7) + 3), SLOW * rnd(0.9, 1.3)), hold(1300, 2800)],
  reflexion: () => [go(POSE(5), SOFT), go(between(POSE(4) + 1, POSE(4) + 3), SLOW, -1), hold(900, 1600), go(POSE(5) + between(1, 3), SLOW, 1), hold(700, 1300)],
  parle: () => {
    if (pos > POSE(2) + 1 && pos < POSE(8)) return [go(POSE(8), SOFT, 1), go(POSE(0), LIVE, 1)];
    if (Math.random() < 0.15) return [go(between(POSE(1) + 3, POSE(2)), LIVE, 1), hold(150, 300), go(POSE(1), LIVE, -1)];
    return [go(between(POSE(1) - 2, POSE(1) + 1), LIVE * rnd(0.85, 1.2)), hold(40, 160), go(between(POSE(0), POSE(0) + 2), LIVE), hold(40, 140)];
  },
  'parle-doux': () => {
    if (pos > POSE(2) && pos < POSE(8)) return [go(POSE(8), SLOW, 1), go(POSE(0), SOFT, 1)];
    return [go(between(POSE(0) + 3, POSE(1) - 1), SOFT), hold(120, 260), go(between(POSE(8) + 3, FRAMES + 1), SOFT), hold(120, 300)];
  },
};
/* Quand elle cesse de parler, elle referme la bouche en repassant par la pose 8 (chemin inverse). */
const leaveTalk = (): Op[] => (pos < POSE(2) + 1 || pos > POSE(8) ? [go(POSE(8), SOFT, -1)] : []);

let faceMood: Mood = mood;
let raf = 0, last = 0;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function refill(now: number) {
  const calmish = faceMood === 'repos' || faceMood === 'ecoute';
  if (calmish && now > blinkAt) { blinkAt = now + rnd(3200, 6500); queue = blink(); return; }
  queue = SCRIPT[faceMood]();
}
function next(now: number) {
  if (!queue.length) refill(now);
  const op = queue.shift()!;
  if ('hold' in op) { cur = { hold: op.hold, t: 0 }; return; }
  const f = pos;
  const fwd = wrap(op.go - f), back = wrap(f - op.go);
  let dir = op.dir ?? (fwd <= back ? 1 : -1);
  // Un sens imposé ne doit jamais faire faire tout le tour pour quelques demi-images.
  if (op.dir === 1 && back < 4 && fwd > 27) dir = -1;
  if (op.dir === -1 && fwd < 4 && back > 27) dir = 1;
  const dist = dir === 1 ? fwd : -back;
  cur = { from: f, dist, ms: Math.max(1, Math.abs(dist)) * op.ms, t: 0 };
}
function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(now - last, 50); last = now;
  if (!cur) next(now);
  const c = cur!;
  c.t += dt;
  if ('hold' in c) { if (c.t >= c.hold) cur = null; return; }
  const k = Math.min(c.t / c.ms, 1);
  pos = wrap(c.from + c.dist * ease(k));
  faceListeners.forEach((l) => l(pos));
  if (k >= 1) cur = null;
}

export const face = {
  /** Abonne un portrait à la position du visage (partagée : tous les portraits bougent ensemble). */
  on(l: (p: number) => void) {
    faceListeners.add(l); l(pos);
    if (!reduced && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    return () => { faceListeners.delete(l); if (!faceListeners.size) { cancelAnimationFrame(raf); raf = 0; } };
  },
};
sonia.onMood((m) => {
  if (m === faceMood && !SHORT[m]) return; // un accueil ou une joie redemandés = un nouveau geste
  const wasTalking = faceMood === 'parle' || faceMood === 'parle-doux';
  faceMood = m;
  queue = wasTalking && m !== 'parle' && m !== 'parle-doux' ? leaveTalk() : [];
  cur = null;
});
