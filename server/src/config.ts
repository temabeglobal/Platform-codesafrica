// Choix automatique de la configuration selon l'environnement.
// Garde-fou : le local et le test ne peuvent JAMAIS utiliser la base de production.
export type AppEnv = 'local' | 'test' | 'production';

const env = (process.env.APP_ENV ?? 'local') as AppEnv;
if (!['local', 'test', 'production'].includes(env)) throw new Error(`APP_ENV invalide : ${env}`);

const dbName = process.env.MONGODB_DB ?? `platform_${env === 'production' ? 'prod' : env}`;
const expectedSuffix = env === 'production' ? '_prod' : env === 'test' ? '_test' : '_local';
if (!dbName.endsWith(expectedSuffix)) {
  throw new Error(`Base « ${dbName} » incompatible avec l'environnement « ${env} » (suffixe attendu : ${expectedSuffix}).`);
}

export const config = {
  env,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? '',
  dbName,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5181').split(','),
};
