import type { WmtData } from './wmt';
import type { ProgrammeItem } from './programme';
import type { Badge, BadgeTheme } from './accreditation';
import type { Evaluation } from './evaluation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { askPersistence, load, save } from './offline/storage';
import { INITIAL, emptySync, useCloudSync, type Cloud, type Row, type SyncMeta } from './cloud/sync';
import { demoData, emptyEventData, syncTask, uid, type CommItem, type EventData, type Expense, type Provider, type Team, type NewTask, type Task, type Lead } from './demo';

/** Un événement géré par la plateforme (une édition, un forum…). */
export interface PlatformEvent {
  id: string;
  name: string;
  start: string; // AAAA-MM-JJ
  end: string;
  place: string;
  type: string;
  color: string;
  reference: string;
  description: string;
  budget: string;
  owner: string;
  attendees: string;
  /** Supprimé (date de la suppression) : caché partout, mais gardé en base pour pouvoir être récupéré par l'administrateur. */
  deleted?: string;
}

/* Données d'EXEMPLE (local et test seulement). La production démarre vide : aucun événement fictif n'y est jamais envoyé. */
const DEMO = import.meta.env.VITE_APP_ENV !== 'production'; // remplacé à la construction : les exemples disparaissent du site de production
const demoEvents: PlatformEvent[] = [
  { id: 'ca-2027', name: 'CODES Africa 2027', start: '2027-03-15', end: '2027-03-17', place: 'Lubumbashi', type: 'Forum', color: '#0A86A8',
    reference: 'CA-CODE-2027-101', description: 'Forum annuel CODES Africa : mines, technologie et innovation.', budget: '120000', owner: 'Équipe organisation', attendees: '800' },
  { id: 'wmt-2027', name: 'Women in MiningTech 2027', start: '2027-06-10', end: '2027-06-11', place: 'Kolwezi', type: 'Conférence', color: '#6b1a12',
    reference: 'CA-WOME-2027-102', description: 'Conférence Women in MiningTech & Academy.', budget: '40000', owner: 'Équipe organisation', attendees: '250' },
  { id: 'ca-2026', name: 'CODES Africa 2026', start: '2026-03-12', end: '2026-03-14', place: 'Lubumbashi', type: 'Forum', color: '#2f6fde',
    reference: 'CA-CODE-2026-103', description: 'Édition 2026 du forum CODES Africa.', budget: '100000', owner: 'Équipe organisation', attendees: '700' },
];
const seed: PlatformEvent[] = DEMO ? demoEvents : [];

/** Remplaçant quand aucun événement n'est attribué : il n'est dans aucune liste, donc jamais enregistré ni synchronisé. */
export const NO_EVENT: PlatformEvent = { id: '__aucun__', name: 'Aucun événement', start: '', end: '', place: '', type: '', color: '#0A86A8', reference: '', description: '', budget: '', owner: '', attendees: '' };

export interface EventsState {
  events: PlatformEvent[];
  current: PlatformEvent;
  /** Données (tâches, budget, partenaires…) de l'événement actif UNIQUEMENT. */
  data: EventData;
  select: (id: string) => void;
  /** Crée un événement ; `initial` remplit son espace (prestataires, sponsors…). */
  add: (e: Omit<PlatformEvent, 'id'>, initial?: Partial<EventData>) => PlatformEvent;
  update: (id: string, patch: Omit<PlatformEvent, 'id'>) => void;
  /** Supprime un événement (caché pour toute l'équipe, données gardées en base). */
  remove: (id: string) => void;
  /** Ajoute une tâche à l'événement ACTIF. */
  addTask: (t: NewTask) => Task;
  /** Modifie une tâche de l'événement ACTIF ; avancement et statut sont recalculés. */
  updateTask: (id: string, change: (t: Task) => Task) => void;
  /** Supprime une tâche de l'événement ACTIF. */
  removeTask: (id: string) => void;
  /** Planifie une publication dans le calendrier de communication de l'événement ACTIF. */
  addComm: (c: CommItem) => void;
  /** Remplace une publication de l'événement ACTIF par sa version modifiée. */
  updateComm: (old: CommItem, next: CommItem) => void;
  /** Supprime une publication de l'événement ACTIF. */
  removeComm: (c: CommItem) => void;
  /** Ajoute un prestataire (dossier vide) à l'événement ACTIF ; renvoie le prestataire créé. */
  addProvider: (p: Omit<Provider, 'id' | 'docs'>) => Provider;
  /** Modifie un prestataire de l'événement ACTIF (statut, dossier…). */
  updateProvider: (id: string, change: (p: Provider) => Provider) => void;
  /** Supprime un prestataire de l'événement ACTIF ; les dépenses qui lui étaient liées restent, sans prestataire. */
  removeProvider: (id: string) => void;
  /** Ajoute une dépense à un poste du budget de l'événement ACTIF (créé s'il n'existe pas, avec son montant prévu). */
  addExpense: (poste: string, e: Expense, planned?: number) => void;
  /** Remplace une dépense de l'événement ACTIF ; elle peut changer de poste (créé s'il n'existe pas). */
  updateExpense: (from: string, e: Expense, to: string, planned?: number) => void;
  /** Supprime une dépense d'un poste de l'événement ACTIF ; son montant est retiré du total dépensé. */
  removeExpense: (poste: string, id: string) => void;
  /** Supprime un poste du budget de l'événement ACTIF, avec toutes ses dépenses. */
  removeBudgetLine: (label: string) => void;
  /** Ajoute une équipe à l'événement ACTIF. */
  addTeam: (t: Team) => void;
  /** Supprime une équipe (et ses membres) de l'événement ACTIF. */
  removeTeam: (id: string) => void;
  /** Modifie une équipe de l'événement ACTIF (ses membres…). */
  updateTeam: (id: string, change: (t: Team) => Team) => void;
  /** Modifie les programmes, participantes ou sessions Women in MiningTech & Academy de l'événement ACTIF. */
  updateWmt: (change: (w: WmtData) => WmtData) => void;
  /** Ajoute un partenaire ou un sponsor à l'événement ACTIF. */
  addLead: (kind: 'partenaires' | 'sponsors', l: Lead) => void;
  /** Remplace un partenaire ou un sponsor (repéré par son nom d'origine) de l'événement ACTIF. */
  updateLead: (kind: 'partenaires' | 'sponsors', name: string, l: Lead) => void;
  /** Supprime un partenaire ou un sponsor (repéré par son nom) de l'événement ACTIF. */
  removeLead: (kind: 'partenaires' | 'sponsors', name: string) => void;
  /** Modifie le programme (sessions) de l'événement ACTIF. */
  updateProgramme: (change: (p: ProgrammeItem[]) => ProgrammeItem[]) => void;
  /** Ajoute des badges d'accréditation à l'événement ACTIF. */
  addBadges: (list: Badge[]) => void;
  /** Modifie un badge de l'événement ACTIF. */
  updateBadge: (id: string, change: (b: Badge) => Badge) => void;
  /** Supprime un badge de l'événement ACTIF. */
  removeBadge: (id: string) => void;
  /** Remplace l'habillage des badges de l'événement ACTIF ({} = badge standard). */
  setBadgeTheme: (t: BadgeTheme) => void;
  /** Modifie l'évaluation (bilan, fiches) de l'événement ACTIF. */
  updateEvaluation: (change: (e: Evaluation) => Evaluation) => void;
  /** Compte et synchronisation avec les services en ligne (Neon). */
  cloud: Cloud;
}

const Ctx = createContext<EventsState | null>(null);

const STORAGE_KEY = 'state';
interface Saved { v: 1; savedAt: string; events: PlatformEvent[]; currentId: string; dataById: Record<string, EventData>; sync?: SyncMeta }

/** Données lues sur l'appareil ou sur le serveur : les champs ajoutés depuis reçoivent leur valeur par défaut,
    l'avancement et le statut des tâches sont recalculés (au cas où la règle de calcul a changé). */
const normalize = (d: Partial<EventData>): EventData => ({
  ...emptyEventData(), ...d, tasks: (d.tasks ?? []).map((t) => syncTask({ ...t, phases: t.phases ?? [] })),
});

const BACKUP_KEY = 'codes-africa-planning-pending';
function writeBackup(s: Saved) { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(s)); } catch { /* trop volumineux ou indisponible */ } }
function readBackup(): Saved | undefined { try { const v = localStorage.getItem(BACKUP_KEY); return v ? (JSON.parse(v) as Saved) : undefined; } catch { return undefined; } }
function clearBackup() { try { localStorage.removeItem(BACKUP_KEY); } catch { /* indisponible */ } }

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<PlatformEvent[]>(seed);
  const [currentId, setCurrentId] = useState(seed[0]?.id ?? '');
  // Données rangées par événement : un module ne peut lire que celles de l'événement actif.
  const [dataById, setDataById] = useState<Record<string, EventData>>(DEMO ? demoData : {});

  // Synchronisation : l'état à jour est gardé dans une référence (lu pendant un envoi), sa copie dans l'état sert à l'affichage.
  const syncRef = useRef<SyncMeta>(emptySync());
  const [sync, setSyncState] = useState<SyncMeta>(syncRef.current);
  const setSync = useCallback((fn: (s: SyncMeta) => SyncMeta) => { syncRef.current = fn(syncRef.current); setSyncState(syncRef.current); }, []);

  // Hors connexion : les données sont relues depuis l'appareil au démarrage, puis enregistrées à chaque modification.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    load<Saved>(STORAGE_KEY)
      .catch(() => undefined) // stockage indisponible (navigation privée…)
      .then((stored) => {
        // Copie de secours laissée à la fermeture de la page : on la reprend si elle est plus récente.
        const backup = readBackup();
        const saved = backup && (!stored?.savedAt || backup.savedAt > stored.savedAt) ? backup : stored;
        // Une liste vide n'est gardée que si elle vient du serveur (aucun événement attribué à la personne connectée).
        if (!alive || !saved || (!saved.events?.length && !saved.sync?.lastPull)) return;
        setEvents(saved.events);
        setCurrentId(saved.events.some((e) => e.id === saved.currentId) ? saved.currentId : saved.events[0]?.id ?? '');
        // Les champs ajoutés depuis le dernier enregistrement reçoivent leur valeur par défaut.
        // L'avancement et le statut des tâches sont recalculés, au cas où la règle de calcul a changé depuis.
        setDataById(Object.fromEntries(Object.entries(saved.dataById ?? {}).map(([id, d]) => [id, normalize(d)])));
        // Données enregistrées avant la synchronisation : à envoyer, sauf si le serveur a déjà ces événements.
        setSync(() => saved.sync ?? { dirty: Object.fromEntries(saved.events.map((e) => [e.id, INITIAL])) });
      })
      .catch(() => undefined) // données illisibles : on garde les données d'exemple
      .finally(() => {
        if (!alive) return;
        // Rien sur l'appareil : les données d'exemple ne seront envoyées que si le serveur ne les a pas déjà.
        if (!syncRef.current.lastPull && !Object.keys(syncRef.current.dirty).length) setSync(() => ({ dirty: Object.fromEntries(seed.map((e) => [e.id, INITIAL])) }));
        setReady(true);
      });
    askPersistence();
    return () => { alive = false; };
  }, []);
  /* Enregistrement différé de 250 ms. Le navigateur abandonne les écritures IndexedDB lancées pendant la fermeture
     de la page : s'il reste une écriture en attente à ce moment-là, on en laisse une copie de secours dans localStorage
     (écriture immédiate), reprise au prochain démarrage. */
  const pending = useRef<Saved | null>(null);
  useEffect(() => {
    if (!ready) return;
    pending.current = { v: 1, savedAt: new Date().toISOString(), events, currentId, dataById, sync };
    const t = setTimeout(() => {
      if (pending.current) save<Saved>(STORAGE_KEY, pending.current).then(clearBackup).catch(() => undefined);
      pending.current = null;
    }, 250);
    return () => clearTimeout(t);
  }, [ready, events, currentId, dataById, sync]);
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      writeBackup(pending.current);
      save<Saved>(STORAGE_KEY, pending.current).catch(() => undefined);
      pending.current = null;
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden); };
  }, []);

  /* Repère les événements modifiés sur l'appareil (informations ou données) pour les envoyer au serveur.
     Les versions reçues du serveur ne comptent pas comme des modifications. */
  const prev = useRef<{ events: PlatformEvent[]; data: Record<string, EventData> } | null>(null);
  const fromServer = useRef(new Set<string>());
  const live = useRef({ events, dataById });
  live.current = { events, dataById };
  useEffect(() => {
    if (!ready) return;
    const before = prev.current;
    prev.current = { events, data: dataById };
    if (!before) return; // premier affichage après la lecture de l'appareil
    const changed: string[] = [];
    for (const e of events) {
      if (fromServer.current.has(e.id)) continue;
      if (before.events.find((x) => x.id === e.id) !== e || before.data[e.id] !== dataById[e.id]) changed.push(e.id);
    }
    fromServer.current.clear();
    if (!changed.length) return;
    const now = new Date().toISOString();
    setSync((s) => ({ ...s, dirty: { ...s.dirty, ...Object.fromEntries(changed.map((id) => [id, now])) } }));
  }, [ready, events, dataById, setSync]);

  const cloud = useCloudSync<Omit<PlatformEvent, 'id'>, EventData>({
    ready,
    sync,
    getSync: () => syncRef.current,
    setSync,
    rowsFor: (ids) => ids.flatMap((id) => {
      const e = live.current.events.find((x) => x.id === id);
      if (!e) return [];
      const { id: _id, ...meta } = e;
      return [{ id, meta, data: live.current.dataById[id] ?? emptyEventData() }];
    }),
    apply: (rows: Row<Omit<PlatformEvent, 'id'>, EventData>[]) => {
      for (const r of rows) fromServer.current.add(r.id);
      setEvents((list) => {
        const incoming = new Map(rows.map((r) => [r.id, { ...r.meta, id: r.id } as PlatformEvent]));
        const kept = list.map((e) => incoming.get(e.id) ?? e);
        const added = rows.filter((r) => !list.some((e) => e.id === r.id)).map((r) => incoming.get(r.id)!);
        return [...added, ...kept];
      });
      setDataById((d) => ({ ...d, ...Object.fromEntries(rows.map((r) => [r.id, normalize(r.data)])) }));
    },
    drop: (ids) => {
      const gone = new Set(ids);
      setEvents((list) => list.filter((e) => !gone.has(e.id)));
      setDataById((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !gone.has(id))));
    },
    localIds: () => live.current.events.map((e) => e.id),
  });

  const value = useMemo<EventsState>(() => {
    // Aucun événement (personne à qui rien n'est encore attribué) : un événement vide, jamais enregistré ni envoyé.
    // Les événements supprimés restent dans la liste interne (pour être envoyés au serveur), mais ne sont montrés nulle part.
    const visible = events.filter((e) => !e.deleted);
    const current = visible.find((e) => e.id === currentId) ?? visible[0] ?? NO_EVENT;
    // Toute écriture de tâche vise l'événement actif, jamais un autre.
    const setTasks = (fn: (list: Task[]) => Task[]) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, tasks: fn(cur.tasks) } };
    });
    // Toute écriture de publication vise, elle aussi, l'événement actif uniquement.
    const setComms = (fn: (list: CommItem[]) => CommItem[]) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, communication: fn(cur.communication) } };
    });
    return {
    events: visible,
    current,
    data: dataById[current.id] ?? emptyEventData(),
    select: setCurrentId,
    add: (e, initial) => {
      const created = { ...e, id: `${Date.now()}` };
      setEvents((list) => [created, ...list]);
      setDataById((d) => ({ ...d, [created.id]: { ...emptyEventData(), ...initial } })); // nouvel événement = son propre espace
      setCurrentId(created.id);
      return created;
    },
    update: (id, patch) => setEvents((list) => list.map((e) => (e.id === id ? { ...patch, id } : e))),
    remove: (id) => {
      setEvents((list) => list.map((e) => (e.id === id ? { ...e, deleted: new Date().toISOString() } : e)));
      if (current.id === id) setCurrentId(visible.find((e) => e.id !== id)?.id ?? '');
    },
    addTask: (t) => {
      const created: Task = syncTask({ ...t, id: `${current.id}-${uid()}`, phases: [] });
      setTasks((list) => [...list, created]);
      return created;
    },
    updateTask: (id, change) => setTasks((list) => list.map((t) => (t.id === id ? syncTask(change(t)) : t))),
    removeTask: (id) => setTasks((list) => list.filter((t) => t.id !== id)),
    addComm: (c) => setComms((list) => [...list, c]),
    updateComm: (old, next) => setComms((list) => list.map((c) => (c === old ? next : c))),
    removeComm: (item) => setComms((list) => list.filter((c) => c !== item)),
    addProvider: (p) => {
      const created: Provider = { ...p, id: uid(), docs: [] };
      setDataById((d) => {
        const cur = d[current.id] ?? emptyEventData();
        return { ...d, [current.id]: { ...cur, providers: [...cur.providers, created] } };
      });
      return created;
    },
    updateProvider: (id, change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, providers: cur.providers.map((p) => (p.id === id ? change(p) : p)) } };
    }),
    removeBudgetLine: (label) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, budget: cur.budget.filter((b) => b.label !== label) } };
    }),
    removeProvider: (id) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const budget = cur.budget.map((l) => (l.expenses?.some((e) => e.provider === id)
        ? { ...l, expenses: l.expenses.map((e) => (e.provider === id ? { ...e, provider: undefined } : e)) } : l));
      return { ...d, [current.id]: { ...cur, providers: cur.providers.filter((p) => p.id !== id), budget } };
    }),
    addExpense: (poste, e, planned) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const exists = cur.budget.some((b) => b.label === poste);
      const budget = exists
        ? cur.budget.map((b) => (b.label === poste ? { ...b, planned: planned ?? b.planned, spent: b.spent + e.amount, expenses: [...(b.expenses ?? []), e] } : b))
        : [...cur.budget, { label: poste, planned: planned ?? 0, spent: e.amount, expenses: [e] }];
      return { ...d, [current.id]: { ...cur, budget } };
    }),
    updateExpense: (from, e, to, planned) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      // On retire l'ancienne version de son poste, puis on ajoute la nouvelle à son poste (peut-être un autre).
      let budget = cur.budget.map((b) => {
        const old = b.label === from ? b.expenses?.find((x) => x.id === e.id) : undefined;
        return old ? { ...b, spent: Math.max(b.spent - old.amount, 0), expenses: b.expenses!.filter((x) => x.id !== e.id) } : b;
      });
      budget = budget.some((b) => b.label === to)
        ? budget.map((b) => (b.label === to ? { ...b, planned: planned ?? b.planned, spent: b.spent + e.amount, expenses: [...(b.expenses ?? []), e] } : b))
        : [...budget, { label: to, planned: planned ?? 0, spent: e.amount, expenses: [e] }];
      return { ...d, [current.id]: { ...cur, budget } };
    }),
    removeExpense: (poste, id) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const budget = cur.budget.map((b) => {
        const gone = b.label === poste ? b.expenses?.find((x) => x.id === id) : undefined;
        return gone ? { ...b, spent: Math.max(b.spent - gone.amount, 0), expenses: b.expenses!.filter((x) => x.id !== id) } : b;
      });
      return { ...d, [current.id]: { ...cur, budget } };
    }),
    addLead: (kind, l) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const key = kind === 'partenaires' ? 'partners' : 'sponsors';
      return { ...d, [current.id]: { ...cur, [key]: [...cur[key], l] } };
    }),
    removeLead: (kind, name) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const key = kind === 'partenaires' ? 'partners' : 'sponsors';
      return { ...d, [current.id]: { ...cur, [key]: cur[key].filter((x) => x.name !== name) } };
    }),
    updateLead: (kind, name, l) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      const key = kind === 'partenaires' ? 'partners' : 'sponsors';
      return { ...d, [current.id]: { ...cur, [key]: cur[key].map((x) => (x.name === name ? l : x)) } };
    }),
    updateProgramme: (change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, programme: change(cur.programme) } };
    }),
    addBadges: (list) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, badges: [...cur.badges, ...list] } };
    }),
    updateBadge: (id, change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, badges: cur.badges.map((b) => (b.id === id ? change(b) : b)) } };
    }),
    removeBadge: (id) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, badges: cur.badges.filter((b) => b.id !== id) } };
    }),
    setBadgeTheme: (t) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, badgeTheme: t } };
    }),
    updateEvaluation: (change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, evaluation: change(cur.evaluation) } };
    }),
    updateWmt: (change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, wmt: change(cur.wmt) } };
    }),
    addTeam: (t) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, teams: [...cur.teams, t] } };
    }),
    removeTeam: (id) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, teams: cur.teams.filter((t) => t.id !== id) } };
    }),
    updateTeam: (id, change) => setDataById((d) => {
      const cur = d[current.id] ?? emptyEventData();
      return { ...d, [current.id]: { ...cur, teams: cur.teams.map((t) => (t.id === id ? change(t) : t)) } };
    }),
    cloud,
  };
  }, [events, currentId, dataById, cloud]);

  if (!ready) return null; // lecture de l'appareil : quelques millisecondes
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEvents() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEvents doit être utilisé dans <EventsProvider>.');
  return v;
}
