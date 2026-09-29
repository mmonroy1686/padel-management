-- Core tables. Every domain table carries club_id, except profiles:
-- a profile belongs to the person, and club membership lives in club_members.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

create type public.club_role as enum ('admin', 'reception', 'player');
create type public.player_side as enum ('drive', 'backhand', 'both');
create type public.dominant_hand as enum ('right', 'left');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'America/Montevideo',
  cancellation_notice_hours smallint not null default 24 check (cancellation_notice_hours >= 0),
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_covered boolean not null default false,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, name),
  -- Target for the composite FK in court_occupancy: an occupancy can only
  -- point at a court of its own club.
  unique (id, club_id)
);
alter table public.courts enable row level security;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  side public.player_side,
  hand public.dominant_hand,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'player',
  category smallint check (category between 1 and 8),
  category_validated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_id_idx on public.club_members (user_id);
alter table public.club_members enable row level security;

-- Every Auth user gets a profile. Google sends full_name; magic link does not,
-- so we fall back to the part of the email before the @.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Jugador'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
