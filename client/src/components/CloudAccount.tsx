import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Cloud, CloudOff, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { useEvents } from '../events';
import { Field, Shell, input } from './WmtModals';

/* Bouton du bandeau : état de la synchronisation avec les services en ligne (Neon), connexion, création de compte et déconnexion.
   Sans compte, la plateforme fonctionne normalement sur l'appareil ; rien n'est envoyé. */

const time = (d?: Date) => d?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function CloudAccount() {
  const { cloud } = useEvents();
  const [open, setOpen] = useState(false);
  // Sonia peut ouvrir la fenêtre de connexion (bouton « Se connecter » dans ses réponses).
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('codes:open-account', show);
    return () => window.removeEventListener('codes:open-account', show);
  }, []);
  if (!cloud.enabled) return null;

  const { status, pending } = cloud;
  const label =
    status === 'signed-out' ? 'Se connecter'
    : status === 'offline' ? (pending ? `${pending} en attente` : 'Hors ligne')
    : status === 'syncing' ? 'Synchronisation…'
    : status === 'error' ? 'À vérifier'
    : 'Synchronisé';
  const Icon = status === 'signed-out' ? LogIn : status === 'offline' ? CloudOff : status === 'error' ? AlertTriangle : status === 'syncing' ? RefreshCw : Cloud;
  const tone = status === 'error' ? 'bg-amber-400 text-ink-900 hover:bg-amber-300' : 'bg-white/10 text-white hover:bg-white/20';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={status === 'ok' && cloud.lastSync ? `Dernière synchronisation à ${time(cloud.lastSync)}` : label}
        className={`shrink-0 flex items-center gap-2 h-9 px-3 rounded-full text-xs sm:text-sm font-medium ring-1 ring-white/20 transition ${tone}`}>
        <Icon size={15} className={status === 'syncing' ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {/* Hors du bandeau, qui se déplace au défilement : sinon la fenêtre serait placée par rapport à lui. */}
      {createPortal(<AccountModal open={open} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cloud } = useEvents();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const signedIn = cloud.status !== 'signed-out';

  useEffect(() => {
    if (!open) return;
    setPassword(''); setError(undefined);
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, mode]);

  const go = async () => {
    if (!email.trim() || !password) { setError('Saisissez votre adresse e-mail et votre mot de passe.'); return; }
    if (mode === 'up' && password.length < 8) { setError('Mot de passe trop court (8 caractères au moins).'); return; }
    setBusy(true);
    const e = mode === 'in' ? await cloud.signIn(email, password) : await cloud.signUp(name, email, password);
    setBusy(false);
    if (e) setError(e); else { setPassword(''); onClose(); }
  };

  if (!signedIn) return (
    <Shell open={open} id="cloud-signin-title" title={mode === 'in' ? 'Se connecter' : 'Créer un compte'} subtitle="Pour partager les données avec l’équipe"
      onClose={onClose} onSubmit={go}
      submitLabel={busy ? 'Un instant…' : mode === 'in' ? 'Se connecter' : 'Créer le compte'} submitIcon={mode === 'in' ? <LogIn size={16} /> : <UserPlus size={16} />}>
      {mode === 'up' && (
        <Field label="Nom">
          <input ref={first} autoComplete="name" className={input()} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <Field label="Adresse e-mail" required>
        <input ref={mode === 'in' ? first : undefined} type="email" inputMode="email" autoComplete="username" className={input(error)} value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} />
      </Field>
      <Field label="Mot de passe" required error={error}>
        <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className={input(error)} value={password}
          onChange={(e) => { setPassword(e.target.value); setError(undefined); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
      </Field>
      <button type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(undefined); }} className="text-sm text-brand-700 hover:underline">
        {mode === 'in' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </button>
      <p className="text-xs text-ink-500">Une fois connecté, vos modifications sont envoyées en ligne et celles de l’équipe arrivent sur cet appareil. Sans connexion, tout reste enregistré ici et part dès le retour d’internet. Un nouveau compte doit être autorisé par l’administrateur avant de voir les données.</p>
    </Shell>
  );

  const state =
    cloud.status === 'offline' ? 'Hors connexion : les modifications sont gardées sur l’appareil et partiront au retour d’internet.'
    : cloud.status === 'syncing' ? 'Synchronisation en cours…'
    : cloud.status === 'error' ? cloud.error
    : cloud.lastSync ? `Tout est à jour (dernière synchronisation à ${time(cloud.lastSync)}).` : 'Connecté.';

  return (
    <Shell open={open} id="cloud-account-title" title="Synchronisation" subtitle={`Connecté : ${cloud.email ?? ''}`}
      onClose={onClose} onSubmit={() => cloud.syncNow()} submitLabel="Synchroniser maintenant" submitIcon={<RefreshCw size={16} />}>
      <div className={`rounded-xl px-4 py-3 text-sm ${cloud.status === 'error' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-[var(--sand)]'}`} role="status">
        {state}
        {cloud.pending > 0 && <div className="mt-1 text-ink-500">{cloud.pending} événement{cloud.pending > 1 ? 's' : ''} pas encore envoyé{cloud.pending > 1 ? 's' : ''}.</div>}
        <div className="mt-1 text-ink-500">{cloud.live ? 'Temps réel actif : les changements de l’équipe arrivent immédiatement.' : 'Temps réel en attente de connexion.'}</div>
      </div>
      <button type="button" onClick={async () => { await cloud.signOut(); onClose(); }}
        className="flex items-center gap-2 text-sm text-red-700 hover:underline">
        <LogOut size={15} /> Se déconnecter
      </button>
      <p className="text-xs text-ink-500">Après la déconnexion, les données restent sur cet appareil mais ne sont plus partagées.</p>
    </Shell>
  );
}
