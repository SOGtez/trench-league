-- Trench League — 0002: paper trading engine
--
-- Fills are priced in the app (live market data + impact model) and committed
-- here in a single transaction. This function is the only way balances move:
-- it locks the account row, checks funds, writes the trade, and updates the
-- position atomically.
--
-- Execute is granted to service_role only. The server action resolves the
-- caller's account from their session before calling this, so a browser can
-- never forge a fill or a price.

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

  if v_account.type <> 'practice' then
    raise exception 'account_not_practice';
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

-- Token catalogue is readable by everyone signed in (phase 2 RLS already grants
-- select); keep writes service-role only.
revoke insert, update, delete on public.tokens from anon, authenticated;
