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

// —— Utilisateurs : accès sur invitation uniquement ——
export type Role = 'admin' | 'chef_projet' | 'membre';
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrateur', chef_projet: 'Chef de projet', membre: 'Membre de l’équipe' };
export interface Me { email: string; name: string; role: Role }
/** Fiche d'un utilisateur (comme dans timly). */
export interface Profile { name: string; job_title: string; department: string; phone: string; location: string; /** Événements attribués (l'administrateur voit tout). */ event_ids: string[] }
export interface Member extends Profile { email: string; role: Role; added_at: string; activated_at: string | null; invite_expires: string | null; added_by: string | null }
export interface NewUser { first_name: string; last_name: string; email: string; job_title: string; department: string; role: Role; phone: string; location: string; event_ids: string[] }
/** Lien d'activation : envoyé par e-mail en production (email_sent) ; en local et en test, jamais d'e-mail réel (email_locked). */
export interface Invitation { email: string; name: string; setup_link: string; email_sent: boolean; email_locked: boolean; days: number }
const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const getMe = () => api<Me>('/v1/me');
export const setMyName = (name: string) => post<{ ok: true; name: string }>('/v1/me', { name });
/** Changement du mot de passe (Neon Auth) : l'ancien est exigé. */
export async function changePassword(currentPassword: string, newPassword: string) {
  if (!authClient) throw new ApiError(0, 'Aucun service en ligne n’est configuré.');
  const fr = (msg?: string, code?: string) => {
    const m = `${msg ?? ''} ${code ?? ''}`;
    return /invalid.*password|incorrect|credential/i.test(m) ? 'Mot de passe actuel incorrect.'
      : /short|least|too_short/i.test(m) ? 'Nouveau mot de passe trop court (8 caractères au moins).'
      : /fetch|network/i.test(m) ? 'Le serveur est injoignable. Réessayez dans un instant.'
      : 'Changement impossible. Réessayez.';
  };
  let error: { message?: string; code?: string } | null | undefined;
  try {
    ({ error } = await (authClient as unknown as { changePassword: (b: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) => Promise<{ error?: { message?: string; code?: string } | null }> })
      .changePassword({ currentPassword, newPassword, revokeOtherSessions: false }));
  } catch (e) {
    const x = e as { message?: string; code?: string };
    throw new ApiError(400, fr(x?.message, x?.code));
  }
  if (error) throw new ApiError(400, fr(error.message, error.code));
}
export const listMembers = () => api<{ users: Member[] }>('/v1/admin/users').then((r) => r.users);
export const addMember = (u: NewUser) => post<Invitation>('/v1/admin/users', u);
export const updateMember = (email: string, role: Role, p: Profile) => post<{ ok: true }>('/v1/admin/users/update', { email, role, ...p });
export const setMemberRole = (email: string, role: Role) => post<{ ok: true }>('/v1/admin/users/role', { email, role });
export const renewInvitation = (email: string) => post<Invitation>('/v1/admin/users/invite', { email });
export const removeMember = (email: string) => post<{ ok: true }>('/v1/admin/users/remove', { email });
export const activateInvitation = (token: string) => post<{ ok: true }>('/v1/invitation/activate', { token });
/** Vérifie un lien d'activation AVANT de créer le compte ; renvoie l'adresse et le nom de la personne invitée. */
export async function checkInvitation(token: string) {
  if (!apiUrl) throw new ApiError(0, 'Aucun service en ligne n’est configuré.');
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/public/invitation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  } catch { throw new ApiError(0, 'Pas de connexion internet. Réessayez une fois en ligne.'); }
  const body = await res.json().catch(() => ({})) as { error?: string; email?: string; name?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Erreur ${res.status}.`);
  return { email: body.email!, name: body.name ?? '' };
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
