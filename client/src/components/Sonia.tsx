import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Download, Trash2, FileSpreadsheet, FileText, Loader2, LogIn, Mic, Move, Paperclip, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEvents } from '../events';
import { daysUntil, fmtDate, isLate, type EventData } from '../demo';
import type { PlatformEvent } from '../events';
import SoniaLive from '../sonia/SoniaLive';
import { sonia } from '../sonia/live';
import { ApiError, appEnv, askAi, askAiPublic } from '../cloud/neon';

/** Sonia sans compte : seulement sur le site de test, pour permettre aux testeurs de l'essayer. */
const TRIAL = appEnv === 'test';
import { FILE_TOOLS, TOOLS, contextFor, execute, summarize, type ProposedAction } from '../sonia/actions';
import { saveBlob } from '../excel';
import { GREETING_UID, loadLocal, mergeChat, newUid, pullRemote, pushRemote, saveLocal, type StoredChat } from '../sonia/chatStore';
import type { BilanFile, BilanFormat } from '../bilanFiles';
import { ACCEPTED, readFile } from '../sonia/readFiles';

/* Sonia, l'assistante de la plateforme.
   - Visage vivant : 100 expressions (src/sonia/expressions.ts), clignements, parole.
   - Bouton déplaçable partout à l'écran ; sa place est retenue sur cet appareil.
   Maquette : tant que la clé API n'est pas branchée, Sonia répond à partir des données
   de l'événement actif (mode démo). Sa personnalité est définie côté serveur (server/src/sonia.ts). */

interface Attachment { name: string; size: number }
interface Msg {
  /** Identifiant unique partagé entre appareils, date de création et de dernière modification (ms). */
  uid: string; at: number; t?: number;
  id: number; from: 'sonia' | 'me'; text: string; files?: Attachment[]; voice?: boolean;
  /** Contenu lu dans les fichiers joints (renvoyé à Sonia avec l'historique). */
  extra?: string;
  /** Images jointes (réduites), renvoyées tant que la conversation porte dessus. */
  images?: string[];
  /** Actions proposées par Sonia, appliquées seulement après autorisation. */
  actions?: ProposedAction[];
  /** Résumés figés au moment de la proposition (ce que la personne a lu). */
  summaries?: string[];
  decision?: 'pending' | 'running' | 'done' | 'refused';
  /** Résultat de chaque action : message d'erreur, ou rien si elle a été appliquée. */
  results?: (string | undefined)[];
  /** Actions cochées (toutes par défaut). */
  chosen?: boolean[];
  /** Affiche le bouton « Se connecter » sous le message. */
  signIn?: boolean;
  /** Fichiers du bilan générés dans le chat (prêts à télécharger). */
  downloads?: FileSlot[];
  /** Propose de choisir le format du bilan (PDF, Word, Excel). */
  bilanChoice?: boolean;
}
interface FileSlot { format: BilanFormat; file?: BilanFile; error?: string; /** Nom du fichier (synchronisé : sur un autre appareil, le fichier se recrée en un clic). */ name?: string }

/* Conversations gardées sur l'appareil (IndexedDB), une par événement : elles ne disparaissent jamais d'elles-mêmes
   (rechargement, changement d'événement, hors connexion). Seule la personne peut les effacer, avec le bouton corbeille. */
/* Avec un compte, elles sont aussi synchronisées (privées) pour les retrouver sur tous ses appareils : voir src/sonia/chatStore.ts. */
/** Nouveau message : identifiant unique et date de création. */
const stamp = () => ({ uid: newUid(), at: Date.now() });
/** Après un rechargement ou une synchronisation : ce qui était en cours est marqué comme interrompu ; numéros d'affichage refaits. */
const restore = (list: Msg[]): Msg[] => list.map((m, i) => ({
  ...m,
  uid: m.uid ?? (m.id === 1 ? GREETING_UID : newUid()),
  at: m.at ?? (m.id === 1 ? 0 : i),
  id: i + 1,
  decision: m.decision === 'running' ? 'done' : m.decision,
  downloads: m.downloads?.map((d) => (d.file || d.error || d.name ? d : { ...d, error: 'création interrompue, redemandez le fichier.' })),
}));
/** Contenu d'un message sans ses dates : sert à savoir s'il a changé. */
const fingerprint = (m: Msg) => JSON.stringify({ ...m, id: undefined, t: undefined, images: m.images?.length, downloads: m.downloads?.map((d) => [d.format, d.name, d.error, !!d.file]) });

const FORMATS: { id: BilanFormat; label: string }[] = [{ id: 'pdf', label: 'PDF' }, { id: 'word', label: 'Word' }, { id: 'excel', label: 'Excel' }];
/** Demande explicite du fichier du bilan (« génère le bilan en PDF », « le rapport en Word et Excel »…) : traitée sur l'appareil,
    sans connexion ni compte. Renvoie les formats demandés ([] = à choisir), ou null si ce n'est pas une demande de fichier. */
function bilanRequest(q: string): BilanFormat[] | null {
  const t = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!/\b(bilan|rapport|compte[- ]?rendu)\b/.test(t)) return null;
  const formats = FORMATS.map((f) => f.id).filter((id) => (id === 'pdf' ? /\bpdf\b/ : id === 'word' ? /\b(word|docx|doc)\b/ : /\b(excel|xlsx|tableur)\b/).test(t));
  if (formats.length) return formats;
  return /\b(fichier|telecharg\w*|export\w*|generer?|genere[sz]?|imprim\w*)\b/.test(t) ? [] : null;
}

const fmtSize = (n: number) => (n < 1024 ? `${n} o` : n < 1024 ** 2 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`);

/* ——— Voix : dictée (reconnaissance vocale du navigateur) et réponse parlée ———
   Tout se passe dans le navigateur : aucun son n'est envoyé ni enregistré par la plateforme. */
type Recognizer = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
const Recognition = (window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognizer }).webkitSpeechRecognition;
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
/** Une voix féminine française, si le système en propose une. */
function frenchVoice() {
  const voices = synth?.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr')) ?? [];
  const female = /am[ée]lie|audrey|aur[ée]lie|marie|julie|denise|eloise|[ée]lo[iï]se|virginie|c[ée]line|hortense|sylvie|chantal|female|femme|google fran/i;
  return voices.find((v) => female.test(v.name)) ?? voices[0];
}

const SUGGESTIONS = ['Où en est-on ?', 'Qu’est-ce qui est en retard ?', 'Qui dois-je relancer ?', 'Rédiger un message à un sponsor'];
const SIZE = 72;      // diamètre du bouton
const MARGIN = 16;    // marge minimale avec les bords de l'écran
const POS_KEY = 'sonia-position';
// Sur Netlify (offre gratuite), le badge « Powered by Netlify » occupe le coin en bas à droite :
// on garde Sonia au-dessus de lui.
const BOTTOM = typeof window !== 'undefined' && window.location.hostname.endsWith('.netlify.app') ? 68 : MARGIN;

type Pos = { x: number; y: number }; // position en fraction de l'espace disponible (0 → 1)
const loadPos = (): Pos => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? '');
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return { x: Math.min(Math.max(p.x, 0), 1), y: Math.min(Math.max(p.y, 0), 1) };
  } catch { /* rien d'enregistré */ }
  return { x: 1, y: 1 };
};
const savePos = (p: Pos) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ } };

export default function Sonia() {
  const events = useEvents();
  const { current: event, data, cloud } = events;
  // État de la plateforme à jour, lu pendant l'application des actions (une action peut dépendre de la précédente).
  const liveState = useRef(events);
  liveState.current = events;
  const [open, setOpen] = useState(false);
  // Petite bulle à côté du bouton (accueil, « j'ai fini », « je suis là »).
  const [bubble, setBubble] = useState<{ title: string; text: string } | null>(null);
  const [nudging, setNudging] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastAttention = useRef(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const busy = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Conversation vocale : le micro écoute, Sonia répond à voix haute, puis réécoute.
  const [voice, setVoice] = useState(false);
  const [hearing, setHearing] = useState(false);
  const voiceOn = useRef(false);
  const rec = useRef<Recognizer | null>(null);

  /* ——— Position du bouton (glisser-déposer fluide) ——— */
  const [pos, setPos] = useState<Pos>(loadPos);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [dragging, setDragging] = useState(false);
  const launcher = useRef<HTMLDivElement>(null);
  const anim = useRef({ x: 0, y: 0, tx: 0, ty: 0, raf: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const span = useCallback(() => ({ w: Math.max(vp.w - SIZE - 2 * MARGIN, 1), h: Math.max(vp.h - SIZE - MARGIN - BOTTOM, 1) }), [vp]);
  const toPx = useCallback((p: Pos) => ({ x: MARGIN + p.x * span().w, y: MARGIN + p.y * span().h }), [span]);
  const clampPx = (x: number, y: number) => ({
    x: Math.min(Math.max(x, MARGIN), vp.w - SIZE - MARGIN),
    y: Math.min(Math.max(y, MARGIN), vp.h - SIZE - BOTTOM),
  });

  // Le bouton glisse vers sa cible avec un léger amorti (aucun saut).
  const glide = useCallback((x: number, y: number, immediate = false) => {
    const a = anim.current;
    a.tx = x; a.ty = y;
    const el = launcher.current;
    if (!el) return;
    if (immediate) { a.x = x; a.y = y; el.style.transform = `translate3d(${x}px, ${y}px, 0)`; return; }
    if (a.raf) return;
    const step = () => {
      a.x += (a.tx - a.x) * 0.28; a.y += (a.ty - a.y) * 0.28;
      if (Math.abs(a.tx - a.x) < 0.2 && Math.abs(a.ty - a.y) < 0.2) { a.x = a.tx; a.y = a.ty; }
      el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
      a.raf = a.x === a.tx && a.y === a.ty ? 0 : requestAnimationFrame(step);
    };
    a.raf = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const placed = useRef(false);
  useEffect(() => { const p = toPx(pos); glide(p.x, p.y, !placed.current); placed.current = true; }, [pos, toPx, glide]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: anim.current.tx, oy: anim.current.ty, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; setDragging(true); setBubble(null); sonia.set('surprise'); }
    const p = clampPx(d.ox + dx, d.oy + dy);
    glide(p.x, p.y);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    setDragging(false);
    const s = span();
    const next = { x: (anim.current.tx - MARGIN) / s.w, y: (anim.current.ty - MARGIN) / s.h };
    setPos(next); savePos(next);
    sonia.set('joie');
  };
  // Clavier : Alt + flèches pour déplacer Sonia.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!e.altKey) return;
    const k = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
    if (!k) return;
    e.preventDefault();
    const next = { x: Math.min(Math.max(pos.x + k[0], 0), 1), y: Math.min(Math.max(pos.y + k[1], 0), 1) };
    setPos(next); savePos(next);
  };
  const resetPos = () => { const p = { x: 1, y: 1 }; setPos(p); savePos(p); };

  /* ——— Visage : humeurs selon ce qui se passe ——— */
  // À l'ouverture de l'application : Sonia accueille avec le sourire.
  useEffect(() => { sonia.set('accueil'); }, []);
  // Au repos, Sonia vit seule (petits mouvements de tête, yeux qui se ferment, clin d'œil) : voir src/sonia/live.ts.

  // Une conversation par événement : changer d'événement repart de zéro (aucun mélange de données).
  // Conversation de l'événement actif : relue sur l'appareil, sinon Sonia commence par son accueil.
  const loadedFor = useRef<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const signedIn = !!cloud.email;
  // État de la synchronisation de la conversation affichée.
  const sync = useRef({ clearedAt: 0, dirty: false, stamps: new Map<string, { fp: string; t: number }>(), pushing: false, again: false, lastPull: 0 });
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const greetingMsg = (): Msg => ({ uid: GREETING_UID, at: 0, id: 1, from: 'sonia', text: greeting(event, data) });
  /** Applique une conversation (relue ou fusionnée) à l'écran, sans la considérer comme modifiée ici. */
  const apply = (list: Msg[]) => {
    const shown = restore(list.length ? list : [greetingMsg()]);
    sync.current.stamps = new Map(shown.map((m) => [m.uid, { fp: fingerprint(m), t: m.t ?? m.at }]));
    nextId.current = shown.length + 1;
    setMsgs(shown);
  };
  /** Envoi au serveur (compte connecté, en ligne) ; le serveur renvoie la version fusionnée de tous les appareils. */
  const push = async (eventId: string) => {
    const st = sync.current;
    if (!signedIn || !navigator.onLine || loadedFor.current !== eventId) return;
    if (st.pushing) { st.again = true; return; }
    st.pushing = true;
    try {
      const sent = withStamps(msgsRef.current);
      const r = await pushRemote<Msg>(eventId, sent, st.clearedAt);
      if (loadedFor.current !== eventId) return;
      st.clearedAt = Math.max(st.clearedAt, r.clearedAt);
      st.dirty = false;
      const merged = mergeChat(withStamps(msgsRef.current), r.messages, st.clearedAt);
      saveLocal(eventId, { messages: merged, clearedAt: st.clearedAt, dirty: false });
      // Nouveautés venues d'un autre appareil : affichées (pas pendant une réponse en cours).
      if (!busy.current && fingerprintAll(merged) !== fingerprintAll(msgsRef.current)) apply(merged);
    } catch { /* hors connexion ou serveur injoignable : nouvel essai au prochain changement ou au retour d'internet */ }
    finally {
      st.pushing = false;
      if (st.again) { st.again = false; push(eventId); }
    }
  };
  const withStamps = (list: Msg[]) => list.map((m) => ({ ...m, t: sync.current.stamps.get(m.uid)?.t ?? m.at }));
  const fingerprintAll = (list: Msg[]) => list.map((m) => `${m.uid}:${fingerprint(m)}`).join('|');
  /** Relit la version du serveur et la fusionne (ouverture du panneau, retour sur l'onglet, retour d'internet). */
  const pull = async (eventId: string, force = false) => {
    const st = sync.current;
    if (!signedIn || !navigator.onLine || loadedFor.current !== eventId || busy.current) return;
    if (!force && Date.now() - st.lastPull < 15_000) return;
    st.lastPull = Date.now();
    try {
      const r = await pullRemote<Msg>(eventId);
      if (loadedFor.current !== eventId || busy.current) return;
      st.clearedAt = Math.max(st.clearedAt, r.clearedAt);
      const local = withStamps(msgsRef.current);
      const merged = mergeChat(local, r.messages, st.clearedAt);
      if (fingerprintAll(merged) !== fingerprintAll(msgsRef.current)) { apply(merged); saveLocal(eventId, { messages: merged, clearedAt: st.clearedAt, dirty: st.dirty }); }
      // Ce que cet appareil a et que le serveur n'a pas encore : envoyé.
      if (st.dirty || merged.length !== r.messages.length) push(eventId);
    } catch { /* on garde la copie de l'appareil */ }
  };

  // Conversation de l'événement actif : relue sur l'appareil puis fusionnée avec le serveur ; sinon Sonia commence par son accueil.
  useEffect(() => {
    const eventId = event.id;
    loadedFor.current = null; setTyping(false); setFiles([]); busy.current = false; setConfirmClear(false);
    let alive = true;
    loadLocal<Msg>(eventId).then((saved) => {
      if (!alive) return;
      sync.current = { clearedAt: saved?.clearedAt ?? 0, dirty: saved?.dirty ?? false, stamps: new Map(), pushing: false, again: false, lastPull: 0 };
      apply(saved?.messages ?? []);
      loadedFor.current = eventId;
      pull(eventId, true);
    });
    return () => { alive = false; };
  }, [event.id, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Chaque changement est enregistré tout de suite sur l'appareil, puis envoyé au serveur (fichiers et images restent sur l'appareil).
  useEffect(() => {
    const eventId = event.id;
    if (loadedFor.current !== eventId || !msgs.length) return;
    const st = sync.current;
    let changed = false;
    const now = Date.now();
    for (const m of msgs) {
      const fp = fingerprint(m), prev = st.stamps.get(m.uid);
      if (!prev || prev.fp !== fp) { st.stamps.set(m.uid, { fp, t: prev ? Math.max(now, prev.t + 1) : m.at }); changed = true; }
    }
    if (!changed) return;
    st.dirty = true;
    saveLocal(eventId, { messages: withStamps(msgs), clearedAt: st.clearedAt, dirty: true });
    const timer = setTimeout(() => push(eventId), 800);
    return () => clearTimeout(timer);
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Retour sur l'onglet ou retour d'internet : on récupère ce qui a été écrit ailleurs, et on envoie ce qui attendait.
  useEffect(() => {
    const again = () => { const id = loadedFor.current; if (id) { if (sync.current.dirty) push(id); pull(id); } };
    window.addEventListener('focus', again); window.addEventListener('online', again);
    return () => { window.removeEventListener('focus', again); window.removeEventListener('online', again); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && loadedFor.current) pull(loadedFor.current); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Effacement décidé par la personne (après confirmation) : définitif, sur cet appareil et, avec un compte, sur tous ses appareils. */
  const clearChat = () => {
    sync.current.clearedAt = Date.now();
    const fresh = [greetingMsg()];
    apply(fresh);
    sync.current.stamps.set(GREETING_UID, { fp: fingerprint(restore(fresh)[0]), t: sync.current.clearedAt });
    sync.current.dirty = true;
    saveLocal(event.id, { messages: withStamps(restore(fresh)), clearedAt: sync.current.clearedAt, dirty: true });
    const eventId = event.id;
    setTimeout(() => push(eventId), 0); // après l'affichage de la conversation vide
    setConfirmClear(false);
  };

  /* ——— Attirer l'attention, avec retenue (comme une notification discrète) ———
     Sonia bouge un peu, sourit et montre une bulle. Jamais quand le panneau est ouvert,
     et pas plus d'une fois toutes les 2 minutes, sauf pour annoncer une réponse prête. */
  const attention = useCallback((title: string, text: string, important = false) => {
    if (openRef.current) return;
    const now = Date.now();
    if (!important && now - lastAttention.current < 120_000) return;
    lastAttention.current = now;
    setBubble({ title, text });
    setNudging(false); requestAnimationFrame(() => setNudging(true));
    setTimeout(() => setNudging(false), 1600);
    sonia.set('joie');
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), important ? 12_000 : 8_000);
  }, []);

  // Après une longue absence (5 min sans activité), un simple « je suis là », une seule fois par session.
  useEffect(() => {
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const evts = ['pointerdown', 'keydown', 'wheel'] as const;
    evts.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const iv = setInterval(() => {
      let done = false;
      try { done = sessionStorage.getItem('sonia-coucou') === '1'; } catch { /* stockage indisponible */ }
      if (done || openRef.current || Date.now() - last < 5 * 60_000) return;
      try { sessionStorage.setItem('sonia-coucou', '1'); } catch { /* stockage indisponible */ }
      attention('Coucou, je suis là', 'Si vous avez besoin de moi, je suis juste ici.');
    }, 20_000);
    return () => { clearInterval(iv); evts.forEach((e) => window.removeEventListener(e, touch)); };
  }, [attention]);

  // Petite bulle d'accueil, une seule fois par session.
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('sonia-hello') === '1'; } catch { /* stockage indisponible */ }
    if (seen) return;
    const a = setTimeout(() => {
      setBubble({ title: 'Bonjour, je suis Sonia', text: `Je vous aide à suivre « ${event.name} ».` });
      try { sessionStorage.setItem('sonia-hello', '1'); } catch { /* stockage indisponible */ }
    }, 1400);
    const b = setTimeout(() => setBubble(null), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    setBubble(null); setUnread(0); clearTimeout(bubbleTimer.current);
    sonia.set('accueil');
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); stopVoice(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, typing]);

  // Pendant que l'utilisatrice écrit, Sonia l'écoute.
  const listening = useRef(false);
  const onDraft = (v: string) => {
    setDraft(v);
    if (v.trim() && !listening.current && !typing) { listening.current = true; busy.current = true; sonia.set('ecoute'); }
    if (!v.trim() && listening.current) { listening.current = false; busy.current = false; sonia.set('repos'); }
  };

  const say = (text: string) => setMsgs((m) => [...m, { ...stamp(), id: nextId.current++, from: 'sonia', text }]);

  /* ——— Micro ——— */
  function listen() {
    if (!Recognition || !voiceOn.current) return;
    const r = new Recognition();
    r.lang = 'fr-FR'; r.interimResults = true; r.continuous = false;
    let heard = '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      heard = text; setDraft(text);
      if (!listening.current) { listening.current = true; sonia.set('ecoute'); }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopVoice();
        say('Je n’ai pas accès à votre micro. Autorisez-le dans votre navigateur (l’icône à gauche de l’adresse), puis appuyez de nouveau sur le micro.');
      }
    };
    r.onend = () => {
      rec.current = null; setHearing(false);
      if (!voiceOn.current) return;
      if (heard.trim()) askRef.current(heard, true);
      else listen(); // silence : on continue d'écouter tant que le mode vocal est actif
    };
    rec.current = r; setHearing(true);
    try { r.start(); } catch { setHearing(false); }
  }
  function stopVoice() {
    voiceOn.current = false; setVoice(false); setHearing(false);
    rec.current?.abort(); rec.current = null;
    synth?.cancel();
  }
  const toggleVoice = () => {
    if (voice) { stopVoice(); sonia.set('repos'); return; }
    if (!Recognition) {
      say('La conversation à voix haute n’est pas disponible dans ce navigateur. Elle fonctionne avec Chrome, Edge ou Safari.');
      return;
    }
    voiceOn.current = true; setVoice(true);
    synth?.getVoices(); // charge la liste des voix
    sonia.set('ecoute');
    listen();
  };
  /** Sonia lit sa réponse ; ses lèvres bougent tant qu'elle parle, puis elle réécoute. */
  function speak(text: string, tone: ReturnType<typeof replyMood>, done: () => void) {
    if (!synth) { done(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[•«»]/g, ' ').replace(/\n+/g, '. '));
    u.lang = 'fr-FR'; u.rate = 1; u.pitch = 1.05;
    const v = frenchVoice(); if (v) u.voice = v;
    u.onstart = () => sonia.set(tone === 'delicate' ? 'parle-doux' : 'parle');
    u.onend = u.onerror = () => { done(); if (voiceOn.current) setTimeout(listen, 350); };
    synth.speak(u);
  }

  /* ——— Pièces jointes : Excel, Word, CSV, texte ou images, lus sur l'appareil ; seul leur contenu part avec la question ——— */
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Copie immédiate : vider le champ juste après viderait aussi cette liste.
    const added = Array.from(list);
    setFiles((f) => [...f, ...added].slice(0, 5));
    if (fileRef.current) fileRef.current.value = '';
    inputRef.current?.focus();
  };

  const ask = (text: string, spoken = false) => {
    const q = text.trim();
    const raw = files;
    const att = raw.map((f) => ({ name: f.name, size: f.size }));
    if ((!q && !att.length) || typing) return;
    const myId = nextId.current++;
    setMsgs((m) => [...m, { ...stamp(), id: myId, from: 'me', text: q, files: att.length ? att : undefined, voice: spoken || undefined }]);
    setFiles([]);
    setDraft(''); if (inputRef.current) inputRef.current.style.height = '36px';
    listening.current = false;
    busy.current = true;
    setTyping(true);
    sonia.set('reflexion');
    const eventId = event.id;
    // Connectée aux services en ligne : réponse par la passerelle IA (Neon). Sinon, ou en cas d'échec : réponse locale (mode démo).
    // Pourquoi Sonia ne peut pas utiliser son service en ligne (dit clairement, avec ce qu'il faut faire).
    const why = !navigator.onLine ? 'Vous êtes hors connexion : dès le retour d’internet, je pourrai répondre à tout et agir dans la plateforme.'
      : !cloud.enabled ? 'Mon service en ligne n’est pas configuré pour cette version de la plateforme.'
      : !cloud.email ? 'Pour que je réponde à tout et que je puisse agir dans la plateforme (badges, tâches, fichiers…), connectez-vous avec le bouton « Se connecter » en haut de l’écran.'
      : '';
    const local = () => {
      const base = att.length ? filesReply(att, q) : demoReply(q, event, data);
      const hello = /^\s*(salut|bonjour|bonsoir|hello|hi|coucou|hey|yo|bjr|slt)\b/i.test(q);
      const thanks = /^\s*(merci|thanks|super|parfait|ok|d'accord|top)\b/i.test(q);
      // Réponse générique du mode démo : remplacée par une vraie réponse aux salutations, et par la vraie raison.
      const text = hello && why ? `Bonjour ! Je suis Sonia, ravie de vous voir.\n${why}`
        : thanks && why ? `Avec plaisir !\n${why}`
        : base === DEMO_FALLBACK && why ? `${why}\nEn attendant, essayez l’une des suggestions juste en dessous.`
        : att.length && why ? `Merci, j’ai bien reçu ${att.map((f) => `« ${f.name} »`).join(', ')}. ${why}` : base;
      return { text, actions: [] as ProposedAction[], signIn: !!why && navigator.onLine && cloud.enabled && !cloud.email };
    };
    const pause = new Promise((r) => setTimeout(r, 1100 + Math.min(q.length * 12, 900)));
    // Historique récent (avec le sort des actions proposées), pour que « oui, fais-le » ou « ajoute aussi… » soient compris.
    const history = msgs.slice(-12).map((m) => ({
      role: m.from === 'me' ? 'user' as const : 'assistant' as const,
      content: m.text + (m.extra ? `\n\n${m.extra}` : '') + (m.downloads?.some((d) => d.file) ? `\n[Fichiers du bilan générés dans le chat : ${m.downloads.flatMap((d) => (d.file ? [d.file.name] : [])).join(', ')}]` : '') + (m.summaries?.length ? `\n[Actions proposées — ${m.decision === 'done' ? 'autorisées et appliquées' : m.decision === 'refused' ? 'refusées, rien n’a été appliqué' : 'en attente d’autorisation, PAS ENCORE appliquées (ces éléments n’existent pas encore : pour corriger, repropose la même action corrigée)'} : ${m.summaries.join(' | ')}]` : ''),
    }));
    // Images de la conversation en cours (une capture envoyée juste avant), pour pouvoir répondre à « mets-les tous en Staff ».
    const recentImages = msgs.slice(-4).reverse().find((m) => m.images?.length)?.images ?? [];
    const online = async () => {
      const read = await Promise.all(raw.map(readFile));
      const extra = read.filter((r) => r.text).map((r) => `Fichier joint « ${r.name} » :\n${r.text}`).join('\n\n');
      const images = read.flatMap((r) => (r.image ? [r.image] : []));
      const errors = read.filter((r) => r.error).map((r) => `« ${r.name} » : ${r.error}`);
      if (extra || images.length) setMsgs((m) => m.map((x) => (x.id === myId ? { ...x, extra: extra || undefined, images: images.length ? images : undefined } : x)));
      const note = errors.length ? `Je n’ai pas pu lire ${errors.length > 1 ? 'ces fichiers' : 'ce fichier'} :\n${errors.join('\n')}` : '';
      if (raw.length && !extra && !images.length) return { text: note, actions: [] as ProposedAction[] };
      const names = read.filter((r) => r.image).map((r) => `« ${r.name} »`).join(', ');
      const question = [q || 'Voici des fichiers joints.', extra, images.length ? `(Image${images.length > 1 ? 's' : ''} jointe${images.length > 1 ? 's' : ''} : ${names})` : ''].filter(Boolean).join('\n\n');
      // Sans compte (site de test) : route publique, les actions s'appliquent sur l'appareil uniquement.
      const r = await (cloud.email ? askAi : askAiPublic)(question, contextFor(liveState.current), history, TOOLS, images.length ? images : recentImages);
      return note ? { ...r, text: `${note}\n\n${r.text}` } : r;
    };
    const wanted = att.length ? null : bilanRequest(q);
    const answer: Promise<{ text: string; actions: ProposedAction[]; signIn?: boolean; files?: BilanFormat[] }> = wanted
      ? new Promise((r) => setTimeout(r, 500)).then(() => ({ text: wanted.length ? `Voici le bilan de « ${event.name} » : cliquez pour le télécharger.` : `Avec plaisir ! En quel format voulez-vous le bilan de « ${event.name} » ?`, actions: [], files: wanted }))
      : navigator.onLine && (cloud.email || (cloud.enabled && TRIAL))
      ? online().catch((e) => {
          const r = local();
          // Sans compte et route publique fermée (production) : simple invitation à se connecter, sans message d'erreur.
          if (!cloud.email && e instanceof ApiError && e.status === 404) return r;
          if (!cloud.email && e instanceof ApiError && e.status === 429) return { ...r, text: `${e.message}`, signIn: true };
          return { ...r, text: `${r.text}\n\n(Je n’ai pas pu joindre mon service en ligne${e instanceof Error && e.message ? ` : ${e.message}` : ''} ; je ne peux donc rien modifier pour l’instant.)` };
        })
      : pause.then(local);
    answer.then((res) => {
      const { text: replyText, actions } = res;
      const signIn = 'signIn' in res && !!res.signIn;
      const named = actions.filter((a) => a && typeof a.name === 'string');
      // Fichiers demandés (par la demande elle-même, ou par Sonia avec l'outil generer_bilan) : générés tout de suite, rien n'est modifié.
      const fileCalls = named.filter((a) => FILE_TOOLS.has(a.name));
      const valid = named.filter((a) => !FILE_TOOLS.has(a.name));
      const askedFormats = [...('files' in res && res.files ? res.files : []), ...fileCalls.flatMap((a) => (Array.isArray(a.args?.formats) ? a.args.formats : []))]
        .filter((f): f is BilanFormat => FORMATS.some((x) => x.id === f));
      const formats = [...new Set(askedFormats)];
      const wantsFile = ('files' in res && !!res.files) || fileCalls.length > 0;
      const reply = replyText || (valid.length ? 'Voici ce que je vous propose. Vérifiez, puis autorisez si tout est juste.' : wantsFile ? (formats.length ? 'Voici le bilan : cliquez pour le télécharger.' : 'En quel format voulez-vous le bilan ?') : '…');
      // Événement changé entre-temps : la réponse est rangée dans la conversation de l'événement d'origine, rien ne se perd.
      if (eventId !== liveState.current.current.id) {
        loadLocal<Msg>(eventId).then((saved) => {
          const prev: StoredChat<Msg> = saved ?? { messages: [], clearedAt: 0, dirty: true };
          const note = actions.length ? '\n\n(Je vous proposais aussi des modifications pendant que vous changiez d’événement : redemandez-les ici pour les autoriser.)' : '';
          const late: Msg = { ...stamp(), id: prev.messages.length + 1, from: 'sonia', text: (replyText || '…') + note };
          // Enregistrée sur l'appareil, envoyée au serveur au prochain affichage de cet événement.
          return saveLocal(eventId, { ...prev, messages: [...prev.messages, late], dirty: true });
        }).catch(() => undefined);
        setTyping(false); busy.current = false;
        return;
      }
      // Si vous avez fermé le panneau entre-temps, Sonia vous prévient que c'est prêt.
      if (!openRef.current) {
        setUnread((u) => u + 1);
        attention('J’ai fini !', 'Votre réponse est prête. Cliquez pour la lire.', true);
      }
      const replyId = nextId.current++;
      setMsgs((m) => [...m, { ...stamp(), id: replyId, from: 'sonia', text: reply, signIn: signIn || undefined,
        ...(wantsFile ? formats.length ? { downloads: formats.map((format) => ({ format })) } : { bilanChoice: true } : {}),
        ...(valid.length ? {
        // Une action impossible (nom introuvable ou porté par plusieurs éléments) est décochée et bloquée : elle ne peut pas être autorisée.
        ...(() => { const summaries = valid.map((a) => summarize(a, liveState.current)); return { summaries, chosen: summaries.map((x) => !x.includes('⚠')) }; })(),
        actions: valid, decision: 'pending' as const,
      } : {}) }]);
      setTyping(false);
      if (formats.length) makeFiles(replyId, formats);
      if (!openRef.current) { busy.current = false; return; } // panneau fermé : elle sourit et montre la bulle, sans « parler »
      const tone = att.length ? 'bonne' : replyMood(q, data);
      const after = () => {
        if (sonia.mood === 'parle' || sonia.mood === 'parle-doux') sonia.set(tone === 'bonne' ? 'joie' : voiceOn.current ? 'ecoute' : 'repos');
        busy.current = false;
      };
      // En conversation vocale, elle dit sa réponse à voix haute.
      if (spoken && voiceOn.current) { speak(reply, tone, after); return; }
      // Sinon elle « dit » sa réponse en silence, puis garde l'émotion du message (joie, douceur…).
      const talkMs = Math.min(1200 + reply.length * 28, 6000);
      sonia.set(tone === 'delicate' ? 'parle-doux' : 'parle');
      setTimeout(after, talkMs);
    });
  };
  /* Autorisation : les actions cochées sont appliquées une à une, chacune sur l'état à jour laissé par la précédente. */
  const patchMsg = (id: number, patch: Partial<Msg>) => setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /* Fichiers du bilan : générés dans le navigateur, à partir des données à jour de l'événement actif (fonctionne hors connexion). */
  const makeFiles = async (id: number, formats: BilanFormat[]) => {
    const setSlot = (format: BilanFormat, slot: FileSlot) => setMsgs((list) => list.map((m) => (m.id === id
      ? { ...m, bilanChoice: false, downloads: [...(m.downloads ?? []).filter((d) => d.format !== format), slot].sort((a, b) => FORMATS.findIndex((f) => f.id === a.format) - FORMATS.findIndex((f) => f.id === b.format)) }
      : m)));
    formats.forEach((format) => setSlot(format, { format }));
    const { buildBilan } = await import('../bilanFiles');
    for (const format of formats) {
      const { current, data: d } = liveState.current;
      try { const file = await buildBilan(format, current, d); setSlot(format, { format, file, name: file.name }); }
      catch (e) { setSlot(format, { format, error: e instanceof Error ? e.message : 'Création impossible.' }); }
    }
  };
  const approve = async (msg: Msg) => {
    if (msg.decision !== 'pending' || !msg.actions) return;
    patchMsg(msg.id, { decision: 'running' });
    const results: (string | undefined)[] = [];
    for (const [i, a] of msg.actions.entries()) {
      if (!msg.chosen?.[i]) { results.push('Non retenue.'); continue; }
      results.push(execute(a, liveState.current));
      // Laisse la plateforme se mettre à jour avant l'action suivante.
      await new Promise((r) => setTimeout(r, 60));
    }
    patchMsg(msg.id, { decision: 'done', results });
    const ok = results.filter((r) => r === undefined).length, failed = results.filter((r) => r && r !== 'Non retenue.').length;
    say(failed ? `C’est fait pour ${ok} action${ok > 1 ? 's' : ''} ; ${failed} n’${failed > 1 ? 'ont' : 'a'} pas pu être appliquée${failed > 1 ? 's' : ''} (détail ci-dessus).` : ok ? `C’est fait ! ${cloud.email ? 'Les modifications sont enregistrées et seront partagées avec l’équipe.' : 'Les modifications sont enregistrées sur cet appareil (connectez-vous pour les partager avec l’équipe).'}` : 'Aucune action retenue : je n’ai rien changé.');
    sonia.set(failed ? 'reflexion' : 'joie');
  };
  const refuse = (msg: Msg) => { if (msg.decision === 'pending') { patchMsg(msg.id, { decision: 'refused' }); say('Très bien, je n’ai rien modifié.'); } };
  const toggle = (msg: Msg, i: number) => msg.summaries?.[i]?.includes('⚠') ? undefined : patchMsg(msg.id, { chosen: msg.chosen?.map((c, j) => (j === i ? !c : c)) });

  const askRef = useRef(ask);
  askRef.current = ask; // le micro utilise toujours la version à jour (fichiers, événement)
  const submit = (e: FormEvent) => { e.preventDefault(); ask(draft); };

  // Placement du panneau et de la bulle selon l'endroit où se trouve Sonia.
  const onRight = pos.x >= 0.5, onBottom = pos.y >= 0.5;
  const wide = vp.w >= 640;
  const panelStyle: CSSProperties | undefined = wide
    ? { [onRight ? 'right' : 'left']: 24, [onBottom ? 'bottom' : 'top']: 24 }
    : undefined;

  return (
    <>
      {/* Lanceur : portrait vivant, halo doré ; on peut le glisser partout. */}
      <div
        ref={launcher}
        className={`fixed left-0 top-0 z-[45] will-change-transform transition-opacity duration-500 ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        {bubble && !dragging && (
          <button type="button" onClick={() => setOpen(true)} role="status"
            className={`sonia-rise absolute w-max max-w-[230px] text-left bg-white rounded-2xl shadow-[0_18px_40px_-16px_rgba(1,33,43,.45)] ring-1 ring-ink-100 px-4 py-3 text-sm
              ${onRight ? 'right-full mr-3 rounded-br-md' : 'left-full ml-3 rounded-bl-md'} ${pos.y < 0.15 ? 'top-0' : 'bottom-1'}`}>
            <span className="block font-semibold text-brand-900">{bubble.title}</span>
            <span className="block text-ink-500 text-xs mt-0.5">{bubble.text}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => { if (!suppressClick.current) setOpen(true); }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          aria-label="Ouvrir Sonia, votre assistante. Glissez-la pour la déplacer (ou Alt + flèches)."
          title="Glissez Sonia où vous voulez"
          className={`group relative w-[72px] h-[72px] grid place-items-center touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${nudging ? 'sonia-nudge' : ''}`}
        >
          <span className="sonia-halo absolute -inset-3 rounded-full" aria-hidden />
          <span className={`relative w-[72px] h-[72px] rounded-full p-[2.5px] sonia-ring transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.22,1,.36,1)]
            ${dragging ? 'scale-110 shadow-[0_24px_44px_-12px_rgba(1,33,43,.65)]' : 'sonia-breathe shadow-[0_14px_30px_-10px_rgba(1,33,43,.6)] group-hover:scale-105'}`}>
            <span className="block w-full h-full rounded-full overflow-hidden ring-2 ring-white">
              <SoniaLive size={SIZE - 5} zoom={1.12} />
            </span>
          </span>
          {unread > 0
            ? <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-brand-500 text-white text-[11px] font-semibold grid place-items-center ring-2 ring-white" aria-label={`${unread} réponse${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}`}>{unread}</span>
            : <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-accent-500 ring-2 ring-white" aria-hidden />}
          {!dragging && (
            <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 px-3 py-1 rounded-full bg-brand-950 text-white text-xs font-medium whitespace-nowrap opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 ${onRight ? 'right-full mr-3' : 'left-full ml-3'}`}>
              Sonia
            </span>
          )}
        </button>
      </div>

      {/* Panneau de discussion : il s'ouvre du côté où se trouve Sonia. */}
      {open && (
        <section role="dialog" aria-label="Sonia, votre assistante" style={panelStyle}
          className="sonia-rise fixed z-[46] inset-x-2 bottom-2 sm:inset-x-auto sm:w-[390px] h-[min(660px,calc(100dvh-1rem))] sm:h-[min(660px,calc(100dvh-3rem))] flex flex-col rounded-[28px] overflow-hidden bg-[var(--sand)] shadow-[0_30px_80px_-24px_rgba(1,33,43,.6)] ring-1 ring-black/5">
          <header className="relative overflow-hidden bg-brand-950 text-white px-5 pt-5 pb-4 shrink-0">
            <div className="pattern bg-[#2a98b8] opacity-[0.1]" />
            <div className="relative flex items-center gap-4">
              <span className="relative shrink-0">
                <span className="sonia-halo absolute -inset-2 rounded-full" aria-hidden />
                <span className="relative block w-32 h-32 rounded-full p-[3px] sonia-ring">
                  <span className="block w-full h-full rounded-full overflow-hidden ring-2 ring-brand-950">
                    <SoniaLive size={122} />
                  </span>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-elegant italic font-medium text-[34px] leading-none sonia-name">Sonia</div>
                <div className="text-xs text-white/70 mt-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent-400" /> Votre assistante quotidienne de gestion d’événement</div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer Sonia" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition"><X size={18} /></button>
                <button type="button" onClick={() => setConfirmClear(true)} aria-label="Effacer la conversation" title="Effacer la conversation" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition"><Trash2 size={15} /></button>
                <button type="button" onClick={resetPos} aria-label="Replacer Sonia en bas à droite" title="Replacer Sonia en bas à droite" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition"><Move size={15} /></button>
              </div>
            </div>
          </header>
          <div className="chevron-band shrink-0" style={{ height: 10 }} />

          <div className="relative flex-1 min-h-0 flex flex-col">
          {/* Motifs africains en filigrane : ils restent en place pendant que la conversation défile. */}
          <div className="pattern pattern-sm bg-[#a37b22] opacity-[0.09]" aria-hidden />
          {confirmClear && (
            <div role="alertdialog" aria-label="Effacer la conversation" className="relative z-10 mx-4 mt-3 rounded-2xl bg-white ring-1 ring-red-200 shadow-md p-3 text-sm">
              <p className="font-semibold text-ink-900">Effacer toute la conversation avec Sonia ?</p>
              <p className="text-xs text-ink-600 mt-0.5">Pour « {event.name} », sur cet appareil. C’est définitif. Les modifications déjà appliquées dans la plateforme ne sont pas annulées.</p>
              <div className="flex gap-2 mt-2.5">
                <button type="button" onClick={clearChat} className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-red-700 text-white text-xs font-semibold hover:bg-red-800 transition"><Trash2 size={13} /> Effacer</button>
                <button type="button" onClick={() => setConfirmClear(false)} autoFocus className="h-8 px-3.5 rounded-full bg-white ring-1 ring-ink-200 text-ink-700 text-xs font-medium hover:bg-ink-50 transition">Annuler</button>
              </div>
            </div>
          )}
          <div ref={listRef} className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`sonia-rise flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-line text-sm leading-relaxed px-4 py-2.5 ${m.from === 'me'
                  ? 'bg-brand-950 text-white rounded-2xl rounded-br-md'
                  : 'bg-white text-ink-900 rounded-2xl rounded-bl-md ring-1 ring-ink-100 shadow-[0_6px_16px_-10px_rgba(1,33,43,.35)]'}`}>
                  {m.text}
                  {m.files && (
                    <span className={`flex flex-col gap-1.5 ${m.text ? 'mt-2' : ''}`}>
                      {m.files.map((f, i) => (
                        <span key={i} className="flex items-center gap-2 rounded-xl bg-white/10 ring-1 ring-white/15 px-2.5 py-1.5 text-xs">
                          <FileText size={14} className="shrink-0 text-accent-300" />
                          <span className="truncate">{f.name}</span>
                          <span className="ml-auto shrink-0 text-white/60">{fmtSize(f.size)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                  {m.voice && <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/55"><Mic size={10} /> dicté</span>}
                  {m.signIn && !cloud.email && (
                    <button type="button" onClick={() => window.dispatchEvent(new Event('codes:open-account'))}
                      className="mt-3 flex items-center gap-1.5 h-8 px-4 rounded-full bg-brand-900 text-white text-xs font-semibold hover:bg-brand-800 transition">
                      <LogIn size={14} /> Se connecter
                    </button>
                  )}
                  {m.bilanChoice && (
                    <span className="mt-3 flex flex-wrap gap-2 whitespace-normal">
                      {FORMATS.map((f) => (
                        <button key={f.id} type="button" onClick={() => makeFiles(m.id, [f.id])}
                          className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white ring-1 ring-brand-300 text-brand-900 text-xs font-semibold hover:bg-brand-50 transition">
                          <FileText size={14} /> {f.label}
                        </button>
                      ))}
                    </span>
                  )}
                  {m.downloads && <FileChips slots={m.downloads} onRemake={(f) => makeFiles(m.id, [f])} />}
                  {m.summaries && <ActionCard msg={m} onApprove={() => approve(m)} onRefuse={() => refuse(m)} onToggle={(i) => toggle(m, i)} />}
                </div>
              </div>
            ))}
            {typing && (
              <div className="sonia-rise flex items-center gap-1.5 bg-white rounded-2xl rounded-bl-md ring-1 ring-ink-100 w-max px-4 py-3" aria-label="Sonia écrit">
                {[0, 1, 2].map((i) => <span key={i} className="sonia-dot w-1.5 h-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.18}s` }} />)}
              </div>
            )}
          </div>

          </div>
          <div className="shrink-0 px-4 pb-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" disabled={typing} onClick={() => ask(s)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-white ring-1 ring-brand-300 text-brand-900 hover:bg-brand-50 transition disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="shrink-0 px-4 pb-3 pt-1">
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {files.map((f, i) => (
                  <span key={i} className="sonia-rise flex items-center gap-1.5 max-w-full bg-white rounded-full ring-1 ring-brand-300 pl-2.5 pr-1 py-1 text-xs text-brand-900">
                    <FileText size={13} className="shrink-0 text-brand-600" />
                    <span className="truncate max-w-[180px]">{f.name}</span>
                    <span className="text-ink-400">{fmtSize(f.size)}</span>
                    <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Retirer ${f.name}`} className="w-5 h-5 rounded-full grid place-items-center text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            {voice && (
              <div className="sonia-rise flex items-center gap-2 mb-2 text-xs text-brand-900">
                <span className="flex items-end gap-[3px] h-3.5" aria-hidden>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={`w-[3px] rounded-full bg-brand-500 ${hearing ? 'sonia-wave' : 'h-1'}`} style={{ animationDelay: `${i * 0.13}s` }} />)}
                </span>
                {hearing ? 'Sonia vous écoute… parlez naturellement.' : typing ? 'Sonia réfléchit…' : 'Sonia vous répond…'}
                <button type="button" onClick={toggleVoice} className="ml-auto text-ink-500 hover:text-brand-900 underline underline-offset-2">Terminer</button>
              </div>
            )}
            <div className="flex items-end gap-1 bg-white rounded-2xl ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500 pl-1.5 pr-1.5 py-1.5 transition">
              <input ref={fileRef} type="file" multiple hidden accept={ACCEPTED} onChange={(e) => addFiles(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Joindre un fichier" title="Joindre un fichier" className="w-9 h-9 shrink-0 rounded-xl grid place-items-center text-ink-500 hover:text-brand-900 hover:bg-ink-100/70 transition"><Paperclip size={17} /></button>
              {/* Plusieurs lignes : on peut coller une liste ou un tableau. Entrée envoie, Maj + Entrée va à la ligne. */}
              <textarea ref={inputRef} value={draft} rows={1} maxLength={20000}
                onChange={(e) => { onDraft(e.target.value); const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); } }}
                // Une capture d'écran copiée (ou un fichier) peut être collée directement avec Cmd/Ctrl + V.
                onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
                placeholder={voice ? 'Parlez, Sonia vous écoute…' : 'Écrire ou coller des données…'} aria-label="Message pour Sonia"
                className="flex-1 min-w-0 bg-transparent text-sm outline-none resize-none py-2 px-1 leading-5 max-h-40" style={{ height: 36 }} />
              <button type="button" onClick={toggleVoice} aria-pressed={voice} aria-label={voice ? 'Arrêter la conversation à voix haute' : 'Parler à Sonia'} title={voice ? 'Arrêter la conversation à voix haute' : 'Parler à Sonia'}
                className={`relative w-9 h-9 shrink-0 rounded-xl grid place-items-center transition ${voice ? 'bg-brand-950 text-accent-300' : 'text-ink-500 hover:text-brand-900 hover:bg-ink-100/70'}`}>
                {hearing && <span className="sonia-mic-pulse absolute inset-0 rounded-xl" aria-hidden />}
                <Mic size={17} className="relative" />
              </button>
              <button type="submit" disabled={(!draft.trim() && !files.length) || typing} aria-label="Envoyer" className="w-9 h-9 shrink-0 rounded-xl bg-brand-500 text-white grid place-items-center hover:bg-brand-600 transition disabled:opacity-40"><Send size={16} /></button>
            </div>
            <p className="text-[11px] text-ink-500 mt-2 flex items-center gap-1"><Sparkles size={11} className="text-brand-600" />
              {cloud.email ? 'Sonia peut proposer des modifications : rien n’est appliqué sans votre autorisation.' : TRIAL ? 'Mode essai sans compte : les modifications restent sur cet appareil. Connectez-vous pour les partager.' : 'Connectez-vous pour que Sonia puisse répondre à tout et agir dans la plateforme.'}</p>
          </form>
        </section>
      )}
    </>
  );
}

/* Humeur de Sonia selon la réponse qu'elle donne. */
function replyMood(q: string, d: EventData): 'delicate' | 'bonne' | 'redaction' | 'ecoute' {
  const t = q.toLowerCase();
  const late = d.tasks.filter(isLate).length;
  if (/retard/.test(t)) return late ? 'delicate' : 'bonne';
  if (/message|rédig|redig|écri/.test(t)) return 'redaction';
  if (/budget|argent|dépens|depens/.test(t)) {
    const planned = d.budget.reduce((a, b) => a + b.planned, 0), spent = d.budget.reduce((a, b) => a + b.spent, 0);
    return planned && spent / planned > 0.85 ? 'delicate' : 'bonne';
  }
  if (/où en|ou en|point|résum|resum|état|etat/.test(t)) return late ? 'delicate' : 'bonne';
  return 'ecoute';
}

/* ——— Réponses de démonstration, calculées sur l'événement actif ——— */

function filesReply(files: Attachment[], q: string) {
  const names = files.map((f) => `« ${f.name} »`).join(', ');
  const one = files.length === 1;
  return `Merci, j’ai bien reçu ${names}.${q ? ' J’ai noté votre demande.' : ''}\nDès que je serai pleinement connectée, je pourrai ${one ? 'le' : 'les'} lire, vous en faire un résumé et ${one ? 'le' : 'les'} classer dans les Documents de l’événement.`;
}

function summary(d: EventData) {
  const open = d.tasks.filter((t) => t.status !== 'Terminée');
  const late = open.filter(isLate);
  const planned = d.budget.reduce((a, b) => a + b.planned, 0);
  const spent = d.budget.reduce((a, b) => a + b.spent, 0);
  const pct = planned ? Math.round((spent / planned) * 100) : 0;
  const leads = [...d.sponsors.map((l) => ({ ...l, kind: 'sponsor' })), ...d.partners.map((l) => ({ ...l, kind: 'partenaire' }))];
  const toFollow = leads.filter((l) => l.stage === 'Contacté' || l.stage === 'Relancé');
  return { open, late, pct, planned, leads, toFollow, confirmed: leads.filter((l) => l.stage === 'Confirmé') };
}

function greeting(e: PlatformEvent, d: EventData) {
  const s = summary(d);
  const j = daysUntil(e.start);
  const when = j > 0 ? `nous sommes à J-${j}` : j === 0 ? 'c’est aujourd’hui' : 'l’événement a commencé';
  if (!d.tasks.length) return `Bonjour, je suis Sonia. Ravie de vous accompagner sur « ${e.name} ».\nIl n’y a encore aucune tâche : voulez-vous que nous commencions par là ?`;
  return `Bonjour, je suis Sonia. Ravie de vous retrouver.\nPour « ${e.name} », ${when} : ${s.open.length} tâche${s.open.length > 1 ? 's' : ''} ouverte${s.open.length > 1 ? 's' : ''}${s.late.length ? `, dont ${s.late.length} en retard` : ''}.\nPar quoi souhaitez-vous commencer ?`;
}

function demoReply(q: string, e: PlatformEvent, d: EventData) {
  const s = summary(d);
  const t = q.toLowerCase();
  if (/retard/.test(t)) {
    if (!s.late.length) return 'Bonne nouvelle : aucune tâche n’est en retard. Tout avance comme prévu.';
    return `Voici les tâches en retard :\n${s.late.map((x) => `• ${x.title} — ${x.owner}, prévue le ${fmtDate(x.due)}`).join('\n')}\n\nJe vous propose de commencer par la première : voulez-vous que je prépare un petit message pour ${s.late[0].owner} ?`;
  }
  if (/relanc/.test(t)) {
    if (!s.toFollow.length) return 'Personne n’attend de relance pour le moment. Je vous préviendrai dès qu’un contact restera sans réponse.';
    return `Ces contacts attendent une relance :\n${s.toFollow.map((l) => `• ${l.name} (${l.kind}) — ${l.contact}`).join('\n')}\n\nJe peux rédiger le message si vous le souhaitez.`;
  }
  if (/message|rédig|redig|écri/.test(t)) {
    const target = d.sponsors.find((l) => l.stage !== 'Confirmé') ?? d.sponsors[0];
    if (!target) return 'Il n’y a pas encore de sponsor pour cet événement. Ajoutez-en un dans le module Sponsors et je préparerai le message.';
    return `Voici une proposition pour ${target.name} :\n\n« Bonjour ${target.contact !== 'À identifier' ? target.contact : ''},\nJe reviens vers vous au sujet de ${e.name}, du ${fmtDate(e.start)} à ${e.place}. Nous serions honorés de vous compter parmi nos sponsors. Puis-je vous présenter nos offres de partenariat lors d’un court échange cette semaine ?\nBien cordialement. »\n\nC’est vous qui décidez de l’envoyer ; je peux aussi l’adapter pour WhatsApp.`;
  }
  if (/budget|argent|dépens|depens/.test(t)) {
    if (!s.planned) return 'Aucune ligne de budget n’est encore saisie pour cet événement.';
    return `${s.pct} % du budget prévu est déjà engagé.${s.pct > 85 ? ' Je vous suggère de vérifier les prochaines dépenses avec attention.' : ' Nous restons dans une zone confortable.'}`;
  }
  if (/où en|ou en|point|résum|resum|état|etat/.test(t)) {
    return `Voici le point sur « ${e.name} » :\n• ${s.open.length} tâche${s.open.length > 1 ? 's' : ''} ouverte${s.open.length > 1 ? 's' : ''}${s.late.length ? `, ${s.late.length} en retard` : ''}\n• Budget engagé : ${s.pct} %\n• ${s.confirmed.length} sponsor${s.confirmed.length > 1 ? 's' : ''} ou partenaire${s.confirmed.length > 1 ? 's' : ''} confirmé${s.confirmed.length > 1 ? 's' : ''}, ${s.toFollow.length} à relancer\n• ${d.providers.length} prestataire${d.providers.length > 1 ? 's' : ''}`;
  }
  return DEMO_FALLBACK;
}

/** Carte d'autorisation : ce que Sonia propose de faire, action par action. Rien n'est appliqué sans « Autoriser ». */
/** Fichiers générés dans le chat : un clic les télécharge. */
function FileChips({ slots, onRemake }: { slots: FileSlot[]; onRemake: (f: BilanFormat) => void }) {
  const label = (f: BilanFormat) => FORMATS.find((x) => x.id === f)!.label;
  return (
    <span className="mt-3 flex flex-col gap-1.5 whitespace-normal">
      {slots.map((s) => (
        s.file ? (
          <button key={s.format} type="button" onClick={() => saveBlob(s.file!.blob, s.file!.name)} title="Télécharger"
            className="flex items-center gap-2 rounded-xl bg-[var(--sand)] ring-1 ring-ink-100 px-3 py-2 text-xs text-left hover:ring-brand-400 transition">
            {s.format === 'excel' ? <FileSpreadsheet size={16} className="shrink-0 text-emerald-700" /> : <FileText size={16} className={`shrink-0 ${s.format === 'pdf' ? 'text-red-700' : 'text-blue-700'}`} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink-900">{s.file.name}</span>
              <span className="text-ink-500">{label(s.format)} · {fmtSize(s.file.blob.size)}</span>
            </span>
            <Download size={15} className="shrink-0 text-brand-800" />
          </button>
        ) : s.name && !s.error ? (
          <button key={s.format} type="button" onClick={() => onRemake(s.format)} title="Recréer le fichier sur cet appareil"
            className="flex items-center gap-2 rounded-xl bg-[var(--sand)] ring-1 ring-ink-100 px-3 py-2 text-xs text-left hover:ring-brand-400 transition">
            {s.format === 'excel' ? <FileSpreadsheet size={16} className="shrink-0 text-emerald-700" /> : <FileText size={16} className={`shrink-0 ${s.format === 'pdf' ? 'text-red-700' : 'text-blue-700'}`} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink-900">{s.name}</span>
              <span className="text-ink-500">{label(s.format)} · créé sur un autre appareil : cliquez pour le recréer ici</span>
            </span>
            <Download size={15} className="shrink-0 text-brand-800" />
          </button>
        ) : s.error ? (
          <span key={s.format} className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900">Le bilan {label(s.format)} n’a pas pu être créé : {s.error}</span>
        ) : (
          <span key={s.format} className="flex items-center gap-2 rounded-xl bg-[var(--sand)] ring-1 ring-ink-100 px-3 py-2 text-xs text-ink-600">
            <Loader2 size={15} className="animate-spin shrink-0" /> Création du bilan {label(s.format)}…
          </span>
        )
      ))}
    </span>
  );
}

function ActionCard({ msg, onApprove, onRefuse, onToggle }: { msg: Msg; onApprove: () => void; onRefuse: () => void; onToggle: (i: number) => void }) {
  const pending = msg.decision === 'pending';
  const count = msg.chosen?.filter(Boolean).length ?? 0;
  return (
    <div className="mt-3 rounded-xl bg-[var(--sand)] ring-1 ring-ink-100 p-3 space-y-2 whitespace-normal">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-900"><ShieldCheck size={14} /> {pending ? 'Autorisation demandée' : msg.decision === 'running' ? 'Application en cours…' : msg.decision === 'refused' ? 'Refusé : rien n’a été modifié' : 'Autorisé'}</div>
      <ul className="space-y-2">
        {msg.summaries!.map((sum, i) => {
          const res = msg.results?.[i];
          return (
            <li key={i} className="flex items-start gap-2 text-xs leading-snug">
              {pending ? (
                <input type="checkbox" checked={!!msg.chosen?.[i]} disabled={sum.includes('⚠')} onChange={() => onToggle(i)} aria-label="Retenir cette action" className="mt-0.5 accent-brand-700 shrink-0" />
              ) : msg.decision === 'done' ? (
                res === undefined ? <Check size={14} className="text-emerald-700 shrink-0" /> : <X size={14} className="text-amber-700 shrink-0" />
              ) : <span className="w-3.5 shrink-0" />}
              <span className="whitespace-pre-line">
                {sum}
                {res && <span className="block mt-0.5 text-amber-800">{res}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {pending && (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onApprove} disabled={!count} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full bg-brand-900 text-white text-xs font-semibold hover:bg-brand-800 disabled:opacity-40 transition">
            <Check size={14} /> Autoriser{msg.summaries!.length > 1 ? ` (${count})` : ''}
          </button>
          <button type="button" onClick={onRefuse} className="h-8 px-3 rounded-full bg-white ring-1 ring-ink-200 text-ink-700 text-xs font-medium hover:bg-ink-50 transition">Refuser</button>
        </div>
      )}
    </div>
  );
}

const DEMO_FALLBACK = 'Je suis encore en mode démonstration : je pourrai répondre à toutes vos questions dès que ma connexion sera activée. En attendant, essayez l’une des suggestions juste en dessous.';
