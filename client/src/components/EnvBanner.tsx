// Affiche clairement l'environnement hors production.
const env = (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';

export const isProduction = env === 'production';

export default function EnvBanner() {
  if (isProduction) return null;
  const name = env === 'test' ? 'TEST' : 'LOCAL';
  return (
    <div className="bg-royal-400 text-ink-900 text-[11px] sm:text-xs font-semibold tracking-widest text-center py-1">
      ENVIRONNEMENT {name}<span className="hidden sm:inline"> — les données ne sont pas celles de la production</span>
    </div>
  );
}
