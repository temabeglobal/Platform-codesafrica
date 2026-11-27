/* Fonction Neon « api » : l'arrière-plan de la plateforme CODES Africa — Planning event.
   Chaque branche Neon (development, test, production) a sa propre fonction, sa propre base, ses fichiers et sa passerelle IA :
   les environnements ne se mélangent jamais.

   Routes (toutes sauf /health exigent un jeton Neon Auth et une adresse inscrite dans « members ») :
     GET  /health                 état de la base
     GET|POST /v1/me              compte connecté (adresse, nom, rôle) ; changement du nom affiché
     POST /public/invitation      vérifie un lien d'activation avant la création du mot de passe (essais limités par IP)
     POST /v1/invitation/activate active l'accès avec le lien reçu (compte tout juste créé)
     GET|POST /v1/admin/users     utilisateurs : liste, ajout (fiche complète, lien d'activation, e-mail en production)
     POST /v1/admin/users/update  modifie la fiche et le rôle d'un utilisateur (administrateur seulement)
     POST /v1/admin/users/role    change le rôle d'un utilisateur (administrateur seulement)
     POST /v1/admin/users/invite  nouveau lien d'activation (administrateur seulement)
     POST /v1/admin/users/remove  retire un utilisateur (administrateur seulement)
     GET  /v1/events?since=       événements modifiés depuis une date (heure serveur)
     PUT  /v1/events              envoi d'événements modifiés sur l'appareil
     POST /v1/events/live         requête temps réel scellée : signale chaque modification d'événement
     POST /v1/files?name=         dépôt d'un fichier (corps brut) dans le stockage « uploads »
     GET  /v1/files/url?key=      lien de lecture temporaire d'un fichier
     GET|PUT /v1/sonia/:eventId   Conversations avec Sonia (privées, synchronisées entre les appareils)
     POST /public/ai              Sonia sans compte (site de test seulement, avec quotas)
     POST /v1/ai                  réponse de Sonia et actions proposées (Anthropic, sinon OpenAI, sinon passerelle IA) — jamais exécutées ici */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { attachDatabasePool } from '@neon/functions';
import { createRealtime, rawSql } from '@neon/realtime/server';
import { Files } from 'files-sdk';
import { neon as neonFiles } from 'files-sdk/neon';
import { neon as neonAi } from '@neon/ai-sdk-provider';
import { generateText } from 'ai';
import { SONIA_SYSTEM_PROMPT } from '../server/src/sonia';

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Variable ${name} manquante.`);
  return v;
};

// Connexions créées une fois par instance et réutilisées d'une requête à l'autre.
const pool = new pg.Pool({ connectionString: env('DATABASE_URL'), max: 5 });
attachDatabasePool(pool);
const jwks = createRemoteJWKSet(new URL(env('NEON_AUTH_JWKS_URL')));
const issuer = new URL(env('NEON_AUTH_BASE_URL')).origin;
const realtime = createRealtime({ secret: process.env.NEON_REALTIME_SECRET || env('REALTIME_SECRET'), db: new URL(env('DATABASE_URL')).pathname.slice(1) || 'neondb' });
const files = new Files({ adapter: neonFiles({ bucket: 'uploads' }) });
const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
// Clé Anthropic de cette branche (facultative) : si elle est là, Sonia répond directement par Anthropic, sinon par la passerelle IA Neon.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const SONIA_MODEL = process.env.SONIA_MODEL || 'claude-sonnet-5-5';
// Ou clé OpenAI (facultative), utilisée si aucune clé Anthropic n'est fournie.
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MAX_FILE = 15 * 1024 * 1024;

type Vars = { userId: string; email: string; role: 'admin' | 'chef_projet' | 'membre'; name: string; /** Événements visibles (undefined = tous, pour l'administrateur). */ scope?: string[] };
const app = new Hono<{ Variables: Vars }>();

app.use('*', cors({ origin: (o) => (origins.includes(o) ? o : null), allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], maxAge: 600 }));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Erreur interne.' }, 500);
});

app.get('/health', async (c) => {
  const { rows } = await pool.query<{ ok: number }>('select 1 as ok');
  return c.json({ ok: rows[0]?.ok === 1, branch: process.env.NEON_BRANCH ?? null });
});

/* Authentification : jeton Neon Auth vérifié par sa clé publique, puis adresse e-mail présente dans « members ».
   Un jeton valide ne suffit pas : seules les personnes inscrites par l'administrateur accèdent aux données. */
async function emailOf(userId: string, claim: unknown) {
  if (typeof claim === 'string' && claim) return claim.toLowerCase();
  const { rows } = await pool.query<{ email: string }>('select email from neon_auth."user" where id::text = $1', [userId]);
  return rows[0]?.email?.toLowerCase() ?? '';
}
app.use('/v1/*', async (c, next) => {
  const h = c.req.header('authorization');
  if (!h?.toLowerCase().startsWith('bearer ')) throw new HTTPException(401, { message: 'Connexion requise.' });
  let payload;
  try { ({ payload } = await jwtVerify(h.slice(7), jwks, { issuer })); } catch { throw new HTTPException(401, { message: 'Session expirée ou invalide.' }); }
  if (!payload.sub) throw new HTTPException(401, { message: 'Session invalide.' });
  const email = await emailOf(payload.sub, payload.email);
  const { rows: [m] } = await pool.query<{ role: Vars['role']; name: string; active: boolean; event_ids: string[] }>(
    'select role, name, activated_at is not null as active, event_ids from members where email = $1', [email]);
  if (!m) throw new HTTPException(403, { message: 'Ce compte n’est pas autorisé. Seul l’administrateur ajoute les utilisateurs : demandez-lui une invitation.' });
  // Une personne invitée n'a accès qu'à l'activation tant qu'elle n'a pas donné son code.
  if (!m.active && c.req.path !== '/v1/invitation/activate') throw new HTTPException(403, { message: 'Accès pas encore activé : ouvrez le lien d’activation reçu (e-mail ou WhatsApp).' });
  c.set('userId', payload.sub);
  c.set('email', email);
  c.set('role', m.role);
  c.set('name', m.name);
  c.set('scope', m.role === 'admin' ? undefined : (m.event_ids ?? []));
  await next();
});

app.get('/v1/me', (c) => c.json({ userId: c.get('userId'), email: c.get('email'), role: c.get('role'), name: c.get('name') }));
/** Paramètres : la personne change le nom affiché (liste des utilisateurs, menu de son espace). */
app.post('/v1/me', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { name?: string };
  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) throw new HTTPException(400, { message: 'Saisissez votre nom.' });
  await pool.query('update members set name = $2 where email = $1', [c.get('email'), name]);
  return c.json({ ok: true, name });
});

// —— Utilisateurs : accès sur invitation uniquement, géré par l'administrateur (comme dans timly) ——
// L'administrateur remplit la fiche (prénom, nom, e-mail, fonction, département, rôle, téléphone, localisation).
// La personne reçoit un lien d'activation à usage unique (7 jours) pour créer elle-même son mot de passe :
// par e-mail automatiquement en production (Resend), sinon le lien s'affiche pour être copié ou envoyé sur WhatsApp.
// Seule l'empreinte SHA-256 du lien est gardée. Le local et le test n'envoient jamais d'e-mail réel.
const INVITE_DAYS = 7;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'chef_projet', 'membre'] as const;
type Role = typeof ROLES[number];
const roleOf = (v: unknown): Role | undefined => (ROLES as readonly string[]).includes(String(v)) ? v as Role : undefined;
const sha256 = async (v: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toString('hex');
const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const normToken = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
const mailOf = (v: unknown) => String(v ?? '').trim().toLowerCase();
const txt = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);
const ipOf = (c: Context) => (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || c.req.header('x-real-ip') || 'inconnue';
const isProduction = process.env.NEON_BRANCH === 'production';
const adminOnly = (c: Context<{ Variables: Vars }>) => {
  if (c.get('role') !== 'admin') throw new HTTPException(403, { message: 'Réservé à l’administrateur.' });
};
/** Adresse du site pour le lien : celle d'où l'administrateur travaille (si autorisée), sinon la première autorisée. */
const siteOf = (c: Context) => {
  const o = c.req.header('origin') ?? '';
  return (origins.includes(o) ? o : origins[0] ?? '').replace(/\/$/, '');
};
const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const inviteHtml = (name: string, link: string, by: string) => `
<div style="background:#f4f1ea;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#01212b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
    <div style="background:#000b10;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700">CODES Africa — Planning event</div>
    <div style="padding:28px;font-size:15px;line-height:1.6">
      <p style="font-size:18px;font-weight:700;margin:0 0 16px">Bienvenue ${esc(name)},</p>
      <p style="margin:0 0 16px">${esc(by)} vient de vous créer un accès à la plateforme de planification des événements <strong>CODES Africa</strong>.</p>
      <p style="margin:0 0 24px">Pour activer votre compte, choisissez votre mot de passe en cliquant sur le bouton ci-dessous :</p>
      <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#00a3cc;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Activer mon compte</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6b70">Ce lien est personnel et valable ${INVITE_DAYS} jours. Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
      <p style="margin:0;font-size:12px;word-break:break-all;color:#5b6b70">${link}</p>
    </div>
  </div>
</div>`;
/** Envoi par Resend, en production seulement et si la clé est configurée. Renvoie true si l'e-mail est parti. */
const sendInvite = async (to: string, name: string, link: string, by: string) => {
  const key = process.env.RESEND_API_KEY;
  if (!isProduction || !key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'CODES Africa <noreply@codesafrica.com>', to,
        subject: 'Bienvenue sur CODES Africa — Activez votre compte', html: inviteHtml(name || to, link, by),
      }),
    });
    if (!res.ok) console.error(`[e-mail] échec Resend (${res.status}) : ${await res.text().catch(() => '')}`);
    return res.ok;
  } catch (e) { console.error('[e-mail] Resend injoignable', e); return false; }
};
/** Nouveau lien d'activation (l'ancien ne marche plus), envoyé par e-mail si possible. */
const issueInvite = async (c: Context<{ Variables: Vars }>, email: string) => {
  const token = newToken();
  const { rows: [m] } = await pool.query<{ name: string }>(
    `update members set invite_hash = $2, invite_expires = now() + interval '${INVITE_DAYS} days' where email = $1 returning name`, [email, await sha256(token)]);
  const setup_link = `${siteOf(c)}/?invitation=${token}`;
  const email_sent = await sendInvite(email, m?.name ?? '', setup_link, c.get('name') || 'L’administrateur');
  return { email, name: m?.name ?? '', setup_link, email_sent, email_locked: !isProduction, days: INVITE_DAYS };
};
/** Personne invitée (pas encore active) correspondant à un lien valable. */
const invitedBy = async (token: unknown) => {
  const t = normToken(token);
  if (t.length !== 64) return undefined;
  const { rows: [m] } = await pool.query<{ email: string; name: string }>(
    `select email, name from members where invite_hash = $1 and invite_expires > now() and activated_at is null`, [await sha256(t)]);
  return m;
};
const eventIds = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 100))].slice(0, 500) : []);
const fiche = (b: Record<string, unknown>) => ({
  event_ids: eventIds(b.event_ids),
  name: txt(b.name) || [txt(b.first_name, 60), txt(b.last_name, 60)].filter(Boolean).join(' '),
  job_title: txt(b.job_title), department: txt(b.department), phone: txt(b.phone, 40), location: txt(b.location),
});

/** Avant la création du mot de passe : le lien est-il valable ? (Renvoie l'adresse et le nom à afficher.) */
app.post('/public/invitation', async (c) => {
  const origin = c.req.header('origin') ?? '';
  if (!origins.includes(origin)) throw new HTTPException(403, { message: 'Origine non autorisée.' });
  const { rows: [t] } = await pool.query<{ n: number }>(
    `insert into invite_attempts (day, ip, n) values (current_date, $1, 1)
     on conflict (day, ip) do update set n = invite_attempts.n + 1 returning n`, [ipOf(c)]);
  if ((t?.n ?? 0) > 30) throw new HTTPException(429, { message: 'Trop d’essais aujourd’hui. Réessayez demain.' });
  const body = await c.req.json().catch(() => ({})) as { token?: string };
  const m = await invitedBy(body.token);
  if (!m) throw new HTTPException(400, { message: 'Ce lien d’activation n’est plus valable (déjà utilisé ou expiré). Demandez un nouveau lien à l’administrateur.' });
  return c.json({ ok: true, email: m.email, name: m.name });
});

app.post('/v1/invitation/activate', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string };
  const email = c.get('email');
  const { rows: [m] } = await pool.query<{ active: boolean }>('select activated_at is not null as active from members where email = $1', [email]);
  if (m?.active) return c.json({ ok: true });
  const inv = await invitedBy(body.token);
  if (!inv || inv.email !== email) throw new HTTPException(400, { message: 'Lien d’activation non valable pour ce compte : demandez-en un nouveau à l’administrateur.' });
  await pool.query(`update members set activated_at = now(), invite_hash = null, invite_expires = null where email = $1`, [email]);
  return c.json({ ok: true });
});

const USER_COLS = 'email, name, role, job_title, department, phone, location, event_ids, added_at, activated_at, invite_expires, added_by';
app.get('/v1/admin/users', async (c) => {
  adminOnly(c);
  const { rows } = await pool.query(`select ${USER_COLS} from members order by coalesce(nullif(name, ''), email)`);
  return c.json({ users: rows });
});

/** Ajouter un utilisateur (fiche complète) : l'accès attend l'activation par le lien. */
app.post('/v1/admin/users', async (c) => {
  adminOnly(c);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const email = mailOf(body.email);
  const f = fiche(body);
  if (!txt(body.first_name) || !txt(body.last_name)) throw new HTTPException(400, { message: 'Le prénom et le nom sont requis.' });
  if (!MAIL.test(email)) throw new HTTPException(400, { message: 'Format d’adresse e-mail invalide.' });
  // Le rôle n'est plus choisi dans le formulaire : une nouvelle personne est « Chef de projet ».
  const role = body.role === undefined ? 'chef_projet' : roleOf(body.role);
  if (!role) throw new HTTPException(400, { message: 'Rôle invalide.' });
  const { rowCount } = await pool.query(
    `insert into members (email, name, role, job_title, department, phone, location, event_ids, added_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (email) do nothing`, [email, f.name, role, f.job_title, f.department, f.phone, f.location, f.event_ids, c.get('email')]);
  if (!rowCount) throw new HTTPException(409, { message: 'Cette adresse a déjà un accès (ou une invitation en cours).' });
  return c.json(await issueInvite(c, email), 201);
});

/** Vérifie qu'il restera au moins un administrateur actif. */
const keepsAnAdmin = async (removed: string) => {
  const { rows: [r] } = await pool.query<{ n: number }>(
    `select count(*)::int n from members where role = 'admin' and activated_at is not null and email <> $1`, [removed]);
  return (r?.n ?? 0) > 0;
};

/** Modifier la fiche et le rôle d'un utilisateur. */
app.post('/v1/admin/users/update', async (c) => {
  adminOnly(c);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const email = mailOf(body.email);
  const role = roleOf(body.role);
  if (!role) throw new HTTPException(400, { message: 'Rôle invalide.' });
  const f = fiche(body);
  if (!f.name) throw new HTTPException(400, { message: 'Le prénom et le nom sont requis.' });
  if (role !== 'admin' && !(await keepsAnAdmin(email))) throw new HTTPException(400, { message: 'Il faut garder au moins un administrateur.' });
  const { rowCount } = await pool.query(
    `update members set name = $2, role = $3, job_title = $4, department = $5, phone = $6, location = $7, event_ids = $8 where email = $1`,
    [email, f.name, role, f.job_title, f.department, f.phone, f.location, f.event_ids]);
  if (!rowCount) throw new HTTPException(404, { message: 'Utilisateur introuvable.' });
  return c.json({ ok: true });
});

app.post('/v1/admin/users/role', async (c) => {
  adminOnly(c);
  const body = await c.req.json().catch(() => ({})) as { email?: string; role?: string };
  const email = mailOf(body.email);
  const role = roleOf(body.role);
  if (!role) throw new HTTPException(400, { message: 'Rôle invalide.' });
  if (role !== 'admin' && !(await keepsAnAdmin(email))) throw new HTTPException(400, { message: 'Il faut garder au moins un administrateur.' });
  const { rowCount } = await pool.query('update members set role = $2 where email = $1', [email, role]);
  if (!rowCount) throw new HTTPException(404, { message: 'Utilisateur introuvable.' });
  return c.json({ ok: true });
});

/** Nouveau lien d'activation (renvoyé par e-mail en production). */
app.post('/v1/admin/users/invite', async (c) => {
  adminOnly(c);
  const email = mailOf((await c.req.json().catch(() => ({})) as { email?: string }).email);
  const { rows: [m] } = await pool.query<{ active: boolean }>('select activated_at is not null as active from members where email = $1', [email]);
  if (!m) throw new HTTPException(404, { message: 'Utilisateur introuvable.' });
  if (m.active) throw new HTTPException(400, { message: 'Cet accès est déjà actif.' });
  return c.json(await issueInvite(c, email));
});

app.post('/v1/admin/users/remove', async (c) => {
  adminOnly(c);
  const email = mailOf((await c.req.json().catch(() => ({})) as { email?: string }).email);
  if (email === c.get('email')) throw new HTTPException(400, { message: 'Vous ne pouvez pas retirer votre propre accès.' });
  if (!(await keepsAnAdmin(email))) throw new HTTPException(400, { message: 'Il faut garder au moins un administrateur.' });
  const { rowCount } = await pool.query('delete from members where email = $1', [email]);
  if (!rowCount) throw new HTTPException(404, { message: 'Utilisateur introuvable.' });
  return c.json({ ok: true });
});

// —— Base de données : événements ——
/* Événements : l'administrateur voit tout ; les autres seulement ceux qui leur sont attribués.
   `allowed` (absent pour l'administrateur) permet à l'appareil de retirer ce qui ne lui est plus attribué.
   `ids` : lecture complète de quelques événements (par exemple tout juste attribués, donc plus anciens que la dernière lecture). */
app.get('/v1/events', async (c) => {
  const since = c.req.query('since');
  const from = since && !Number.isNaN(Date.parse(since)) ? since : '1970-01-01T00:00:00Z';
  const only = (c.req.query('ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200);
  const scope = c.get('scope');
  const { rows } = await pool.query(
    `select id, meta, data, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
       from events
      where ($2::text[] is null and updated_at > $1::timestamptz or id = any($2::text[]))
        and ($3::text[] is null or id = any($3::text[]))
      order by updated_at`, [from, only.length ? only : null, scope ?? null]);
  return c.json({ rows, allowed: scope ?? null });
});

interface InRow { id: string; meta: unknown; data: unknown }
app.put('/v1/events', async (c) => {
  const body = await c.req.json<{ rows?: InRow[] }>().catch(() => ({ rows: undefined }));
  let rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return c.json({ saved: 0, refused: [] });
  if (rows.length > 50 || rows.some((r) => typeof r?.id !== 'string' || !r.id || r.id.length > 100 || typeof r.meta !== 'object' || typeof r.data !== 'object')) {
    throw new HTTPException(400, { message: 'Données invalides.' });
  }
  // Hors administrateur : on n'écrit que dans ses événements. Un événement nouveau (inconnu du serveur) est accepté
  // et attribué à la personne qui l'a créé ; un événement existant non attribué est refusé (l'appareil le retire).
  const scope = c.get('scope');
  let refused: string[] = [];
  if (scope) {
    const { rows: known } = await pool.query<{ id: string }>('select id from events where id = any($1::text[])', [rows.map((r) => r.id)]);
    const exists = new Set(known.map((k) => k.id));
    const created = rows.filter((r) => !exists.has(r.id)).map((r) => r.id);
    refused = rows.filter((r) => exists.has(r.id) && !scope.includes(r.id)).map((r) => r.id);
    rows = rows.filter((r) => !refused.includes(r.id));
    if (created.length) {
      await pool.query(`update members set event_ids = array(select distinct unnest(event_ids || $2::text[])) where email = $1`, [c.get('email'), created]);
    }
    if (!rows.length) return c.json({ saved: 0, refused });
  }
  // Une seule instruction : un seul identifiant de transaction (txid) pour le temps réel.
  const { rows: out } = await pool.query<{ txid: string }>(
    `insert into events (id, meta, data, updated_at, updated_by)
       select r.id, r.meta, r.data, clock_timestamp(), $2 from jsonb_to_recordset($1::jsonb) as r(id text, meta jsonb, data jsonb)
     on conflict (id) do update set meta = excluded.meta, data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by
     returning pg_current_xact_id()::text as txid`,
    [JSON.stringify(rows), c.get('userId')]);
  return c.json({ saved: out.length, txid: out[0]?.txid, refused });
});

// —— Temps réel : la plateforme est prévenue dès qu'un de SES événements change ailleurs ——
app.post('/v1/events/live', async (c) => {
  const scope = c.get('scope');
  const query = scope
    ? rawSql<{ id: string; updated_at: string }>('SELECT id, updated_at FROM events WHERE id = ANY(string_to_array($1, chr(31)))', [scope.join('\u001f')])
    : rawSql<{ id: string; updated_at: string }>('SELECT id, updated_at FROM events');
  return c.json(await realtime.seal({ query }));
});

// —— Conversations avec Sonia : privées, une par personne et par événement, synchronisées entre ses appareils ——
interface ChatMsg { uid: string; at: number; t?: number; [k: string]: unknown }
const MAX_CHAT = 2_000_000; // octets de JSON par conversation
/** Fusion de deux copies : union par uid, la version modifiée le plus récemment gagne ; ce qui précède l'effacement disparaît. */
function mergeChat(a: ChatMsg[], b: ChatMsg[], clearedAt: number): ChatMsg[] {
  const byUid = new Map<string, ChatMsg>();
  for (const m of [...a, ...b]) {
    const prev = byUid.get(m.uid);
    if (!prev || (m.t ?? m.at) >= (prev.t ?? prev.at)) byUid.set(m.uid, m);
  }
  return [...byUid.values()].filter((m) => m.at === 0 || m.at > clearedAt).sort((x, y) => x.at - y.at || (x.uid < y.uid ? -1 : 1));
}
const isChat = (v: unknown): v is ChatMsg[] => Array.isArray(v) && v.length <= 5000
  && v.every((m) => m && typeof m === 'object' && typeof (m as ChatMsg).uid === 'string' && (m as ChatMsg).uid.length <= 64 && typeof (m as ChatMsg).at === 'number');
const chatEvent = (c: Context<{ Variables: Vars }>) => {
  const id = c.req.param('eventId') ?? '';
  if (!/^[\w-]{1,100}$/.test(id)) throw new HTTPException(400, { message: 'Événement invalide.' });
  return id;
};

app.get('/v1/sonia/:eventId', async (c) => {
  const { rows } = await pool.query<{ messages: ChatMsg[]; cleared_at: string }>(
    'select messages, cleared_at from sonia_chats where user_id = $1 and event_id = $2', [c.get('userId'), chatEvent(c)]);
  return c.json({ messages: rows[0]?.messages ?? [], clearedAt: Number(rows[0]?.cleared_at ?? 0) });
});

/** Envoie la copie de l'appareil : le serveur la fusionne avec la sienne et renvoie le résultat. */
app.put('/v1/sonia/:eventId', async (c) => {
  const eventId = chatEvent(c);
  const raw = await c.req.text();
  if (raw.length > MAX_CHAT) throw new HTTPException(413, { message: 'Conversation trop longue pour être synchronisée.' });
  let body: { messages?: unknown; clearedAt?: unknown };
  try { body = JSON.parse(raw); } catch { throw new HTTPException(400, { message: 'Données invalides.' }); }
  if (!isChat(body.messages)) throw new HTTPException(400, { message: 'Données invalides.' });
  const incomingCleared = typeof body.clearedAt === 'number' && Number.isFinite(body.clearedAt) ? body.clearedAt : 0;
  const db = await pool.connect();
  try {
    await db.query('begin');
    const { rows } = await db.query<{ messages: ChatMsg[]; cleared_at: string }>(
      'select messages, cleared_at from sonia_chats where user_id = $1 and event_id = $2 for update', [c.get('userId'), eventId]);
    const clearedAt = Math.max(incomingCleared, Number(rows[0]?.cleared_at ?? 0));
    const merged = mergeChat(rows[0]?.messages ?? [], body.messages, clearedAt);
    const json = JSON.stringify(merged);
    if (json.length > MAX_CHAT) throw new HTTPException(413, { message: 'Conversation trop longue pour être synchronisée.' });
    await db.query(
      `insert into sonia_chats (user_id, event_id, messages, cleared_at, updated_at) values ($1, $2, $3::jsonb, $4, now())
       on conflict (user_id, event_id) do update set messages = excluded.messages, cleared_at = excluded.cleared_at, updated_at = now()`,
      [c.get('userId'), eventId, json, clearedAt]);
    await db.query('commit');
    return c.json({ messages: merged, clearedAt });
  } catch (e) {
    await db.query('rollback').catch(() => undefined);
    throw e;
  } finally { db.release(); }
});

// —— Stockage : pièces jointes (devis, factures…) ——
const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-120) || 'fichier';
app.post('/v1/files', async (c) => {
  const name = safeName(c.req.query('name') ?? 'fichier');
  const type = c.req.header('content-type') || 'application/octet-stream';
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (!body.length) throw new HTTPException(400, { message: 'Fichier vide.' });
  if (body.length > MAX_FILE) throw new HTTPException(413, { message: 'Fichier trop lourd (15 Mo au plus).' });
  const key = `docs/${crypto.randomUUID()}/${name}`;
  await files.upload(key, body, { contentType: type });
  return c.json({ key, size: body.length }, 201);
});
app.get('/v1/files/url', async (c) => {
  const key = c.req.query('key') ?? '';
  if (!/^docs\/[0-9a-f-]{36}\/[\w.-]+$/.test(key)) throw new HTTPException(400, { message: 'Clé de fichier invalide.' });
  if (!(await files.exists(key))) throw new HTTPException(404, { message: 'Fichier introuvable.' });
  return c.json({ url: await files.url(key, { expiresIn: 600 }) });
});

// —— Passerelle IA : Sonia ——
/* Sonia peut PROPOSER des actions dans la plateforme (outils décrits par la plateforme : ajouter des tâches, des badges…).
   Ici, rien n'est jamais exécuté : les actions proposées sont renvoyées à la plateforme, qui les montre
   à la personne connectée et ne les applique qu'après son autorisation. */
const ACTIONS_PROMPT = `
Tu peux agir dans la plateforme grâce aux outils fournis : quand on te demande de créer, modifier ou supprimer quelque chose
(même si les informations sont collées directement dans la conversation : liste de noms, tableau, e-mail…), appelle les outils voulus,
plusieurs à la fois si besoin, avec toutes les lignes données. Ces actions ne sont pas appliquées tout de suite :
la personne les verra résumées et devra les autoriser. Dans ton texte, dis brièvement ce que tu proposes et invite à vérifier puis autoriser ;
ne dis jamais que c'est déjà fait. Pour modifier ou supprimer, désigne chaque élément par son NOM exact tel qu'il figure dans le contexte (intitulé de tâche, nom d'équipe,
de prestataire, de badge, thématique de session…), jamais par un identifiant interne.
Dates au format AAAA-MM-JJ (année de l'événement si elle n'est pas précisée), heures HH:MM, montants en dollars, chiffres seulement.
Ne demande JAMAIS de confirmation avant de proposer (« Souhaitez-vous que je… ? », « Dois-je… ? ») : la carte d'autorisation EST la confirmation.
Un élément cité dans la demande n'a pas besoin d'exister déjà dans la plateforme : une tâche « Relancer le sponsor X » se crée même si X
n'est pas dans la liste des sponsors ; une personne citée comme responsable se met telle quelle. Si la personne répond « oui », « vas-y »,
« d'accord » à une de tes questions, propose aussitôt l'action concernée avec les outils. Toute action que tu proposes
DOIT passer par un appel d'outil : n'écris jamais une liste d'actions en texte sans appeler les outils correspondants. Propose directement toutes les actions
demandées, en un seul tour. Ne pose une question (courte) que s'il manque une information vraiment indispensable que tu ne peux pas déduire.
Ne propose aucune action pour une simple question, une confidence, un remerciement ou une demande de conseil (« je suis débordée », « par quoi commencer ? ») : dans ces cas, réponds et PROPOSE en texte ; n'appelle un outil que si on te demande explicitement de créer, modifier, supprimer ou générer. N'appelle QUE les outils nécessaires à ce qui est demandé : jamais d'action supplémentaire
(par exemple, pas d'équipe créée quand on demande seulement des badges), et jamais d'appel avec des paramètres vides.
Correction d'une proposition : si la personne corrige une proposition encore « en attente d'autorisation » ou « refusée » (« non, plutôt lundi »,
« mets-le à Mme X »), propose de nouveau la MÊME action complète avec la correction (elle remplace l'ancienne) ; ne modifie pas un élément qui n'existe pas encore.
Programme : pour remplacer un intervenant, changer un modérateur, un horaire ou le statut d'un intervenant, utilise modifier_session.
Bilan en fichier : quand on demande le bilan, le rapport ou le compte rendu de l'événement en PDF, Word ou Excel, appelle generer_bilan
(formats demandés ; vide si non précisé). Le fichier est créé tout de suite dans le chat, sans autorisation : dis simplement qu'il est prêt à télécharger.
Fichiers et images joints (liste Excel, document Word, capture d'écran, photo d'une liste) : traite TOUS les fichiers ET TOUTES les images jointes
(une image jointe est visible dans le message : lis-la toi-même), lis TOUTES les lignes et reprends chaque nom
exactement comme écrit (orthographe, accents), sans en oublier ni en inventer ; ignore les lignes d'en-tête et les totaux.
Badges : choisis la catégorie d'après la colonne, le titre de la liste ou la demande (équipe, organisation → Staff ou Organisation ;
intervenants, speakers, panélistes → Intervenant ; journalistes → Média ; participants, inscrits → Participant…) ; mets la fonction ou
l'organisation dans « org » si elle figure. Si la catégorie ne peut pas être devinée, demande-la avant de proposer. Une image illisible :
dis-le et demande une capture plus nette.`;

/** Langue probable du message : les consignes et les données sont en français, le modèle a tendance à y rester. */
const looksEnglish = (q: string) => {
  const w = q.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  const en = w.filter((x) => /^(the|what|is|are|how|who|which|when|where|why|can|could|please|give|me|my|our|we|to|do|does|of|and|this|that|for|with|status|budget|tasks?|week|show|list|thanks|hello|hi)$/.test(x)).length;
  const fr = w.filter((x) => /^(le|la|les|des|du|un|une|est|sont|quel|quelle|quels|qui|quoi|comment|pour|avec|sur|nous|vous|on|je|et|ce|cette|merci|bonjour|salut|c|koi)$/.test(x) || /[éèêàçùôî]/.test(x)).length;
  return w.length >= 2 && en >= 2 && en > fr * 2;
};
/** Rappel placé APRÈS le gros contexte de données : là où le modèle y prête le plus attention. */
const finalReminder = (q: string, withTools: boolean) => [
  'RAPPEL AVANT DE RÉPONDRE :',
  looksEnglish(q) ? '- The organiser wrote in ENGLISH: write your whole answer in English (keep proper names as they are).' : '- Réponds dans la langue du dernier message, en vouvoyant.',
  '- Réponse directe d’abord, chiffres et noms exacts tirés de « synthese » ; un chiffre se donne avec son repère (« 8 sur 17 », « 11 300 $ sur 31 500 $ ») ; dates en clair (« le 5 décembre »).',
  ...(withTools ? ['- Outils : seulement si le message demande explicitement de créer, modifier, supprimer ou générer quelque chose (ou corrige une proposition précédente, ex. « non, plutôt lundi »). Une question, un conseil, une confidence ou un merci → aucun outil.'] : []),
].join('\n');

/* Le modèle répond parfois par une question (« Souhaitez-vous que je crée… ? ») ou annonce des actions en texte, au lieu d'appeler
   les outils : la personne doit alors redemander. Dans ces cas, on lui redemande aussitôt, avec un appel d'outil obligatoire. */
const ACTION_VERB = /\b(ajout\w*|cr[ée]+\w*|mets?|mettre|met[st]?ez|inscri\w*|enregistr\w*|supprim\w*|enl[eè]v\w*|retir\w*|modifi\w*|chang\w*|remplac\w*|d[ée]plac\w*|renomm\w*|programm\w*|planifi\w*|assign\w*|attribu\w*|affect\w*|marqu\w*|note[rz]?|fais|faites|g[ée]n[èée]r\w*|pr[ée]par\w*|add|create|remove|delete|change|update|put|set)\b/i;
const YES = /^\s*(oui|ouais|ok|okay|d'?accord|vas-?y|allez-?y|fais-?le|faites-?le|go|confirm\w*|exact\w*|c'?est ([çc]a|bon|parfait)|parfait|yes|sure|bien s[uû]r|absolument|volontiers)\b/i;
const ASKS_OK = /(souhaitez|voulez|voudriez|d[ée]sirez)-vous que je|(dois|puis)-je|je peux (le|la|les|vous)?\s*\w*\s*si vous|confirmez|est-ce que je (cr[ée]e|ajoute|mets)|voulez-vous que|souhaitez-vous (cr[ée]er|ajouter|que)|autoris|je (vous )?propose|voici (les|ce que)|valider|\bje (vous |l[ae'] ?|les )?(vais |peux )?(programm|planifi|cr[ée]|ajout|supprim|retir|enl[eè]v|mets|met |modifi|chang|enregistr|inscri|note|pr[ée]par)/i;
const mustAct = (q: string, reply: string, history: Turn[]) => {
  if (/voulez-vous dire|lequel|laquelle|lesquel|pr[ée]cis(ez|er)|quel(le)?s? (est|sont|format|cat[ée]gorie|date|jour)/i.test(reply) && !ASKS_OK.test(reply)) return false;
  const lastSonia = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  if (YES.test(q) && q.length < 80 && /\?\s*$|\?\s*\n|souhaitez|voulez|dois-je/i.test(lastSonia)) return true;
  return ASKS_OK.test(reply) && (ACTION_VERB.test(q) || YES.test(q));
};

/** Phrase d'accompagnement quand le modèle propose des actions sans rien écrire. */
const leadIn = (actions: { name: string }[]) => {
  if (!actions.length) return '';
  if (actions.every((a) => a.name === 'generer_bilan')) return 'Votre bilan est prêt à télécharger.';
  const lines = ['C’est préparé : vérifiez ci-dessous et autorisez si tout vous convient.', 'Voilà ma proposition, je n’applique rien sans votre accord.', 'Tout est prêt ci-dessous : un coup d’œil, puis « Autoriser ».'];
  return lines[Math.floor(Math.random() * lines.length)];
};

interface Tool { name: string; description: string; parameters: Record<string, unknown> }
interface Turn { role: 'user' | 'assistant'; content: string }
type Proposed = { id: string; name: string; args: Record<string, unknown> };

const readTools = (v: unknown): Tool[] => {
  if (!Array.isArray(v)) return [];
  if (v.length > 60 || JSON.stringify(v).length > 80_000) throw new HTTPException(400, { message: 'Trop d’outils.' });
  return v.filter((t): t is Tool => !!t && typeof t.name === 'string' && /^[a-z_]{1,64}$/.test(t.name) && typeof t.description === 'string' && typeof t.parameters === 'object');
};
const readHistory = (v: unknown): Turn[] =>
  (Array.isArray(v) ? v : []).slice(-12)
    .filter((m): m is Turn => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !!m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 40_000) }));
const parseArgs = (s: unknown) => { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v && typeof v === 'object' ? v as Record<string, unknown> : {}; } catch { return {}; } };

async function answerAi(c: Context<{ Variables: Vars }>, publicMode = false) {
  const body = await c.req.json<{ question?: string; context?: unknown; history?: unknown; tools?: unknown; images?: unknown }>().catch(() => ({} as Record<string, undefined>));
  const q = (body.question ?? '').trim();
  if (!q || q.length > 80_000) throw new HTTPException(400, { message: 'Message vide ou trop long (80 000 caractères au plus).' });
  // Images jointes (captures d'écran, photos de listes) : JPEG/PNG/WebP en data URL, 5 au plus.
  const images = (Array.isArray(body.images) ? body.images : []).filter((u): u is string => typeof u === 'string');
  if (images.length > (publicMode ? 3 : 5) || images.some((u) => u.length > 4_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u))) {
    throw new HTTPException(400, { message: 'Images invalides ou trop lourdes (5 au plus).' });
  }
  const tools = readTools(body.tools);
  const history = readHistory(body.history);
  const ctx = JSON.stringify(body.context ?? {}).slice(0, 120_000);
  const system = `${SONIA_SYSTEM_PROMPT}${tools.length ? `\n${ACTIONS_PROMPT}` : ''}\n\nContexte de la plateforme (JSON) :\n${ctx}\n\n${finalReminder(q, tools.length > 0)}`;
  const messages: Turn[] = [...history, { role: 'user', content: q }];
  const prior = messages.slice(0, -1);
  const maxTokens = publicMode ? (tools.length ? 4000 : 800) : tools.length ? 16000 : 1200;
  const fail = (who: string, status: number, code?: string, message?: string): never => {
    console.error(who, status, code, message);
    if (status === 401 || status === 403) throw new HTTPException(502, { message: `La clé de Sonia est refusée par ${who}.` });
    if ((status === 429 || status === 400) && /quota|credit|billing/i.test(`${code} ${message}`)) throw new HTTPException(402, { message: `Le compte ${who} de Sonia n’a plus de crédits.` });
    if (status === 429) throw new HTTPException(429, { message: 'Sonia reçoit trop de demandes, réessayez dans un instant.' });
    throw new HTTPException(502, { message: 'Sonia n’a pas pu répondre pour le moment.' });
  };
  const call = async (url: string, headers: Record<string, string>, payload: unknown) => {
    try { return await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) }); }
    catch { throw new HTTPException(502, { message: 'Sonia n’a pas pu répondre pour le moment.' }); }
  };

  if (ANTHROPIC_KEY) {
    type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown };
    const ask = async (force: boolean) => {
    const r = await call('https://api.anthropic.com/v1/messages', { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, {
      model: SONIA_MODEL, max_tokens: maxTokens, system,
      messages: [...prior, { role: 'user', content: [
        ...images.map((u) => ({ type: 'image', source: { type: 'base64', media_type: u.slice(5, u.indexOf(';')), data: u.slice(u.indexOf(',') + 1) } })),
        { type: 'text', text: q },
      ] }],
      ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })), ...(force ? { tool_choice: { type: 'any' } } : {}) } : {}),
    });
    const out = await r.json().catch(() => ({})) as { content?: Block[]; error?: { type?: string; message?: string } };
    if (!r.ok) fail('Anthropic', r.status, out.error?.type, out.error?.message);
    return out.content ?? [];
    };
    let blocks = await ask(false);
    const said = () => blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (tools.length && !blocks.some((b) => b.type === 'tool_use') && mustAct(q, said(), history)) {
      const again = await ask(true);
      if (again.some((b) => b.type === 'tool_use')) blocks = again;
    }
    const actions: Proposed[] = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id ?? crypto.randomUUID(), name: b.name ?? '', args: parseArgs(b.input) }));
    return c.json({ text: blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim() || leadIn(actions), actions, model: SONIA_MODEL });
  }

  if (OPENAI_KEY) {
    type Msg = { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
    const ask = async (toolChoice: 'auto' | 'required') => {
      const r = await call('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${OPENAI_KEY}` }, {
        model: OPENAI_MODEL, max_completion_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...prior, { role: 'user', content: images.length
          ? [{ type: 'text', text: q }, ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))]
          : q }],
        ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: toolChoice, parallel_tool_calls: true } : {}),
      });
      const out = await r.json().catch(() => ({})) as { choices?: { message?: Msg }[]; error?: { code?: string; message?: string } };
      if (!r.ok) fail('OpenAI', r.status, out.error?.code, out.error?.message);
      return out.choices?.[0]?.message;
    };
    let m = await ask('auto');
    // Le modèle annonce parfois des actions en texte sans appeler les outils : on lui redemande, outils obligatoires.
    if (tools.length && !m?.tool_calls?.length && mustAct(q, m?.content ?? '', history)) {
      const again = await ask('required');
      // Le texte d'origine (souvent une question) est remplacé par la phrase d'accompagnement des actions.
      if (again?.tool_calls?.length) m = { content: again.content, tool_calls: again.tool_calls };
    }
    const actions: Proposed[] = (m?.tool_calls ?? []).map((t) => ({ id: t.id, name: t.function.name, args: parseArgs(t.function.arguments) }));
    return c.json({ text: (m?.content ?? '').trim() || leadIn(actions), actions, model: OPENAI_MODEL });
  }

  // Passerelle IA Neon : réponses seulement (pas d'actions, pas d'images).
  if (images.length) throw new HTTPException(400, { message: 'Sonia ne peut pas lire les images sans clé OpenAI ou Anthropic.' });
  try {
    const { text } = await generateText({ model: neonAi(AI_MODEL), system, messages, maxOutputTokens: 1200 });
    return c.json({ text, actions: [], model: AI_MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const detail = e as { statusCode?: number; responseBody?: string };
    if (detail.statusCode === 403 || /paid_plan_required|not enabled on this account|Billing|403/i.test(`${msg} ${detail.responseBody ?? ''}`)) throw new HTTPException(402, { message: 'La passerelle IA n’a pas encore de crédits (Neon → Billing).' });
    console.error('ai', msg);
    throw new HTTPException(502, { message: 'Sonia n’a pas pu répondre pour le moment.' });
  }
}
app.post('/v1/ai', (c) => answerAi(c));

/* —— Sonia sans compte (site de TEST uniquement : PUBLIC_AI=on) ——
   Permet à des testeurs d'essayer Sonia sans créer de compte. Aucune donnée de la base n'est lue ni écrite ici :
   la plateforme envoie ses propres données d'appareil comme contexte, et les actions proposées s'appliquent sur l'appareil.
   Garde-fous contre l'abus de la clé IA : origines autorisées seulement (CORS), quota par adresse IP et par jour,
   plafond global par jour, réponses et images plus limitées. En production, PUBLIC_AI reste désactivé. */
const PUBLIC_AI = process.env.PUBLIC_AI === 'on';
const PER_IP_DAY = Number(process.env.PUBLIC_AI_PER_IP_DAY) || 60;
const ALL_DAY = Number(process.env.PUBLIC_AI_PER_DAY) || 1500;
app.post('/public/ai', async (c) => {
  if (!PUBLIC_AI) throw new HTTPException(404, { message: 'Non disponible.' });
  const origin = c.req.header('origin') ?? '';
  if (!origins.includes(origin)) throw new HTTPException(403, { message: 'Origine non autorisée.' });
  const ip = ipOf(c);
  const { rows } = await pool.query<{ mine: number; total: number }>(
    `with up as (
       insert into ai_usage (day, ip, n) values (current_date, $1, 1)
       on conflict (day, ip) do update set n = ai_usage.n + 1 returning n)
     select (select n from up) as mine, (select coalesce(sum(n), 0)::int from ai_usage where day = current_date) + 1 as total`, [ip]);
  if ((rows[0]?.mine ?? 0) > PER_IP_DAY) throw new HTTPException(429, { message: `Limite d’essai atteinte pour aujourd’hui (${PER_IP_DAY} questions). Connectez-vous (sur invitation de l’administrateur) pour continuer.` });
  if ((rows[0]?.total ?? 0) > ALL_DAY) throw new HTTPException(429, { message: 'Sonia a atteint sa limite d’essais pour aujourd’hui. Réessayez demain ou connectez-vous.' });
  return answerAi(c as unknown as Context<{ Variables: Vars }>, true);
});

export default app;
