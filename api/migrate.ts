/* Applique api/schema.sql sur la branche Neon liée (variables de .env.local, connexion directe). */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error('DATABASE_URL_UNPOOLED manquant : lancez `neon env pull` à la racine.');
const branch = process.env.NEON_BRANCH ?? '?';
if (branch === 'production' && process.argv[2] !== '--production') {
  throw new Error('Branche production : relancez avec --production après accord explicite.');
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
await client.end();
console.log(`Schéma appliqué sur la branche « ${branch} ».`);
