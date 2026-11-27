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
