-- Applied to project rdfhauvxbubmpmiswxyc on 2026-11-23. Kept here for reference.
create table if not exists public.dif_attempts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pid text not null, method text, mode text not null default 'practice',
  start_ms bigint not null, end_ms bigint, secs integer,
  status text not null default 'open' check (status in ('open','solved','help','missed')),
  checks integer not null default 0, hints integer not null default 0, explains integer not null default 0,
  grades integer not null default 0, asks integer not null default 0, issues integer not null default 0,
  solution boolean not null default false, strokes integer not null default 0,
  last text, score numeric, exam text, updated_at timestamptz not null default now()
);
create table if not exists public.dif_attempt_ink (
  attempt_id text primary key references public.dif_attempts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.dif_progress (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.dif_tutor_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(), model text, input_tokens integer, output_tokens integer
);
-- RLS: every table is readable/writable only by its owner (dif_tutor_usage: read-only for the owner).
