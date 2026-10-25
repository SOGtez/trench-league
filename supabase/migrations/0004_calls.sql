-- Trench League — 0004: calls, scoring, streaks, badges
--
-- A call is a question with two sides and a deadline: "will this close up or
-- down", "which of these two closes higher". Picks lock before the round ends
-- and are scored from the live market at the close.
--
-- The important rule here is the same one the trading engine follows: the
-- browser never writes a number that matters. `call_picks.points` and
-- `call_picks.correct` are set by `resolve_call`, which only the service role
-- can run, and picks are written through `place_call_pick` so a client cannot
-- award itself points or slip a pick in after the lock.
--
-- Scoring (see README):
--   * correct call            = 100 points
--   * streak bonus            = 25 × (current streak, capped at 4)
--   * contrarian bonus        = 50 when fewer than 40% of picks won
--   * wrong call              = 0 points, streak resets

-- ---------------------------------------------------------------------------
-- Round metadata on calls
-- ---------------------------------------------------------------------------

alter table public.calls
  add column kind text not null default 'updown',
  add column token_mint text,
  add column token_symbol text,
  add column token_pool text,
  add column price_open numeric(38, 18),
  add column rival_mint text,
  add column rival_symbol text,
  add column rival_pool text,
  add column rival_price_open numeric(38, 18),
  add column price_close numeric(38, 18),
  add column rival_price_close numeric(38, 18);

alter table public.calls
  add constraint calls_kind_check check (kind in ('updown', 'h2h'));

-- One up/down and one head-to-head per round. This is what makes round
-- generation idempotent: two cron ticks (or two page loads) cannot double-create
-- a round, the second insert just loses the race and is ignored.
create unique index calls_round_kind_idx on public.calls (round_id, kind);

create index calls_open_idx on public.calls (resolves_at) where result is null;
create index call_picks_call_idx on public.call_picks (call_id);

-- ---------------------------------------------------------------------------
-- Score columns on the profile
--
-- Kept denormalised because the profile page and the Calls header read them on
-- every render, and a streak is a running value rather than something you can
-- cheaply recompute from `call_picks` alone.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column points_total integer not null default 0,
  add column streak_current integer not null default 0,
  add column streak_best integer not null default 0,
  add column calls_scored integer not null default 0,
  add column calls_correct integer not null default 0;

-- ---------------------------------------------------------------------------
-- Badge catalog
-- ---------------------------------------------------------------------------

insert into public.badges (code, name, description) values
  ('first_call', 'First Call', 'Made your first call.'),
  ('hot_streak', 'Hot Streak', 'Five correct calls in a row.'),
  ('against_the_grain', 'Against the Grain', 'Won a call fewer than 40% of players picked.'),
  ('sharp', 'Sharp', 'Ten correct calls.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Award a badge (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.award_badge(
  p_user_id uuid,
  p_code text,
  p_league_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  select id into v_badge_id from public.badges where code = p_code;
  if v_badge_id is null then
    return false;
  end if;

  insert into public.user_badges (user_id, badge_id, league_id)
  values (p_user_id, v_badge_id, p_league_id)
  on conflict do nothing;

  return found;
end;
$$;

revoke all on function public.award_badge(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.award_badge(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Place (or change) a pick
-- ---------------------------------------------------------------------------

-- The only write path for picks. Everything a client could otherwise forge —
-- points, correctness, a pick after the lock — is decided here or in
-- `resolve_call`, never by the caller.
create or replace function public.place_call_pick(
  p_user_id uuid,
  p_call_id uuid,
  p_pick text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call public.calls;
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_pick not in ('a', 'b') then
    raise exception 'invalid_pick';
  end if;

  select * into v_call from public.calls where id = p_call_id;
  if not found then
    raise exception 'call_not_found';
  end if;

  if v_call.result is not null then
    raise exception 'call_resolved';
  end if;

  -- Lock is enforced here, not in the UI: a request that arrives late is
  -- rejected even if the button was still on screen.
  if now() >= v_call.locks_at then
    raise exception 'call_locked';
  end if;

  insert into public.call_picks (call_id, user_id, pick)
  values (p_call_id, p_user_id, p_pick)
  on conflict (call_id, user_id) do update
    set pick = excluded.pick;

  perform public.award_badge(p_user_id, 'first_call');

  return v_call.locks_at;
end;
$$;

revoke all on function public.place_call_pick(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.place_call_pick(uuid, uuid, text) to service_role;

-- Picks are no longer writable from the browser: `points` and `correct` live on
-- the same row, and RLS cannot stop a user from writing those columns.
drop policy if exists call_picks_insert_own on public.call_picks;
drop policy if exists call_picks_update_own on public.call_picks;
revoke insert, update on public.call_picks from authenticated;

-- ---------------------------------------------------------------------------
-- Resolve a call and score every pick
-- ---------------------------------------------------------------------------

-- p_result is decided by the caller from the market (see lib/calls/settle.ts):
-- only the server can see prices, so the database is told the outcome rather
-- than guessing it. Idempotent — a second call for an already-resolved call
-- does nothing and returns 0.
create or replace function public.resolve_call(
  p_call_id uuid,
  p_result text,
  p_price_close numeric default null,
  p_rival_price_close numeric default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call public.calls;
  v_total integer;
  v_winning integer;
  v_contrarian boolean := false;
  v_pick record;
  v_correct boolean;
  v_points integer;
  v_streak integer;
  v_correct_total integer;
begin
  if p_result not in ('a', 'b') then
    raise exception 'invalid_result';
  end if;

  select * into v_call from public.calls where id = p_call_id for update;
  if not found then
    raise exception 'call_not_found';
  end if;

  if v_call.result is not null then
    return 0;
  end if;

  select
    count(*),
    count(*) filter (where pick = p_result)
  into v_total, v_winning
  from public.call_picks
  where call_id = p_call_id;

  -- A 1-of-2 split is not contrarian; require a real crowd before paying for it.
  v_contrarian := v_total >= 4 and (v_winning::numeric / v_total) < 0.4;

  update public.calls
     set result = p_result,
         price_close = coalesce(p_price_close, price_close),
         rival_price_close = coalesce(p_rival_price_close, rival_price_close)
   where id = p_call_id;

  for v_pick in
    select cp.user_id, cp.pick, coalesce(p.streak_current, 0) as streak_current
    from public.call_picks cp
    left join public.profiles p on p.id = cp.user_id
    where cp.call_id = p_call_id
    order by cp.user_id
  loop
    v_correct := v_pick.pick = p_result;

    if v_correct then
      v_streak := v_pick.streak_current + 1;
      v_points := 100
        + 25 * least(v_pick.streak_current, 4)
        + case when v_contrarian then 50 else 0 end;
    else
      v_streak := 0;
      v_points := 0;
    end if;

    update public.call_picks
       set correct = v_correct,
           points = v_points
     where call_id = p_call_id and user_id = v_pick.user_id;

    update public.profiles
       set points_total = points_total + v_points,
           streak_current = v_streak,
           streak_best = greatest(streak_best, v_streak),
           calls_scored = calls_scored + 1,
           calls_correct = calls_correct + case when v_correct then 1 else 0 end
     where id = v_pick.user_id;

    if v_correct then
      if v_streak >= 5 then
        perform public.award_badge(v_pick.user_id, 'hot_streak');
      end if;

      if v_contrarian then
        perform public.award_badge(v_pick.user_id, 'against_the_grain');
      end if;

      select calls_correct into v_correct_total
      from public.profiles
      where id = v_pick.user_id;

      if coalesce(v_correct_total, 0) >= 10 then
        perform public.award_badge(v_pick.user_id, 'sharp');
      end if;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.resolve_call(uuid, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.resolve_call(uuid, text, numeric, numeric)
  to service_role;

-- ---------------------------------------------------------------------------
-- Pick distribution
-- ---------------------------------------------------------------------------

-- How the crowd split, for calls that are already locked (showing it earlier
-- would let late players pile onto the winning side). Aggregated in the
-- database so one member never sees another's row.
create or replace function public.call_tallies(p_call_ids uuid[])
returns table (call_id uuid, side_a integer, side_b integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.call_id,
    count(*) filter (where cp.pick = 'a')::int as side_a,
    count(*) filter (where cp.pick = 'b')::int as side_b
  from public.call_picks cp
  where cp.call_id = any (p_call_ids)
  group by cp.call_id;
$$;

revoke all on function public.call_tallies(uuid[])
  from public, anon, authenticated;
grant execute on function public.call_tallies(uuid[]) to service_role;
