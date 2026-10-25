-- Trench League — scheduled scoring
--
-- The Calls board already settles and opens rounds whenever it is polled, which
-- means a round only resolves if somebody has the page open. This makes it run
-- on its own:
--
--   pg_cron  fires every 5 minutes
--   pg_net   POSTs to /api/cron/calls
--   the route scores what has closed and opens the next round
--
-- The bearer token is generated inside Postgres and never leaves the database —
-- the route compares it with `verify_cron_token`, so there is no secret to copy
-- into a Vercel env var, and rotating it is one UPDATE.
--
-- Vercel Cron is the other way in: it sends `Authorization: Bearer
-- $CRON_SECRET` on its own when that variable exists, which the route still
-- accepts. On the Hobby plan Vercel only runs crons once a day, which is why the
-- 5-minute schedule lives here instead.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Scheduler token
-- ---------------------------------------------------------------------------

-- Not in `public`: PostgREST only exposes `public`, and there is nothing here
-- for a signed-in user to read.
create schema if not exists internal;

revoke all on schema internal from anon, authenticated;

create table if not exists internal.cron_token (
  -- Single row, and the check makes a second one impossible.
  id boolean primary key default true check (id),
  token text not null
    -- 2 × uuid, so 64 hex characters without depending on pgcrypto.
    default replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

insert into internal.cron_token (id) values (true) on conflict (id) do nothing;

revoke all on internal.cron_token from anon, authenticated;

-- Called by the cron route under the service role. SECURITY DEFINER so the
-- route never needs access to the table itself.
create or replace function public.verify_cron_token(p_token text)
returns boolean
language sql
security definer
set search_path = internal, pg_temp
as $$
  select exists (
    select 1
    from internal.cron_token
    where length(p_token) = length(token)
      and token = p_token
  );
$$;

revoke all on function public.verify_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_cron_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------

-- Re-runnable: drop any previous copy before scheduling.
select cron.unschedule('calls-tick')
where exists (select 1 from cron.job where jobname = 'calls-tick');

select cron.schedule(
  'calls-tick',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://trenchleague.lol/api/cron/calls',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select token from internal.cron_token),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );

    -- pg_net keeps every response it ever received; two days is plenty for
    -- debugging and keeps the table from growing without bound.
    delete from net._http_response where created < now() - interval '2 days';
  $job$
);
