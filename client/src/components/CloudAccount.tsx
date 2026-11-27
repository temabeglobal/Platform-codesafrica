import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronRight, Copy, KeyRound, Link2, LogIn, LogOut, Mail, MessageCircle, Pencil, Plus, RefreshCw, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { ApiError, ROLE_LABELS, addMember, changePassword, checkInvitation, getMe, listMembers, removeMember, renewInvitation, setMyName, updateMember, type Invitation, type Me, type Member, type NewUser, type Role } from '../cloud/neon';
import { useEvents } from '../events';
import { Field, Shell, input } from './WmtModals';

/* Espace utilisateur (bandeau) : avatar avec un point d'état de la synchronisation. Un clic ouvre le menu :
   Paramètres (nom, mot de passe), Synchronisation et déconnexion.
   La liste des utilisateurs (administrateur seulement) est dans le menu Équipe : voir PlatformUsers.
   Accès sur invitation uniquement (comme dans timly) : seul l'administrateur ajoute les utilisateurs ; la personne invitée
   reçoit un code et crée elle-même son mot de passe. Sans compte, la plateforme fonctionne sur l'appareil ; rien n'est envoyé. */

const time = (d?: Date) => d?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const initials = (name: string | undefined, email: string | undefined) => {
  const src = (name || email?.split('@')[0] || '?').replace(/[._-]+/g, ' ').trim();
  const parts = src.replace(/\([^)]*\)/g, ' ').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};
type Panel = 'menu' | 'signin' | 'activate' | 'settings' | 'sync' | undefined;

export default function CloudAccount() {
  const { cloud } = useEvents();
  const [panel, setPanel] = useState<Panel>();
  const [me, setMe] = useState<Me>();
  const btn = useRef<HTMLButtonElement>(null);
  const signedIn = cloud.enabled && cloud.status !== 'signed-out';
  // Lien d'activation reçu par e-mail ou WhatsApp : https://…/?invitation=<jeton>
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('invitation') ?? '');
  useEffect(() => { if (token) setPanel('activate'); }, [token]);
  const endActivation = () => {
    const u = new URL(window.location.href); u.searchParams.delete('invitation');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    setToken(''); setPanel(undefined);
  };
  // Sonia peut ouvrir la fenêtre de connexion (bouton « Se connecter » dans ses réponses).
  useEffect(() => {
    const show = () => setPanel(cloud.status === 'signed-out' ? 'signin' : 'menu');
    window.addEventListener('codes:open-account', show);
    return () => window.removeEventListener('codes:open-account', show);
  }, [cloud.status]);
  // Nom et rôle de la personne connectée (le menu « Utilisateurs » n'apparaît que pour l'administrateur).
  useEffect(() => {
    if (!signedIn || !cloud.email) { setMe(undefined); return; }
    let on = true;
    getMe().then((m) => on && setMe(m)).catch(() => undefined);
    return () => { on = false; };
  }, [signedIn, cloud.email, cloud.lastSync === undefined]);
  if (!cloud.enabled) return null;

  const { status, pending } = cloud;
  const syncLabel =
    status === 'offline' ? (pending ? `Hors ligne · ${pending} en attente` : 'Hors ligne')
    : status === 'syncing' ? 'Synchronisation…'
    : status === 'error' ? 'À vérifier'
    : cloud.lastSync ? `Synchronisé à ${time(cloud.lastSync)}` : 'Synchronisé';
  const dot = status === 'error' || pending > 0 ? 'bg-amber-400' : status === 'offline' ? 'bg-ink-400' : 'bg-emerald-400';
  const close = () => setPanel(undefined);

  return (
    <>
      {signedIn ? (
        <button ref={btn} type="button" onClick={() => setPanel(panel === 'menu' ? undefined : 'menu')} aria-haspopup="menu" aria-expanded={panel === 'menu'}
          aria-label={`Mon espace — ${me?.name || cloud.email || ''} — ${syncLabel}`} title={`Mon espace · ${syncLabel}`}
          className="relative shrink-0 w-9 h-9 rounded-full grid place-items-center bg-brand-500 text-white text-[13px] font-semibold ring-2 ring-white/25 hover:ring-white/50 transition">
          {initials(me?.name, cloud.email)}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#000b10] ${dot} ${status === 'syncing' ? 'animate-pulse' : ''}`} aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setPanel('signin')} title="Se connecter"
          className="shrink-0 flex items-center gap-2 h-9 px-3 rounded-full text-xs sm:text-sm font-medium ring-1 ring-white/20 transition bg-white/10 text-white hover:bg-white/20">
          <UserRound size={16} />
          <span className="hidden sm:inline">Se connecter</span>
        </button>
      )}
      {panel === 'menu' && signedIn && createPortal(
        <UserMenu anchor={btn} me={me} email={cloud.email} syncLabel={syncLabel} dot={dot} onClose={close} onOpen={setPanel}
          onSignOut={async () => { close(); await cloud.signOut(); }} />, document.body)}
      {/* Hors du bandeau, qui se déplace au défilement : sinon la fenêtre serait placée par rapport à lui. */}
      {createPortal(<SignInModal open={panel === 'signin' && !signedIn} onClose={close} />, document.body)}
      {createPortal(<ActivateModal open={panel === 'activate' && !!token} token={token} onClose={endActivation} />, document.body)}
      {createPortal(<SettingsModal open={panel === 'settings'} me={me} email={cloud.email} onSaved={(name) => setMe((m) => (m ? { ...m, name } : m))} onClose={close} />, document.body)}
      {createPortal(<SyncModal open={panel === 'sync'} onClose={close} />, document.body)}
    </>
  );
}

/** Menu déroulant de l'espace utilisateur, placé sous l'avatar (par-dessus toute la page). */
function UserMenu({ anchor, me, email, syncLabel, dot, onClose, onOpen, onSignOut }: {
  anchor: React.RefObject<HTMLButtonElement>; me?: Me; email?: string; syncLabel: string; dot: string;
  onClose: () => void; onOpen: (p: Panel) => void; onSignOut: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>();
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(window.innerWidth - r.right, 8) });
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!anchor.current?.contains(t) && !menu.current?.contains(t)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onClose); };
  }, [anchor, onClose]);
  const item = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[var(--sand)] focus:bg-[var(--sand)] outline-none';
  const admin = me?.role === 'admin';
  return (
    <div ref={menu} role="menu" aria-label="Mon espace" style={{ position: 'fixed', top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
      className="z-[70] w-[min(300px,calc(100vw-16px))] rounded-2xl bg-white text-brand-950 shadow-[0_18px_40px_-12px_rgba(1,33,43,.45)] ring-1 ring-ink-200 p-1.5">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="w-10 h-10 shrink-0 rounded-full grid place-items-center bg-brand-500 text-white text-sm font-semibold">{initials(me?.name, email)}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate">{me?.name || email}</span>
          {me?.name && <span className="block text-xs text-ink-500 truncate">{email}</span>}
          {me && <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${admin ? 'bg-brand-50 text-brand-800' : 'bg-ink-100 text-ink-600'}`}>
            {admin && <ShieldCheck size={11} />}{admin ? 'Administrateur' : 'Membre'}
          </span>}
        </span>
      </div>
      <div className="h-px bg-ink-100 mx-2 mb-1" />
      <button type="button" role="menuitem" className={item} onClick={() => onOpen('settings')}>
        <Settings size={17} className="text-ink-500 shrink-0" />
        <span className="flex-1 text-sm font-medium">Paramètres</span><ChevronRight size={15} className="text-ink-300" />
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => onOpen('sync')}>
        <span className="relative w-[17px] h-[17px] shrink-0 grid place-items-center"><RefreshCw size={17} className="text-ink-500" /><span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${dot}`} /></span>
        <span className="flex-1 min-w-0"><span className="block text-sm font-medium">Synchronisation</span><span className="block text-xs text-ink-500 truncate">{syncLabel}</span></span>
        <ChevronRight size={15} className="text-ink-300" />
      </button>
      <div className="h-px bg-ink-100 mx-2 my-1" />
      <button type="button" role="menuitem" className={`${item} text-red-700 hover:bg-red-50 focus:bg-red-50`} onClick={onSignOut}>
        <LogOut size={17} className="shrink-0" /><span className="text-sm font-medium">Se déconnecter</span>
      </button>
    </div>
  );
}

function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cloud } = useEvents();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword(''); setError(undefined);
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const go = async () => {
    if (!email.trim() || !password) { setError('Saisissez votre adresse e-mail et votre mot de passe.'); return; }
    setBusy(true);
    const e = await cloud.signIn(email, password);
    setBusy(false);
    if (e) setError(e); else { setPassword(''); onClose(); }
  };

  return (
    <Shell open={open} id="cloud-signin-title" title="Se connecter" subtitle="Pour partager les données avec l’équipe"
      onClose={onClose} onSubmit={go} submitLabel={busy ? 'Un instant…' : 'Se connecter'} submitIcon={<LogIn size={16} />}>
      <Field label="Adresse e-mail" required>
        <input ref={first} type="email" inputMode="email" autoComplete="username" className={input(error)} value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} />
      </Field>
      <Field label="Mot de passe" required error={error}>
        <input type="password" autoComplete="current-password" className={input(error)} value={password}
          onChange={(e) => { setPassword(e.target.value); setError(undefined); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
      </Field>
      <p className="text-xs text-ink-500"><strong className="text-ink-700">Vous avez été invité ?</strong> Ouvrez le lien d’activation reçu par e-mail ou WhatsApp pour choisir votre mot de passe. Accès sur invitation uniquement : seul l’administrateur ajoute les utilisateurs.</p>
    </Shell>
  );
}

/** Activation d'un compte par le lien reçu : la personne choisit elle-même son mot de passe (comme dans timly). */
function ActivateModal({ open, token, onClose }: { open: boolean; token: string; onClose: () => void }) {
  const { cloud } = useEvents();
  const [who, setWho] = useState<{ email: string; name: string }>();
  const [invalid, setInvalid] = useState<string>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!open) return;
    setWho(undefined); setInvalid(undefined); setDone(false);
    checkInvitation(token).then(setWho).catch((e) => setInvalid(e instanceof Error ? e.message : 'Lien non valable.'));
  }, [open, token]);

  const go = async () => {
    if (done || invalid) { onClose(); return; }
    if (password.length < 8) { setError('Mot de passe trop court (8 caractères au moins).'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    if (cloud.status !== 'signed-out') await cloud.signOut();
    const e = await cloud.acceptInvite(token, password);
    setBusy(false);
    if (e) setError(e); else { setPassword(''); setConfirm(''); setDone(true); }
  };

  return (
    <Shell open={open} id="activate-title" title="Activer mon compte" subtitle="Choisissez votre mot de passe"
      onClose={onClose} onSubmit={go}
      submitLabel={done || invalid ? 'Fermer' : busy ? 'Un instant…' : 'Activer mon compte'} submitIcon={done || invalid ? <Check size={16} /> : <KeyRound size={16} />}>
      {invalid ? (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-sm text-amber-900" role="alert">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {invalid}
        </div>
      ) : done ? (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-sm text-emerald-900" role="status">
          <Check size={16} className="shrink-0 mt-0.5" /> Votre compte est activé. Bienvenue{who?.name ? ` ${who.name}` : ''} ! Vos données sont maintenant partagées avec l’équipe.
        </div>
      ) : (
        <>
          <div className="p-4 rounded-xl bg-[var(--sand)] ring-1 ring-ink-200 text-sm space-y-1">
            {who ? <>
              <div className="font-semibold">{who.name || who.email}</div>
              <div className="text-ink-500">{who.email}</div>
            </> : <div className="text-ink-500">Vérification du lien…</div>}
          </div>
          <Field label="Mot de passe" required>
            <input type="password" autoComplete="new-password" className={input(error)} value={password} onChange={(e) => { setPassword(e.target.value); setError(undefined); }} />
          </Field>
          <Field label="Confirmer le mot de passe" required error={error}>
            <input type="password" autoComplete="new-password" className={input(error)} value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(undefined); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
          </Field>
          <p className="text-xs text-ink-500">8 caractères au moins. Vous seul connaissez ce mot de passe : l’administrateur ne le voit jamais.</p>
        </>
      )}
    </Shell>
  );
}

/** Paramètres du compte : nom affiché et mot de passe. */
function SettingsModal({ open, me, email, onSaved, onClose }: { open: boolean; me?: Me; email?: string; onSaved: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string }>();
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setName(me?.name ?? ''); setCurrent(''); setNext(''); setConfirm(''); setNameMsg(undefined); setPwdMsg(undefined);
    const t = setTimeout(() => first.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, me?.name]);
  const err = (e: unknown) => (e instanceof Error ? e.message : 'Action impossible.');

  const saveName = async () => {
    if (!name.trim()) { setNameMsg({ ok: false, text: 'Saisissez votre nom.' }); return; }
    setBusy(true);
    try { const r = await setMyName(name.trim()); onSaved(r.name); setNameMsg({ ok: true, text: 'Nom enregistré.' }); }
    catch (e) { setNameMsg({ ok: false, text: err(e) }); }
    setBusy(false);
  };
  const savePassword = async () => {
    if (!current || !next) { setPwdMsg({ ok: false, text: 'Saisissez le mot de passe actuel et le nouveau.' }); return; }
    if (next.length < 8) { setPwdMsg({ ok: false, text: 'Nouveau mot de passe trop court (8 caractères au moins).' }); return; }
    if (next !== confirm) { setPwdMsg({ ok: false, text: 'Les deux nouveaux mots de passe ne correspondent pas.' }); return; }
    setBusy(true);
    try { await changePassword(current, next); setCurrent(''); setNext(''); setConfirm(''); setPwdMsg({ ok: true, text: 'Mot de passe changé.' }); }
    catch (e) { setPwdMsg({ ok: false, text: err(e) }); }
    setBusy(false);
  };
  const note = (m?: { ok: boolean; text: string }) => m && <p className={`text-xs ${m.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{m.text}</p>;

  return (
    <Shell open={open} id="settings-title" title="Paramètres" subtitle={`${email ?? ''}${me ? ` · ${me.role === 'admin' ? 'Administrateur' : 'Membre'}` : ''}`}
      onClose={onClose} onSubmit={saveName} submitLabel={busy ? 'Un instant…' : 'Enregistrer le nom'} submitIcon={<Check size={16} />}>
      <Field label="Nom affiché">
        <input ref={first} autoComplete="name" className={input()} value={name} onChange={(e) => { setName(e.target.value); setNameMsg(undefined); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } }} />
      </Field>
      {note(nameMsg)}
      <div className="h-px bg-ink-100" />
      <div className="space-y-3">
        <span className="text-sm font-semibold flex items-center gap-2"><KeyRound size={15} /> Changer le mot de passe</span>
        <Field label="Mot de passe actuel">
          <input type="password" autoComplete="current-password" className={input()} value={current} onChange={(e) => { setCurrent(e.target.value); setPwdMsg(undefined); }} />
        </Field>
        <Field label="Nouveau mot de passe">
          <input type="password" autoComplete="new-password" className={input()} value={next} onChange={(e) => { setNext(e.target.value); setPwdMsg(undefined); }} />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <input type="password" autoComplete="new-password" className={input()} value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwdMsg(undefined); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePassword(); } }} />
        </Field>
        {note(pwdMsg)}
        <button type="button" disabled={busy} onClick={savePassword}
          className="h-10 px-4 rounded-full text-sm font-medium ring-1 ring-brand-500 text-brand-800 hover:bg-brand-50 transition disabled:opacity-50">
          Changer le mot de passe
        </button>
      </div>
    </Shell>
  );
}

/** État de la synchronisation avec les services en ligne. */
function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cloud } = useEvents();
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
      <p className="text-xs text-ink-500">Vos modifications partent en ligne automatiquement et celles de l’équipe arrivent sur cet appareil. Sans internet, tout reste enregistré ici et part au retour de la connexion.</p>
    </Shell>
  );
}

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
const DEPARTMENTS = [
  'Direction générale', 'Programme & contenus', 'Partenariats & sponsoring', 'Exposants', 'Communication & marketing',
  'Logistique & accueil', 'Accréditations & badges', 'Finance & administration', 'Women in MiningTech',
];
const select = (bad?: string) => `${input(bad)} appearance-none pr-10 bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_14px_center]`;
/** Numéro au format WhatsApp (chiffres seulement, indicatif +243 par défaut pour un numéro local). */
const waNumber = (phone: string) => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && !phone.trim().startsWith('+')) d = `243${d.slice(1)}`;
  return d.length >= 8 ? d : '';
};
const inviteMessage = (inv: Invitation) =>
  `Bonjour${inv.name ? ` ${inv.name}` : ''},\n\nUn compte vient de vous être créé sur la plateforme CODES Africa — Planning event.\n\n`
  + `Pour l’activer, choisissez votre mot de passe en ouvrant ce lien :\n${inv.setup_link}\n\nCe lien est personnel et valable ${inv.days} jours.`;

type View = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; user: Member } | { kind: 'sent'; inv: Invitation; phone: string };

/** Vrai si la personne connectée est administratrice (gestion des utilisateurs dans le menu Équipe). */
export function useIsAdmin() {
  const { cloud } = useEvents();
  const signedIn = cloud.enabled && cloud.status !== 'signed-out';
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!signedIn || !cloud.email) { setAdmin(false); return; }
    let on = true;
    getMe().then((m) => on && setAdmin(m.role === 'admin')).catch(() => undefined);
    return () => { on = false; };
  }, [signedIn, cloud.email]);
  return admin;
}

/** Utilisateurs de la plateforme (comptes connectés ou en attente d'activation), affichés dans le menu Équipe.
    Réservé à l'administrateur (le serveur le vérifie aussi) — comme dans timly. `adding` : ouvre le formulaire d'ajout
    (bouton « Ajouter un utilisateur » du haut de la page). */
export function PlatformUsers({ adding, onAddDone }: { adding: boolean; onAddDone: () => void }) {
  const { cloud, events } = useEvents();
  const names = new Set(events.map((e) => e.id));
  const [view, setView] = useState<View>({ kind: 'list' });
  const [users, setUsers] = useState<Member[]>();
  const [error, setError] = useState<string>();
  const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Action impossible.');
  const load = () => listMembers().then((u) => { setUsers(u); setError(undefined); }).catch((e) => setError(msg(e)));
  useEffect(() => { load(); }, [cloud.email]);
  useEffect(() => { if (adding) setView({ kind: 'add' }); }, [adding]);
  const back = () => { setView({ kind: 'list' }); onAddDone(); load(); };

  const modal = view.kind === 'add' || view.kind === 'edit'
    ? <UserFormModal user={view.kind === 'edit' ? view.user : undefined} self={view.kind === 'edit' && view.user.email === cloud.email?.toLowerCase()}
        onClose={back} onSent={(inv, phone) => { setView({ kind: 'sent', inv, phone }); onAddDone(); load(); }} />
    : view.kind === 'sent' ? <InviteSentModal inv={view.inv} phone={view.phone} onClose={back} /> : null;
  const active = users?.filter((u) => u.activated_at).length ?? 0;

  return (
    <section aria-labelledby="platform-users-title" className="bg-white rounded-2xl ring-1 ring-ink-200 p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="platform-users-title" className="font-display text-2xl tracking-wide text-brand-950">Utilisateurs de la plateforme</h2>
          <p className="text-xs text-ink-500 mt-0.5">Accès sur invitation : seul l’administrateur ajoute les personnes.</p>
        </div>
        <span className="text-sm text-ink-500">{users ? `${users.length} utilisateur${users.length > 1 ? 's' : ''} · ${active} actif${active > 1 ? 's' : ''}` : 'Chargement…'}</span>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <ul className="grid md:grid-cols-2 gap-px bg-ink-100 rounded-xl ring-1 ring-ink-200 overflow-hidden">
        {users?.map((u) => {
          const me = u.email === cloud.email?.toLowerCase();
          const pending = !u.activated_at;
          const expired = pending && (!u.invite_expires || new Date(u.invite_expires) < new Date());
          const n = u.event_ids?.filter((id) => names.has(id)).length ?? 0;
          const access = u.role === 'admin' ? 'tous les événements' : n ? `${n} événement${n > 1 ? 's' : ''}` : 'aucun événement';
          const sub = [u.job_title, u.department, access].filter(Boolean).join(' · ');
          return (
            <li key={u.email} className="bg-white">
              <button type="button" onClick={() => setView({ kind: 'edit', user: u })} aria-label={`Modifier ${u.name || u.email}`}
                className="w-full h-full text-left px-3 py-3 flex items-start gap-3 hover:bg-[var(--sand)] transition">
                <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center text-xs font-semibold ${u.role === 'admin' ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}>{initials(u.name, u.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{u.name || u.email}{me && <span className="text-ink-500 font-normal"> (vous)</span>}</span>
                  <span className="block text-xs text-ink-500 truncate">{sub || u.email}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-brand-50 text-brand-800' : 'bg-ink-100 text-ink-600'}`}>
                      {u.role === 'admin' && <ShieldCheck size={11} />}{ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    {pending
                      ? <span className={expired ? 'text-red-700' : 'text-amber-700'}>{expired ? 'lien d’activation expiré' : `en attente d’activation (jusqu’au ${day(u.invite_expires)})`}</span>
                      : <span className="text-emerald-700">actif{u.activated_at ? ` depuis le ${day(u.activated_at)}` : ''}</span>}
                  </span>
                </span>
                <Pencil size={14} className="text-ink-300 mt-1 shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
      {modal && createPortal(modal, document.body)}
    </section>
  );
}

/** « Ajouter un utilisateur » / « Modifier l'utilisateur » : mêmes champs que dans timly. */
function UserFormModal({ user, self, onClose, onSent }: { user?: Member; self: boolean; onClose: () => void; onSent: (inv: Invitation, phone: string) => void }) {
  const split = (n: string) => { const i = n.trim().indexOf(' '); return i < 0 ? [n.trim(), ''] : [n.slice(0, i).trim(), n.slice(i + 1).trim()]; };
  const { events, current } = useEvents();
  const [first, last] = split(user?.name ?? '');
  const [form, setForm] = useState<NewUser>({
    first_name: first, last_name: last, email: user?.email ?? '', job_title: user?.job_title ?? '', department: user?.department ?? '',
    role: user?.role ?? 'chef_projet', phone: user?.phone ?? '', location: user?.location ?? '',
    // Nouvelle personne : l'événement actif est coché d'office.
    event_ids: user ? (user.event_ids ?? []) : events.some((e) => e.id === current.id) ? [current.id] : [],
  });
  const isAdmin = form.role === 'admin';
  const toggle = (id: string) => set('event_ids', form.event_ids.includes(id) ? form.event_ids.filter((x) => x !== id) : [...form.event_ids, id]);
  const [errors, setErrors] = useState<Partial<Record<keyof NewUser | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => firstRef.current?.focus(), 50); return () => clearTimeout(t); }, []);
  const set = <K extends keyof NewUser>(k: K, v: NewUser[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })); };
  const msg = (e: unknown) => (e instanceof Error ? e.message : 'Action impossible.');
  const pending = user && !user.activated_at;

  const submit = async () => {
    const e: typeof errors = {};
    if (!form.first_name.trim()) e.first_name = 'Le prénom est requis.';
    if (!form.last_name.trim()) e.last_name = 'Le nom est requis.';
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = form.email.trim() ? 'Format d’e-mail invalide.' : 'L’adresse e-mail est requise.';
    if (!isAdmin && !form.event_ids.length) e.event_ids = 'Choisissez au moins un événement.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (user) {
        await updateMember(user.email, form.role, { name: `${form.first_name.trim()} ${form.last_name.trim()}`, job_title: form.job_title, department: form.department, phone: form.phone, location: form.location, event_ids: form.event_ids });
        onClose();
      } else {
        const inv = await addMember({ ...form, email: form.email.trim().toLowerCase() });
        onSent(inv, form.phone.trim());
      }
    } catch (err) { setErrors({ form: msg(err) }); }
    setBusy(false);
  };
  const renew = async () => {
    if (!user) return;
    setBusy(true);
    try { onSent(await renewInvitation(user.email), form.phone.trim()); } catch (err) { setErrors({ form: msg(err) }); }
    setBusy(false);
  };
  const remove = async () => {
    if (!user) return;
    try { await removeMember(user.email); onClose(); } catch (err) { setErrors({ form: msg(err) }); }
  };

  return (
    <Shell open id="user-form-title" title={user ? 'Modifier l’utilisateur' : 'Ajouter un utilisateur'}
      subtitle={user ? user.email : 'Il définira lui-même son mot de passe'}
      onClose={onClose} onSubmit={submit} submitLabel={busy ? 'Un instant…' : user ? 'Enregistrer' : 'Créer le compte'} submitIcon={user ? <Check size={16} /> : <Plus size={16} />}
      onDelete={user && !self ? remove : undefined} deleteText={`Retirer l’accès de ${user?.name || user?.email} ? La personne ne pourra plus ouvrir la plateforme.`}>
      {!user && <p className="text-sm text-ink-600 -mt-1">Un e-mail d’invitation sera envoyé à l’utilisateur pour qu’il définisse son propre mot de passe.</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Prénom" required error={errors.first_name}>
          <input ref={firstRef} autoComplete="off" placeholder="Grâce" className={input(errors.first_name)} value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
        </Field>
        <Field label="Nom" required error={errors.last_name}>
          <input autoComplete="off" placeholder="Mbuyi" className={input(errors.last_name)} value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
        </Field>
      </div>
      <Field label="Adresse e-mail professionnelle" required={!user} error={errors.email}>
        <input type="email" inputMode="email" autoComplete="off" placeholder="grace.mbuyi@codesafrica.com" readOnly={!!user}
          className={`${input(errors.email)} ${user ? 'text-ink-500' : ''}`} value={form.email} onChange={(e) => set('email', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Fonction">
          <input autoComplete="off" placeholder="Chargée des partenariats" className={input()} value={form.job_title} onChange={(e) => set('job_title', e.target.value)} />
        </Field>
        <Field label="Département">
          <select className={`${select()} ${form.department ? '' : 'text-ink-400'}`} value={form.department} onChange={(e) => set('department', e.target.value)}>
            <option value="">Choisir un département</option>
            {[...DEPARTMENTS, ...(form.department && !DEPARTMENTS.includes(form.department) ? [form.department] : [])].map((d) => <option key={d} value={d} className="text-brand-950">{d}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Téléphone">
          <input type="tel" inputMode="tel" autoComplete="off" placeholder="+243 8 00 00 00 00" className={input()} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Localisation">
          <input autoComplete="off" placeholder="Kinshasa" className={input()} value={form.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
      </div>
      <Field label="Événements accessibles" required={!isAdmin} error={errors.event_ids}>
        {isAdmin ? (
          <p className="text-sm text-ink-600">Administrateur : voit tous les événements de la plateforme.</p>
        ) : (
          <>
            <p className="text-xs text-ink-500">La personne ne verra que les événements cochés (et ceux qu’elle créera elle-même).</p>
            <ul className="rounded-xl ring-1 ring-ink-200 divide-y divide-ink-100 max-h-56 overflow-y-auto">
              {events.map((ev) => {
                const on = form.event_ids.includes(ev.id);
                return (
                  <li key={ev.id}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--sand)]">
                      <input type="checkbox" className="w-4 h-4 accent-[#00a3cc] shrink-0" checked={on} onChange={() => toggle(ev.id)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ev.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{ev.name}</span>
                        <span className="block text-xs text-ink-500 truncate">{[ev.start && new Date(ev.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }), ev.place].filter(Boolean).join(' · ')}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Field>
      {pending && (
        <button type="button" disabled={busy} onClick={renew} className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
          <Link2 size={15} /> Renvoyer un nouveau lien d’activation
        </button>
      )}
      {errors.form && <p className="text-sm text-red-700" role="alert">{errors.form}</p>}
    </Shell>
  );
}

/** Après la création : e-mail envoyé (production) ou lien à partager (copie, WhatsApp) — comme dans timly. */
function InviteSentModal({ inv, phone, onClose }: { inv: Invitation; phone: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [wa, setWa] = useState(false);
  const number = waNumber(phone);
  const copy = async () => { try { await navigator.clipboard.writeText(inv.setup_link); setCopied(true); } catch { /* sélection manuelle */ } };
  const whatsapp = () => {
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(inv))}`, '_blank', 'noopener');
    setWa(true);
  };
  return (
    <Shell open id="invite-sent-title" title={inv.email_sent ? 'Invitation envoyée' : 'Compte créé'} subtitle={inv.name || inv.email}
      onClose={onClose} onSubmit={onClose} submitLabel="Fermer" submitIcon={<Check size={16} />}>
      <div className="p-4 rounded-xl bg-[var(--sand)] ring-1 ring-ink-200 text-sm flex items-center justify-between gap-3">
        <span className="text-ink-500">Adresse e-mail</span><span className="font-medium truncate">{inv.email}</span>
      </div>
      {inv.email_sent ? (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-xs text-emerald-800 leading-relaxed">
          <Mail size={16} className="shrink-0" />
          <p>Un e-mail d’invitation a été envoyé automatiquement à <strong>{inv.email}</strong> avec un lien pour définir le mot de passe (valable {inv.days} jours).</p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 text-xs text-amber-800 leading-relaxed">
          <AlertTriangle size={16} className="shrink-0" />
          <p>{inv.email_locked
            ? <>Environnement de test : aucun e-mail réel n’est envoyé (protection volontaire). Le compte est bien créé ; en production, l’invitation partira automatiquement à <strong>{inv.email}</strong>. Pour tester, utilisez le lien d’activation ci-dessous.</>
            : <>L’e-mail d’invitation n’a pas pu être envoyé automatiquement. Partagez le lien d’activation ci-dessous avec <strong>{inv.email}</strong>, ou envoyez-le sur WhatsApp.</>}</p>
        </div>
      )}
      {!inv.email_sent && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--sand)] ring-1 ring-ink-200">
          <span className="flex-1 min-w-0 text-xs font-mono truncate select-all">{inv.setup_link}</span>
          <button type="button" onClick={copy} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline shrink-0">
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}
      {number ? (
        <div className="space-y-2">
          <button type="button" onClick={whatsapp} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm transition">
            <MessageCircle size={16} /> {wa ? 'Relancer sur WhatsApp' : 'Envoyer le lien sur WhatsApp'}
          </button>
          {wa && <p className="text-xs text-emerald-700 text-center">WhatsApp est ouvert : appuyez sur « Envoyer » dans l’application pour finaliser l’envoi.</p>}
        </div>
      ) : (
        <p className="text-xs text-ink-500 text-center">Aucun numéro de téléphone renseigné : envoi WhatsApp impossible.</p>
      )}
    </Shell>
  );
}
