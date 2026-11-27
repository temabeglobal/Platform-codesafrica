/* Autorise une adresse e-mail (table members) sur la branche Neon liée. Usage : npm run db:add-member -- adresse@exemple.com */
import pg from 'pg';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail invalide.');
const branch = process.env.NEON_BRANCH ?? '?';
if (branch === 'production' && process.argv[3] !== '--production') throw new Error('Branche production : relancez avec --production après accord explicite.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();
await client.query('insert into members (email) values ($1) on conflict do nothing', [email]);
await client.end();
console.log(`« ${email} » autorisé sur la branche « ${branch} ».`);
