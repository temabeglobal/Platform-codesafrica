/* Donne un accès directement, sans code d'invitation, sur la branche Neon liée (variables du fichier .env choisi).
   Sert surtout à nommer le PREMIER administrateur ; ensuite, l'administrateur invite les autres depuis la plateforme
   (bouton de synchronisation › Utilisateurs).
   Usage : npx tsx --env-file=.env.local api/add-member.ts adresse@exemple.com [--admin] [--production] */
import pg from 'pg';

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail invalide.');
const role = args.includes('--admin') ? 'admin' : 'membre';
const branch = process.env.NEON_BRANCH ?? '?';
if (branch === 'production' && !args.includes('--production')) throw new Error('Branche production : relancez avec --production après accord explicite.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();
await client.query(
  `insert into members (email, role, activated_at) values ($1, $2, now())
   on conflict (email) do update set role = excluded.role, activated_at = coalesce(members.activated_at, now()), invite_hash = null, invite_expires = null`,
  [email, role]);
await client.end();
console.log(`« ${email} » : accès actif (${role}) sur la branche « ${branch} ».`);
