-- Trench League — 0003: friend leagues
--
-- A league is a private scoreboard with its own money. Joining creates a
-- `league` account funded with the league's starting balance, so a league
-- never shares a balance with your practice account or with another league.
--
-- Everything that creates money (league creation, joining) runs through a
-- SECURITY DEFINER function called by the service role. The browser only ever
-- passes a name or an invite code; the server decides the balance. That is what
-- stops someone from joining a 5 SOL league and minting 100 SOL.
--
-- Ranking is by % gain, not raw equity, so starting balance doesn't matter.

-- ---------------------------------------------------------------------------
-- Invite codes
-- ---------------------------------------------------------------------------

-- 8 characters from an alphabet without 0/O/1/I so codes survive being read
-- aloud or retyped from a screenshot.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from public.leagues where invite_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_invite_code() from public, anon, authenticated;
grant execute on function public.generate_invite_code() to service_role;

-- ---------------------------------------------------------------------------
-- Create a league
-- ---------------------------------------------------------------------------

-- Starts immediately and runs for p_duration_days. The creator is joined on
-- the spot so a fresh league already has a code and a leaderboard row.
create or replace function public.create_paper_league(
  p_user_id uuid,
  p_name text,
  p_starting_balance numeric,
  p_duration_days integer,
  p_max_players integer,
  p_visibility text default 'private'
)
returns table (out_league_id uuid, out_invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
  v_code text;
  v_account_id uuid;
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 60 then
    raise exception 'invalid_name';
  end if;

  if p_starting_balance is null
     or p_starting_balance < 1
     or p_starting_balance > 1000 then
    raise exception 'invalid_balance';
  end if;

  if p_duration_days is null or p_duration_days < 1 or p_duration_days > 90 then
    raise exception 'invalid_duration';
  end if;

  if p_max_players is null or p_max_players < 2 or p_max_players > 100 then
    raise exception 'invalid_max_players';
  end if;

  if p_visibility is null or p_visibility not in ('private', 'public') then
    raise exception 'invalid_visibility';
  end if;

  v_code := public.generate_invite_code();

  insert into public.leagues (
    name, mode, starting_balance, starts_at, ends_at,
    visibility, invite_code, max_players, created_by, status
  )
  values (
    btrim(p_name), 'paper', p_starting_balance, now(),
    now() + make_interval(days => p_duration_days),
    p_visibility, v_code, p_max_players, p_user_id, 'live'
  )
  returning * into v_league;

  insert into public.accounts (user_id, type, league_id, sol_balance, starting_balance)
  values (p_user_id, 'league', v_league.id, p_starting_balance, p_starting_balance)
  returning id into v_account_id;

  insert into public.league_members (league_id, user_id, account_id)
  values (v_league.id, p_user_id, v_account_id);

  return query select v_league.id as out_league_id, v_code as out_invite_code;
end;
$$;

revoke all on function public.create_paper_league(
  uuid, text, numeric, integer, integer, text
) from public, anon, authenticated;

grant execute on function public.create_paper_league(
  uuid, text, numeric, integer, integer, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Join a league by invite code
-- ---------------------------------------------------------------------------

-- Idempotent-ish by design: a second join for the same user raises
-- `already_member` instead of quietly creating a second account with a second
-- starting balance, which would be free paper SOL.
create or replace function public.join_paper_league(
  p_user_id uuid,
  p_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
  v_account_id uuid;
  v_members integer;
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_invite_code is null or char_length(btrim(p_invite_code)) < 4 then
    raise exception 'invalid_code';
  end if;

  select * into v_league
  from public.leagues
  where invite_code = upper(btrim(p_invite_code))
    and mode = 'paper';

  if not found then
    raise exception 'league_not_found';
  end if;

  if v_league.ends_at <= now() then
    raise exception 'league_ended';
  end if;

  if exists (
    select 1 from public.league_members m
    where m.league_id = v_league.id and m.user_id = p_user_id
  ) then
    raise exception 'already_member';
  end if;

  select count(*) into v_members
  from public.league_members m
  where m.league_id = v_league.id;

  if v_members >= v_league.max_players then
    raise exception 'league_full';
  end if;

  insert into public.accounts (user_id, type, league_id, sol_balance, starting_balance)
  values (p_user_id, 'league', v_league.id, v_league.starting_balance, v_league.starting_balance)
  returning id into v_account_id;

  insert into public.league_members (league_id, user_id, account_id)
  values (v_league.id, p_user_id, v_account_id);

  return v_league.id;
end;
$$;

revoke all on function public.join_paper_league(uuid, text)
  from public, anon, authenticated;

grant execute on function public.join_paper_league(uuid, text) to service_role;

-- Direct inserts into league_members would create a member with no trading
-- account (and no balance). Joining must go through join_paper_league, which
-- creates the account in the same transaction.
drop policy if exists league_members_join_self on public.league_members;
revoke insert on public.league_members from authenticated;

-- ---------------------------------------------------------------------------
-- Standings base
-- ---------------------------------------------------------------------------

-- Cash-side facts for every member. Position values are marked to the live
-- market in the app (TypeScript), because Postgres cannot see pool prices.
-- SECURITY DEFINER so one member can see the whole scoreboard; restricted to
-- the service role, and only called after the server has checked membership.
create or replace function public.league_standings_base(p_league_id uuid)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  account_id uuid,
  sol_balance numeric,
  starting_balance numeric,
  trade_count bigint,
  open_positions bigint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    p.username,
    p.avatar_url,
    m.account_id,
    coalesce(a.sol_balance, 0),
    coalesce(a.starting_balance, l.starting_balance),
    (select count(*) from public.trades t where t.account_id = m.account_id),
    (select count(*) from public.positions po where po.account_id = m.account_id),
    m.joined_at
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  left join public.profiles p on p.id = m.user_id
  left join public.accounts a on a.id = m.account_id
  where m.league_id = p_league_id;
$$;

revoke all on function public.league_standings_base(uuid)
  from public, anon, authenticated;

grant execute on function public.league_standings_base(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Trading: league accounts are tradeable while their league is running
-- ---------------------------------------------------------------------------

create or replace function public.execute_paper_trade(
  p_user_id uuid,
  p_account_id uuid,
  p_mint text,
  p_symbol text,
  p_side text,
  p_sol_amount numeric,
  p_token_amount numeric,
  p_price numeric,
  p_price_after numeric,
  p_impact numeric,
  p_fees numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.accounts;
  v_position public.positions;
  v_trade_id uuid;
  v_sol numeric(20, 9) := round(p_sol_amount, 9);
  v_tokens numeric(38, 6) := round(p_token_amount, 6);
  v_remaining numeric(38, 6);
  v_sold_fraction numeric;
begin
  if p_side not in ('buy', 'sell') then
    raise exception 'invalid_side';
  end if;

  if v_sol <= 0 or v_tokens <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_account
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'account_not_found';
  end if;

  if v_account.user_id <> p_user_id then
    raise exception 'account_not_owned';
  end if;

  if v_account.type = 'league' then
    -- A league account stops trading when its window closes, so nobody can
    -- fill at the final second after the standings are already settled.
    if not exists (
      select 1 from public.leagues l
      where l.id = v_account.league_id
        and l.ends_at > now()
        and l.status <> 'ended'
    ) then
      raise exception 'league_ended';
    end if;
  elsif v_account.type <> 'practice' then
    raise exception 'invalid_account_type';
  end if;

  -- Keep the coin catalogue warm; Discover and the coin page read from it.
  insert into public.tokens (mint, ticker, last_price, last_updated)
  values (p_mint, p_symbol, p_price, now())
  on conflict (mint) do update
    set ticker = coalesce(excluded.ticker, public.tokens.ticker),
        last_price = excluded.last_price,
        last_updated = now();

  if p_side = 'buy' then
    if v_account.sol_balance < v_sol then
      raise exception 'insufficient_balance';
    end if;

    insert into public.positions (
      account_id, token_mint, token_amount, avg_entry_price, cost_basis_sol, updated_at
    )
    values (p_account_id, p_mint, v_tokens, p_price, v_sol, now())
    on conflict (account_id, token_mint) do update
      set token_amount = public.positions.token_amount + excluded.token_amount,
          cost_basis_sol = public.positions.cost_basis_sol + excluded.cost_basis_sol,
          avg_entry_price = (
            (public.positions.cost_basis_sol + excluded.cost_basis_sol)
            / nullif(public.positions.token_amount + excluded.token_amount, 0)
          ),
          updated_at = now();

    update public.accounts
    set sol_balance = sol_balance - v_sol
    where id = p_account_id;
  else
    select * into v_position
    from public.positions
    where account_id = p_account_id and token_mint = p_mint
    for update;

    if not found or v_position.token_amount < v_tokens then
      raise exception 'insufficient_tokens';
    end if;

    v_remaining := v_position.token_amount - v_tokens;
    v_sold_fraction := v_tokens / nullif(v_position.token_amount, 0);

    if v_remaining <= 0 then
      delete from public.positions
      where account_id = p_account_id and token_mint = p_mint;
    else
      update public.positions
      set token_amount = v_remaining,
          cost_basis_sol = round(v_position.cost_basis_sol * (1 - v_sold_fraction), 9),
          updated_at = now()
      where account_id = p_account_id and token_mint = p_mint;
    end if;

    update public.accounts
    set sol_balance = sol_balance + v_sol
    where id = p_account_id;
  end if;

  insert into public.trades (
    account_id, token_mint, side, sol_amount, token_amount,
    price, price_impact, fees
  )
  values (
    p_account_id, p_mint, p_side, v_sol, v_tokens,
    p_price, p_impact, greatest(p_fees, 0)
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

revoke all on function public.execute_paper_trade(
  uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.execute_paper_trade(
  uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric
) to service_role;
