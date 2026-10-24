-- Trench League — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Money/amount conventions:
--   * SOL amounts: numeric(20, 9)
--   * token amounts: numeric(38, 6)
--   * token prices: numeric(38, 18)   (memecoin prices can be tiny)
--
-- Writes that touch balances (trades, league settlement, cron) are done by the
-- service role in server code. Users only ever get SELECT on trading tables.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,20}$'
  )
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  mode text not null check (mode in ('paper', 'calls')),
  starting_balance numeric(20, 9) not null default 10 check (starting_balance > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  invite_code text not null unique,
  max_players integer not null default 20 check (max_players between 2 and 100),
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'ended')),
  created_at timestamptz not null default now(),
  constraint leagues_window check (ends_at > starts_at)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('practice', 'league')),
  league_id uuid references public.leagues (id) on delete cascade,
  sol_balance numeric(20, 9) not null default 0 check (sol_balance >= 0),
  starting_balance numeric(20, 9) not null check (starting_balance >= 0),
  created_at timestamptz not null default now(),
  constraint accounts_league_link check (
    (type = 'league') = (league_id is not null)
  )
);

-- One practice account per user, one account per user per league.
create unique index accounts_one_practice_per_user
  on public.accounts (user_id)
  where type = 'practice';

create unique index accounts_one_per_league
  on public.accounts (user_id, league_id)
  where type = 'league';

create table public.tokens (
  mint text primary key,
  ticker text,
  name text,
  image_url text,
  created_at_onchain timestamptz,
  graduated boolean not null default false,
  last_price numeric(38, 18),
  last_market_cap numeric(20, 2),
  last_updated timestamptz
);

create table public.positions (
  account_id uuid not null references public.accounts (id) on delete cascade,
  token_mint text not null,
  token_amount numeric(38, 6) not null default 0 check (token_amount >= 0),
  avg_entry_price numeric(38, 18) not null default 0,
  cost_basis_sol numeric(20, 9) not null default 0 check (cost_basis_sol >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, token_mint)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  token_mint text not null,
  side text not null check (side in ('buy', 'sell')),
  sol_amount numeric(20, 9) not null check (sol_amount >= 0),
  token_amount numeric(38, 6) not null check (token_amount >= 0),
  price numeric(38, 18) not null,
  price_impact numeric(10, 6) not null default 0,
  fees numeric(20, 9) not null default 0,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  joined_at timestamptz not null default now(),
  final_rank integer,
  final_gain numeric(10, 4),
  primary key (league_id, user_id)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  option_a text not null,
  option_b text not null,
  locks_at timestamptz not null,
  resolves_at timestamptz not null,
  result text check (result in ('a', 'b')),
  round_id text,
  created_at timestamptz not null default now(),
  constraint calls_window check (resolves_at > locks_at)
);

create table public.call_picks (
  call_id uuid not null references public.calls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pick text not null check (pick in ('a', 'b')),
  correct boolean,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (call_id, user_id)
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete set null,
  awarded_at timestamptz not null default now()
);

create unique index user_badges_unique
  on public.user_badges (user_id, badge_id, league_id) nulls not distinct;

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index accounts_user_idx on public.accounts (user_id);
create index positions_account_idx on public.positions (account_id);
create index trades_account_created_idx
  on public.trades (account_id, created_at desc);
create index trades_token_created_idx
  on public.trades (token_mint, created_at desc);
create index tokens_graduated_created_idx
  on public.tokens (graduated, created_at_onchain desc);
create index leagues_status_idx on public.leagues (status, ends_at);
create index league_members_league_idx on public.league_members (league_id);
create index league_members_user_idx on public.league_members (user_id);
create index calls_locks_idx on public.calls (locks_at);
create index call_picks_user_idx on public.call_picks (user_id);
create index user_badges_user_idx on public.user_badges (user_id);
create index activity_league_created_idx
  on public.activity (league_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can check ownership
-- without recursive policy evaluation). Declared after the tables because
-- Postgres validates SQL function bodies at creation time.
-- ---------------------------------------------------------------------------

create or replace function public.owns_account(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = p_account
      and a.user_id = auth.uid()
  );
$$;

create or replace function public.is_league_member(
  p_league uuid,
  p_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members m
    where m.league_id = p_league
      and m.user_id = p_user
  );
$$;

create or replace function public.is_league_public(p_league uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leagues l
    where l.id = p_league
      and l.visibility = 'public'
  );
$$;

-- A league is joinable while it is upcoming/live, before it ends, and not full.
create or replace function public.is_league_joinable(p_league uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leagues l
    where l.id = p_league
      and l.status in ('upcoming', 'live')
      and l.ends_at > now()
      and (
        select count(*)
        from public.league_members m
        where m.league_id = l.id
      ) < l.max_players
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile + practice account (10 paper SOL)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  insert into public.accounts (user_id, type, sol_balance, starting_balance)
  values (new.id, 'practice', 10, 10)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.tokens enable row level security;
alter table public.positions enable row level security;
alter table public.trades enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.calls enable row level security;
alter table public.call_picks enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.activity enable row level security;

-- profiles: public read (usernames appear on leaderboards), own-row updates.
create policy profiles_read_all on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- accounts: read your own. Balances are written only by the service role.
create policy accounts_read_own on public.accounts
  for select to authenticated using (user_id = auth.uid());

-- tokens: shared market data, server-written.
create policy tokens_read_all on public.tokens
  for select to authenticated using (true);

-- positions / trades: your own accounts only.
create policy positions_read_own on public.positions
  for select to authenticated using (public.owns_account(account_id));

create policy trades_read_own on public.trades
  for select to authenticated using (public.owns_account(account_id));

-- leagues: visible when public, when you're the creator, or when you're in it.
create policy leagues_read on public.leagues
  for select to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or public.is_league_member(id)
  );

create policy leagues_insert_own on public.leagues
  for insert to authenticated
  with check (created_by = auth.uid());

create policy leagues_update_own on public.leagues
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- league_members: your row, plus rows in leagues you belong to or that are public.
create policy league_members_read on public.league_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_league_member(league_id)
    or public.is_league_public(league_id)
  );

create policy league_members_join_self on public.league_members
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_league_joinable(league_id));

-- calls: shared content. Picks are private until results are published.
create policy calls_read_all on public.calls
  for select to authenticated using (true);

create policy call_picks_read_own on public.call_picks
  for select to authenticated using (user_id = auth.uid());

create policy call_picks_insert_own on public.call_picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.calls c
      where c.id = call_id and now() < c.locks_at
    )
  );

create policy call_picks_update_own on public.call_picks
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.calls c
      where c.id = call_id and now() < c.locks_at
    )
  )
  with check (user_id = auth.uid());

-- badges: public catalog and public awards.
create policy badges_read_all on public.badges
  for select to authenticated using (true);

create policy user_badges_read_all on public.user_badges
  for select to authenticated using (true);

-- activity: readable inside leagues you belong to, or public leagues.
create policy activity_read on public.activity
  for select to authenticated
  using (
    league_id is not null
    and (
      public.is_league_member(league_id)
      or public.is_league_public(league_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (RLS above is the real gate; these mirror the intended access)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on
  public.profiles,
  public.accounts,
  public.tokens,
  public.positions,
  public.trades,
  public.leagues,
  public.league_members,
  public.calls,
  public.call_picks,
  public.badges,
  public.user_badges,
  public.activity
to authenticated;

grant update (username, avatar_url) on public.profiles to authenticated;
grant insert, update on public.leagues to authenticated;
grant insert on public.league_members to authenticated;
grant insert, update on public.call_picks to authenticated;

-- The trusted server role (trading engine, cron, league settlement) bypasses
-- RLS on Supabase; it needs table privileges to write balances and trades.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
