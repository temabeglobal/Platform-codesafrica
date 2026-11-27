-- CODES Africa — Planning event : schéma Postgres (Neon).
-- Appliqué par `npm run db:migrate` (connexion directe, branche liée dans .neon). Relançable sans risque.

-- Un événement par ligne : ses informations (meta) et toutes ses données (tâches, budget, badges…).
create table if not exists events (
  id         text primary key,
  meta       jsonb not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists events_updated_at_idx on events (updated_at);

-- Personnes autorisées à lire et écrire (adresse e-mail de leur compte Neon Auth, en minuscules).
-- Se gère depuis la console Neon (SQL Editor) ou psql, jamais depuis la plateforme.
create table if not exists members (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

-- Gestion des utilisateurs par l'administrateur (comme dans timly : accès sur invitation uniquement).
-- Une personne ajoutée reçoit un lien d'activation à usage unique
-- (seule son empreinte SHA-256 est gardée) ; elle crée son mot de passe avec ce lien, puis son accès est actif (activated_at).
alter table members add column if not exists name text not null default '';
alter table members add column if not exists role text not null default 'membre';
alter table members add column if not exists added_by text;
alter table members add column if not exists invite_hash text;
alter table members add column if not exists invite_expires timestamptz;
alter table members add column if not exists activated_at timestamptz;
-- Fiche de la personne (comme dans timly) : fonction, département, téléphone, localisation.
alter table members add column if not exists job_title  text not null default '';
alter table members add column if not exists department text not null default '';
alter table members add column if not exists phone      text not null default '';
alter table members add column if not exists location   text not null default '';
-- Événements attribués par l'administrateur : une personne non administratrice ne voit que ceux-ci
-- (plus ceux qu'elle crée elle-même, ajoutés automatiquement). L'administrateur voit tout.
alter table members add column if not exists event_ids text[] not null default '{}';
-- Rôles : admin (gère les utilisateurs), chef_projet et membre (lisent et modifient les données).
alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check check (role in ('admin', 'chef_projet', 'membre'));
-- Personnes inscrites avant les invitations : déjà actives.
update members set activated_at = added_at where activated_at is null and invite_hash is null;

-- Vérifications de liens d'activation (limite par adresse IP et par jour, contre les essais en série).
create table if not exists invite_attempts (
  day date not null,
  ip  text not null,
  n   int  not null default 0,
  primary key (day, ip)
);

-- Quotas de Sonia sans compte (site de test) : nombre de questions par jour et par adresse IP.
create table if not exists ai_usage (
  day date not null,
  ip  text not null,
  n   int  not null default 0,
  primary key (day, ip)
);

-- Conversations avec Sonia : privées (une par personne et par événement), jamais partagées avec l'équipe.
-- messages : tableau JSON (chaque message a un identifiant uid, sa date de création « at » et de dernière modification « t »).
-- cleared_at : date (horloge de l'appareil, en ms) du dernier effacement décidé par la personne ; les messages plus anciens sont supprimés partout.
create table if not exists sonia_chats (
  user_id    text   not null,
  event_id   text   not null,
  messages   jsonb  not null default '[]',
  cleared_at bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
