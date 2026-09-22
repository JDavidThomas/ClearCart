alter table public.profiles
  add column if not exists health_conditions text[] not null default '{}',
  add column if not exists dietary_preferences text[] not null default '{}',
  add column if not exists custom_health_note text,
  add column if not exists health_consent_given boolean not null default false;