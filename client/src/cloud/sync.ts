import { useCallback, useEffect, useRef, useState } from 'react';
import { createRealtimeClient, type SealedLiveQuery } from '@neon/realtime/client';
import { ApiError, api, authClient, neonEnabled, realtimeUrl } from './neon';

/* Synchronisation hors connexion d'abord :
   - chaque modification est d'abord enregistrée sur l'appareil, et l'événement modifié est noté « à envoyer » ;
   - dès qu'internet et la connexion au compte sont là, les événements notés sont envoyés à la base Neon,
     puis les événements modifiés ailleurs sont relus ;
   - le temps réel prévient la plateforme dès qu'un événement change ailleurs, sans attendre le prochain passage ;
   - un événement qui a des modifications pas encore envoyées n'est jamais écrasé par la version du serveur.
   Règle en cas de modification du même événement sur deux appareils hors ligne : la dernière envoyée l'emporte. */

export interface SyncMeta {
  /** Événements modifiés sur l'appareil et pas encore envoyés : id → heure de la dernière modification. */
  dirty: Record<string, string>;
  /** Heure (serveur) de la plus récente version relue. */
  lastPull?: string;
}
export const emptySync = (): SyncMeta => ({ dirty: {} });
/** Marque d'une copie locale qui existait avant la synchronisation : envoyée seulement si le serveur ne l'a pas déjà. */
export const INITIAL = 'initial';

export interface Row<M, D> { id: string; meta: M; data: D; updated_at: string }

export type SyncStatus = 'off' | 'signed-out' | 'offline' | 'syncing' | 'ok' | 'error';

export interface Cloud {
  /** Faux si aucun service en ligne n'est configuré pour cet environnement. */
  enabled: boolean;
  email?: string;
  status: SyncStatus;
  /** Nombre d'événements pas encore envoyés. */
  pending: number;
  lastSync?: Date;
  /** Vrai quand le temps réel est branché. */
  live: boolean;
  error?: string;
  signIn: (email: string, password: string) => Promise<string | undefined>;
  signUp: (name: string, email: string, password: string) => Promise<string | undefined>;
  signOut: () => Promise<void>;
  syncNow: () => void;
}

const explain = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'La session a expiré. Reconnectez-vous.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Erreur inconnue.';
};
const authError = (m?: string) => {
  if (!m) return 'La connexion a échoué.';
  if (/invalid email or password|invalid_email_or_password|credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/already exists|user_already_exists/i.test(m)) return 'Un compte existe déjà avec cette adresse. Connectez-vous.';
  if (/password.*(short|least)/i.test(m)) return 'Mot de passe trop court (8 caractères au moins).';
  if (/fetch|network/i.test(m)) return 'Pas de connexion internet. Réessayez une fois en ligne.';
  return m;
};

/** Branche la synchronisation sur les données de la plateforme. */
export function useCloudSync<M, D>(opts: {
  ready: boolean;
  /** État de synchronisation pour l'affichage. */
  sync: SyncMeta;
  /** État à jour au moment de l'appel (pas celui du dernier affichage). */
  getSync: () => SyncMeta;
  setSync: (fn: (s: SyncMeta) => SyncMeta) => void;
  /** Lignes à envoyer pour ces événements (absentes si l'événement n'existe plus). */
  rowsFor: (ids: string[]) => { id: string; meta: M; data: D }[];
  /** Applique les versions relues (déjà filtrées : aucune n'a de modification locale en attente). */
  apply: (rows: Row<M, D>[]) => void;
}): Cloud {
  const [email, setEmail] = useState<string>();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<Date>();
  const [error, setError] = useState<string>();
  const [live, setLive] = useState(false);
  const o = useRef(opts);
  o.current = opts;
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (!authClient) return;
    authClient.getSession().then(({ data }) => setEmail(data?.user?.email ?? undefined)).catch(() => undefined);
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const run = useCallback(async () => {
    if (!neonEnabled || !email || !navigator.onLine || !o.current.ready) return;
    if (running.current) { again.current = true; return; }
    running.current = true; setBusy(true);
    try {
      // Lecture des événements modifiés ailleurs (avec une minute de marge, au cas où une écriture serait arrivée en retard).
      // Renvoie les événements remplacés par la version du serveur.
      const pull = async () => {
        const last = o.current.getSync().lastPull;
        const since = last ? new Date(Date.parse(last) - 60_000).toISOString() : '1970-01-01T00:00:00Z';
        const { rows } = await api<{ rows: Row<M, D>[] }>(`/v1/events?since=${encodeURIComponent(since)}`);
        const replaced = new Set<string>();
        if (!rows.length) return replaced;
        const dirty = o.current.getSync().dirty;
        // Une vraie modification locale en attente l'emporte ; une copie locale jamais envoyée (INITIAL) cède la place au serveur.
        const fresh = rows.filter((r) => !dirty[r.id] || dirty[r.id] === INITIAL);
        if (fresh.length) o.current.apply(fresh);
        for (const r of fresh) replaced.add(r.id);
        const latest = rows[rows.length - 1].updated_at;
        o.current.setSync((s) => {
          const d = { ...s.dirty };
          for (const id of replaced) if (d[id] === INITIAL) delete d[id];
          return { dirty: d, lastPull: !s.lastPull || latest > s.lastPull ? latest : s.lastPull };
        });
        return replaced;
      };
      // Envoi des événements modifiés sur l'appareil (sauf ceux qui viennent d'être remplacés par le serveur).
      const push = async (skip: Set<string>) => {
        const sent = { ...o.current.getSync().dirty };
        const ids = Object.keys(sent).filter((id) => !skip.has(id));
        if (!ids.length) return;
        const rows = o.current.rowsFor(ids);
        for (let i = 0; i < rows.length; i += 20) {
          await api('/v1/events', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: rows.slice(i, i + 20) }) });
        }
        // Retirés de la liste seulement s'ils n'ont pas été modifiés de nouveau pendant l'envoi.
        o.current.setSync((s) => {
          const dirty = { ...s.dirty };
          for (const id of ids) if (dirty[id] === sent[id]) delete dirty[id];
          return { ...s, dirty };
        });
      };
      do {
        again.current = false;
        // Premier passage sur cet appareil : on lit le serveur avant d'envoyer, pour ne pas écraser ses données
        // avec les copies locales jamais envoyées.
        const first = !o.current.getSync().lastPull ? await pull() : new Set<string>();
        await push(first);
        await pull();
      } while (again.current);
      setError(undefined);
      setLastSync(new Date());
    } catch (e) {
      setError(explain(e));
    } finally {
      running.current = false; setBusy(false);
    }
  }, [email]);

  // Synchronisation : à la connexion, au retour d'internet, au retour sur l'onglet, puis toutes les 60 secondes (filet de sécurité).
  useEffect(() => {
    if (!email || !online || !opts.ready) return;
    run();
    const t = setInterval(run, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [email, online, opts.ready, run]);

  // Et peu après chaque modification.
  const dirtyKey = Object.entries(opts.sync.dirty).map((x) => x.join('=')).join('|');
  useEffect(() => {
    if (!dirtyKey || !email || !online) return;
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [dirtyKey, email, online, run]);

  // Temps réel : chaque modification d'un événement (sur un autre appareil) relance la lecture.
  useEffect(() => {
    if (!email || !online || !opts.ready || !realtimeUrl) return;
    let stopped = false, renewTimer: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
    const client = createRealtimeClient({ url: realtimeUrl });
    const seal = () => api<SealedLiveQuery<{ id: string; updated_at: string }>>('/v1/events/live', { method: 'POST' });
    const start = async () => {
      try {
        const sealed = await seal();
        if (stopped) return;
        const sub = client.subscribe(sealed, { materialize: false });
        let first = true;
        sub.onUpdate(() => { if (first) { first = false; return; } run(); });
        sub.onStateChange((s) => {
          setLive(s.status === 'live');
          if (s.status === 'error' && !stopped) { sub.unsubscribe(); retry = setTimeout(start, 10_000); }
        });
        // Renouvelle la requête scellée une minute avant son expiration.
        const schedule = (exp: number) => {
          renewTimer = setTimeout(async () => {
            try { const next = await seal(); await sub.renew(next); schedule(next.expiresAt); } catch { sub.unsubscribe(); setLive(false); if (!stopped) retry = setTimeout(start, 10_000); }
          }, Math.max(exp - Date.now() - 60_000, 5_000));
        };
        schedule(sealed.expiresAt);
      } catch {
        setLive(false);
        if (!stopped) retry = setTimeout(start, 30_000);
      }
    };
    start();
    return () => { stopped = true; clearTimeout(renewTimer); clearTimeout(retry); client.close(); setLive(false); };
  }, [email, online, opts.ready, run]);

  const pending = Object.keys(opts.sync.dirty).length;
  const status: SyncStatus = !neonEnabled ? 'off' : !email ? 'signed-out' : !online ? 'offline' : busy ? 'syncing' : error ? 'error' : 'ok';

  return {
    enabled: neonEnabled,
    email,
    status,
    pending,
    lastSync,
    live,
    error,
    signIn: async (mail, password) => {
      if (!authClient) return 'Aucun service en ligne n’est configuré.';
      try {
        const { data, error: e } = await authClient.signIn.email({ email: mail.trim(), password });
        if (e) return authError(e.message ?? e.code);
        setEmail(data?.user?.email ?? mail.trim());
        return undefined;
      } catch (e) { return authError(e instanceof Error ? e.message : undefined); }
    },
    signUp: async (name, mail, password) => {
      if (!authClient) return 'Aucun service en ligne n’est configuré.';
      try {
        const { data, error: e } = await authClient.signUp.email({ name: name.trim() || mail.trim(), email: mail.trim(), password });
        if (e) return authError(e.message ?? e.code);
        setEmail(data?.user?.email ?? mail.trim());
        return undefined;
      } catch (e) { return authError(e instanceof Error ? e.message : undefined); }
    },
    signOut: async () => { await authClient?.signOut().catch(() => undefined); setEmail(undefined); setError(undefined); setLastSync(undefined); },
    syncNow: () => { setError(undefined); run(); },
  };
}
