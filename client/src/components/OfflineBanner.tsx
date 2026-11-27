import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

/* Indique quand internet est coupé : la plateforme continue de fonctionner et enregistre sur l'appareil.
   Au retour de la connexion, un message bref le confirme. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [back, setBack] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const up = () => { setOnline(true); setBack(true); clearTimeout(t); t = setTimeout(() => setBack(false), 4000); };
    const down = () => { setOnline(false); setBack(false); clearTimeout(t); };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearTimeout(t); };
  }, []);

  if (online && !back) return null;
  return (
    <div role="status" className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs sm:text-sm font-semibold text-center ${online ? 'bg-accent-500 text-brand-950' : 'bg-amber-400 text-ink-900'}`}>
      {online
        ? <><Wifi size={15} className="shrink-0" /> De nouveau en ligne.</>
        : <><WifiOff size={15} className="shrink-0" /> Hors connexion — la plateforme continue de fonctionner ; vos modifications sont enregistrées sur cet appareil.</>}
    </div>
  );
}
