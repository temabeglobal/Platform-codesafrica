import { createAuthClient } from '@neon/auth';

/* Connexion aux services Neon, choisie automatiquement selon l'environnement (VITE_APP_ENV) :
   local → branche development, test → branche test, production → branche production.
   Seules des adresses publiques sont ici (connexion, API, temps réel) : aucun secret.
   Sans ces adresses, la plateforme fonctionne comme avant, uniquement sur l'appareil. */

export const appEnv = (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';
const key = appEnv === 'production' ? 'PROD' : appEnv === 'test' ? 'TEST' : 'LOCAL';
const read = (name: string) => (import.meta.env[`VITE_NEON_${key}_${name}`] as string | undefined)?.replace(/\/$/, '') || undefined;

const authUrl = read('AUTH_URL');
const apiUrl = read('API_URL');
export const realtimeUrl = read('REALTIME_URL');

export const neonEnabled = !!(authUrl && apiUrl);
export const authClient = authUrl ? createAuthClient(authUrl) : null;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const isJwt = (t?: string | null): t is string => !!t && t.split('.').length === 3;

/** Jeton court (JWT) de la session, vérifié par la fonction api.
    `token()` vient du plugin JWT inclus par @neon/auth (présent à l'exécution, absent des types publics) ; après un
    rechargement de page il peut ne rien renvoyer : on prend alors le JWT que @neon/auth range dans la session. */
async function jwt(): Promise<string | undefined> {
  if (!authClient) return undefined;
  try {
    const { data } = await (authClient as unknown as { token: () => Promise<{ data: { token?: string } | null }> }).token();
    if (isJwt(data?.token)) return data!.token;
  } catch { /* on essaie la session */ }
  const { data } = await authClient.getSession();
  const t = (data?.session as { token?: string } | undefined)?.token;
  return isJwt(t) ? t : undefined;
}

/** Appel de la fonction « api » avec le jeton de la personne connectée. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!authClient || !apiUrl) throw new ApiError(0, 'Aucun service en ligne n’est configuré.');
  const token = await jwt();
  if (!token) throw new ApiError(401, 'Connectez-vous pour continuer.');
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new ApiError(0, 'Le serveur est injoignable. Nouvel essai automatique dans un instant.');
  }
  const body = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Erreur ${res.status}.`);
  return body as T;
}

/** Envoie un fichier dans le stockage et renvoie sa clé. */
export const uploadFile = (file: File) =>
  api<{ key: string }>(`/v1/files?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });

/** Lien de lecture temporaire (10 minutes) d'un fichier stocké. */
export const fileUrl = (key: string) => api<{ url: string }>(`/v1/files/url?key=${encodeURIComponent(key)}`).then((r) => r.url);

/** Action proposée par Sonia (jamais appliquée sans autorisation). */
export interface AiAction { id: string; name: string; args: Record<string, unknown> }
/** Question à Sonia, avec l'historique récent et les actions qu'elle peut proposer. */
export const askAi = (question: string, context: unknown, history: { role: 'user' | 'assistant'; content: string }[] = [], tools: unknown[] = [], images: string[] = []) =>
  api<{ text: string; actions?: AiAction[] }>('/v1/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, context, history, tools, images }) })
    .then((r) => ({ text: r.text ?? '', actions: Array.isArray(r.actions) ? r.actions : [] }));

/** Sonia sans compte (site de test seulement) : même réponse, sans jeton ; quotas appliqués par le serveur. */
export async function askAiPublic(question: string, context: unknown, history: { role: 'user' | 'assistant'; content: string }[] = [], tools: unknown[] = [], images: string[] = []) {
  if (!apiUrl) throw new ApiError(0, 'Aucun service en ligne n’est configuré.');
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/public/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, context, history, tools, images }) });
  } catch { throw new ApiError(0, 'Le serveur est injoignable.'); }
  const body = await res.json().catch(() => ({})) as { text?: string; actions?: AiAction[]; error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Erreur ${res.status}.`);
  return { text: body.text ?? '', actions: Array.isArray(body.actions) ? body.actions : [] };
}
