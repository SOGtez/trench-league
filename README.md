# Trench League

Paper trade Solana memecoins with fake SOL and compete with friends in leagues.
No wallet, no deposits, no real money — prizes are points, badges and titles.

> Real prices. Fake SOL. Prove you can survive the trenches.

This repo is being built in phases. **Phases 1–5 are done** — setup, auth,
routing, the live market data layer, a working paper trading engine with coin
pages, charts and a portfolio, friend leagues with invite codes and a live
leaderboard, and scored calls with streaks, points and badges. See
[Build status](#build-status).

## Stack

- Next.js 16 (App Router, TypeScript, React 19)
- Tailwind CSS v4 with the design tokens in `src/app/globals.css`
- Supabase (Postgres, Auth, Realtime) via `@supabase/ssr`
- Live market data from GeckoTerminal + Jupiter, both keyless
- TradingView Lightweight Charts for the coin chart
- Vercel + Vercel Cron for scheduled jobs (phase 4/5)

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, in order:
   - [0001_init.sql](supabase/migrations/0001_init.sql) — every table, index,
     RLS policy and the signup trigger that gives each new user a profile plus a
     practice account with **10 paper SOL**.
   - [0002_trading.sql](supabase/migrations/0002_trading.sql) — the
     `execute_paper_trade` function, the only path that moves balances.
   - [0003_leagues.sql](supabase/migrations/0003_leagues.sql) — league
     creation, invite-code joins and the standings query.
   - [0004_calls.sql](supabase/migrations/0004_calls.sql) — round metadata,
     scored picks, streaks, badges and the call functions.
3. Copy the project URL, the **anon** key and the **service_role** key from
   **Project Settings → API**.

### 3. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key — safe in the browser, RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (trading) | Server-only. Fills, cron, league settlement. **Never** prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | recommended | Public origin used for auth redirects |
| `BIRDEYE_API_KEY` | optional | Candles, holder distribution (phase 3 chart). Free tier is tight — cache everything |
| `HELIUS_API_KEY` | optional | Holder lists (DAS), metadata, RPC |
| `JUPITER_API_KEY` | optional | Raises the keyless `api.jup.ag` rate limit from 0.5 to 1 req/s |
| `PUMPPORTAL_API_KEY` | optional | Real-time trade stream; the free launch stream needs no key |
| `SWAP_FEE_BPS` | optional | Paper swap fee, `100` = 1% (default) |
| `PRIORITY_FEE_SOL` | optional | Fixed priority fee per fill, default `0.001` SOL |
| `CRON_SECRET` | optional | Bearer token for `/api/cron/calls`; without it that route is disabled |

Only the Supabase pair is required. **Discover needs no market-data keys** — it
reads GeckoTerminal's public API (30 requests/min → cached server-side for 20s)
and Jupiter's keyless price endpoint. Until the Supabase variables are set the
app still boots and shows a "Supabase not connected" banner instead of failing.

### 4. Auth providers

- **Email + password** works out of the box. For instant signups, turn off
  **Confirm email** in Supabase → Authentication → Providers → Email (otherwise
  users get a confirmation link first).
- **Google**: Supabase → Authentication → Providers → Google. Add your Google
  OAuth client ID/secret, then add these redirect URLs in Supabase → Authentication
  → URL Configuration:
  - `http://localhost:3000/auth/callback`
  - `https://trenchleague.lol/auth/callback` (production)

### 5. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

## Project structure

```
src/
  app/
    page.tsx                 # "/" — landing when signed out, dashboard when signed in
    (auth)/login|signup      # email/password + Google
    auth/callback/route.ts   # OAuth / email-confirm code exchange
    welcome/username/        # post-signup username step
    (app)/                   # signed-in shell (header + auth guard)
      discover/ portfolio/ leagues/ calls/ profile/ coin/[mint]/
  app/api/market/discover/   # GET snapshot the Discover board polls every 7s
  app/api/market/candles/    # OHLCV for the coin chart
  app/api/trade/quote/       # live fill preview (same pricing as the fill)
  app/api/leagues/[id]/leaderboard/  # standings the league page polls every 15s
  app/api/calls/round/       # calls board + lazy round generation and scoring
  app/api/cron/calls/        # optional scheduled scoring (CRON_SECRET)
  components/                # UI kit, header, landing, dashboard, discover, coin
    discover/                # board, rows, avatars
    coin/                    # trade panel, candlestick chart
    league/                  # create/join forms, leaderboard, account switcher
    calls/                   # calls board, single-call card
  lib/
    market/                  # market data layer
      types.ts               # MarketToken / DiscoverSnapshot
      geckoterminal.ts       # pool feed client + normaliser (+ OHLCV)
      sol.ts                 # SOL/USD via Jupiter
      curve.ts               # pump.fun bonding-curve constants
      discover.ts            # composes the three Discover columns
      token.ts               # single-mint snapshot (GT, Dexscreener fallback)
      prices.ts              # batched prices for portfolio valuation
      cache.ts               # TTL memo + request coalescing (rate limits)
    trade/quote.ts           # constant-product pricing, fees, impact
    leagues/                 # league model
      active-account.ts      # practice vs league account resolution (cookie + ownership check)
      queries.ts             # league lists, my equity per league
      standings.ts           # mark-to-market standings, ranked by % gain
    calls/                   # calls phase
      types.ts               # CallView / CallsView + round constants
      rounds.ts              # lazy round generation from the live board
      settle.ts              # candle-close settlement, then scoring in SQL
      queries.ts             # calls board reads + crowd split
    supabase/{client,server,proxy,env,admin}.ts
    auth.ts                  # server-side auth context (user + profile + accounts)
    utils.ts                 # formatters
  proxy.ts                   # Next 16 proxy (= middleware): session refresh + route guards
supabase/migrations/0001_init.sql
supabase/migrations/0002_trading.sql
supabase/migrations/0003_leagues.sql
supabase/migrations/0004_calls.sql
```

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Setup, Supabase, auth, username step, header, routing, design tokens | done |
| 2 | Market data routes/cache, Discover live columns | done |
| 3 | Trading engine, coin page, chart, portfolio | done |
| 4 | Leagues, per-league accounts, invite codes, live leaderboard | done |
| 5 | Calls, scoring, streaks, badges, profile | done |
| 6 | Polish, mobile pass, landing, analytics | next |

## Paper trading engine

Fills are priced off the live market with a constant-product model, so size
moves the price:

- **On the curve** (`pump-fun`): reserves are recovered from the live price and
the curve invariant `k = 30 SOL × 1.073B tokens`, which reproduces the real
depth of a bonding curve — a 5 SOL buy on a fresh launch is a huge move, the
same buy at 99% barely registers.
- **Graduated** (`pumpswap`, raydium, meteora…): reserves come from the pool's
live liquidity, with an FDV-based fallback when the feed reports none.

Every fill charges `SWAP_FEE_BPS` (1% by default) plus `PRIORITY_FEE_SOL`, and
is rejected when the price impact would exceed 35% — that is the "try a smaller
amount" error.

Writes are atomic: the app decides the price, then
`public.execute_paper_trade()` (SECURITY DEFINER, execute granted to
`service_role` only) locks the account row, checks funds, writes the trade and
updates the position in one transaction. The browser can never call it directly,
so a fill or a price cannot be forged from devtools.

## Leagues

A league is a scoreboard with its own money. Joining creates a `league`
account funded with the league's starting balance, so league play never touches
the practice balance — and two leagues never share one either. The header and
the trade panel always show which account you're trading; the choice is stored
in a `tl_account` cookie and re-checked against the database on every read, so
editing the cookie only ever falls back to an account you actually own.

- **Invite codes** are 8 characters from an alphabet without `0/O/1/I`, so they
  survive being read aloud or retyped from a screenshot.
- **Creating** a league joins you on the spot and returns the code. **Joining**
takes a case-insensitive code and is rejected when the league is full, ended, or
you're already in it — a second join can't mint a second starting balance.
- **Ranking is % gain**, not raw equity, so a 5 SOL league and a 100 SOL league
  score the same way. Open positions are marked to the live pool price on every
  read; the page polls standings every 15s.
- **Late joins** still get the full balance, which is exactly why scoring is %
  based. Players who join more than an hour after the start are badged `late`
  so nobody is confused by a 0% line outranking a losing one.
- **The window is enforced in the fill**, not just in the UI: a league account
  stops trading once `ends_at` passes.

Security shape: `create_paper_league`, `join_paper_league` and
`league_standings_base` are `SECURITY DEFINER` and executable by `service_role`
only, so the browser can pass a name or a code but never a balance. Direct
inserts into `league_members` are revoked — joining has to go through the
function that creates the account in the same transaction. Private leagues are
hidden by RLS, the league page 404s for non-members, and the leaderboard route
checks membership before it touches the service role and returns only the board
fields.

## Calls and scoring

A round runs every 15 minutes, on the quarter hour, and contains two calls: an
up/down on one liquid coin, and a head-to-head between two. Picks lock ten
minutes in and the round resolves at the quarter hour against the pool's
1-minute candle close — settlement reads the candle that *covers* the resolve
time, so a run that happens late (or is retried an hour afterwards) still scores
the real close rather than the price at retry time.

| Result | Points |
| --- | --- |
| Correct call | 100 |
| Streak bonus | +25 × current streak, capped at four |
| Contrarian bonus | +50 when fewer than 40% of picks won |
| Wrong call | 0, and the streak resets |

Badges: `first_call` on your first pick, `hot_streak` at five correct in a row,
`sharp` at ten correct calls, `against_the_grain` for a contrarian win.

Nothing that decides a number runs in the browser. `place_call_pick` checks the
lock itself and takes only a call id and a side, and `resolve_call` writes
`correct` and `points` in one transaction before updating the profile totals and
awarding badges. `call_picks` is no longer writable by `authenticated`: the
insert/update policies from `0001_init.sql` are dropped in `0004_calls.sql`,
because a row-level policy cannot stop a client from writing `points` directly.

Rounds are also created lazily. `GET /api/calls/round` — what the board polls
every 5 seconds — opens the missing round and scores anything past its resolve
time, so the game works on a fresh deployment with no scheduler configured.
`GET /api/cron/calls` does the same job on a schedule; it requires
`Authorization: Bearer $CRON_SECRET` and is disabled when that variable is
unset.

## Market data notes (checked before building)

**What phase 2 actually uses** (verified live on 2026-10-24, SOL ≈ $101.5):

- **GeckoTerminal** (`api.geckoterminal.com/api/v2`) — keyless, 30 req/min.
  `/networks/solana/new_pools` gives newest-first pools with price, FDV, volume
  and 5m/1h/24h transaction counts; `/networks/solana/dexes/pump-fun/pools`
  sorted by volume provides the bonding-curve candidates for "about to
  graduate"; `/networks/solana/trending_pools` backs the trending column. The
  market layer fetches five pages per refresh, memoised for 20s, so upstream
  sees ~15 requests/min at worst and concurrent tabs share the in-memory copy.
  The polled response itself is `no-store`: a shared cache answering with an
  older board is what makes a live page look frozen.
- **Jupiter** (`api.jup.ag/price/v3`) — keyless SOL/USD, cached 30s. If it
  fails, the SOL price is derived from any SOL-quoted GeckoTerminal pool.
- **Bonding-curve progress is an estimate**: `FDV / (411 × SOL price)`. Checked
  against live data — coins still on the `pump-fun` dex cap out at $41.1–41.6K
  with SOL at $101.5, and every pool above that has already moved to `pumpswap`.
  The trading engine derives curve reserves from this same price and the curve
  invariant, so fills respect real depth without a second data source.
- **pump.fun's own frontend API is not usable server-side** — both
  `frontend-api.pump.fun` and `frontend-api-v3.pump.fun` answer `403` with a
  Cloudflare challenge. The plan below predates that; GeckoTerminal replaces it.
- **Token art comes from Jupiter** (`api.jup.ag/tokens/v2/search`), which answers
  a comma-separated list of mints with each token's `icon` in one request —
  pool feeds carry no images. One batched call per board refresh fills
  `logoUrl`; per-token lookups would cost 30 requests a tick. Icons are
  hot-linked from whichever CDN hosts them (pump, IPFS gateways, Twitter,
  axiom…), so `TokenAvatar` falls back to a generated badge when a host is dead
  or blocks the referrer. Public IPFS gateways are repointed at
  `pump.mypinata.cloud` in the market layer: `ipfs.io` and `dweb.link` both
  answer `429` to board-scale traffic, which was breaking about a fifth of
  pump.fun icons (measured 2026-10-25).


- **PumpPortal** — the new-token stream is still free; since May 2026 the
  per-mint **trade** stream needs an API key and is metered (0.01 SOL per 10k
  events), and its terms restrict redistributing the feed to third parties.
  Plan: use the free launch stream for Discover and derive bonding-curve state
  server-side from pump.fun's frontend endpoint (`/coins-v2/{mint}`, CORS
  restricted → server only) or on-chain reserves.
- **Birdeye** — free Standard tier still covers token overview, OHLCV (including
  1s/15s), trending and holder distribution, but only ~30k compute units/month
  at 1 req/s. Every Birdeye call must be cached server-side.
- **Jupiter** — `lite-api.jup.ag` is being phased out. Use `api.jup.ag`
  (`/swap/v2/order` for executable quotes, `/price/v3` for prices). Keyless is
  0.5 req/s; a free key raises it to 1 req/s.
- **Helius** — free tier: 1M credits/month, 2 DAS req/s. Cache metadata and
  holder lists aggressively.

## Rules this project must keep

1. No real money, ever. No deposits, withdrawals or betting.
2. No wallet connection in the MVP — email or Google only.
3. Prices come from live on-chain data.
4. Every fill includes price impact and fees; large buys move the price.
5. A "Paper trading · no real money" label sits next to every buy/sell control.
