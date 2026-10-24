# Trench League

Paper trade Solana memecoins with fake SOL and compete with friends in leagues.
No wallet, no deposits, no real money — prizes are points, badges and titles.

> Real prices. Fake SOL. Prove you can survive the trenches.

This repo is being built in phases. **Phases 1–2 are done** — setup, auth,
routing, design system, and the live market data layer behind Discover. The
trading engine, leagues and calls land in later phases. See
[Build status](#build-status).

## Stack

- Next.js 16 (App Router, TypeScript, React 19)
- Tailwind CSS v4 with the design tokens in `src/app/globals.css`
- Supabase (Postgres, Auth, Realtime) via `@supabase/ssr`
- Live market data from GeckoTerminal + Jupiter, both keyless
- TradingView Lightweight Charts (phase 3)
- Vercel + Vercel Cron for scheduled jobs (phase 4/5)

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql).
   It creates every table, index, RLS policy and the signup trigger that gives
   each new user a profile plus a practice account with **10 paper SOL**.
3. Copy the project URL and the **anon** key from **Project Settings → API**.

### 3. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key — safe in the browser, RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | phase 3+ | Server-only. Trading engine, cron, league settlement. **Never**  prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | recommended | Public origin used for auth redirects |
| `BIRDEYE_API_KEY` | optional | Candles, holder distribution (phase 3 chart). Free tier is tight — cache everything |
| `HELIUS_API_KEY` | optional | Holder lists (DAS), metadata, RPC |
| `JUPITER_API_KEY` | optional | Raises the keyless `api.jup.ag` rate limit from 0.5 to 1 req/s |
| `PUMPPORTAL_API_KEY` | optional | Real-time trade stream; the free launch stream needs no key |
| `SWAP_FEE_BPS` | phase 3 | Paper swap fee, `100` = 1% |
| `PRIORITY_FEE_SOL` | phase 3 | Fixed priority fee per fill, default `0.001` |

Only the Supabase pair is required. **Discover needs no market-data keys** — it
reads GeckoTerminal's public API (30 requests/min → cached server-side for 30s)
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
  app/api/market/discover/   # GET snapshot the Discover board polls every 15s
  components/                # UI kit, header, landing, dashboard, discover board
  lib/
    market/                  # market data layer
      types.ts               # MarketToken / DiscoverSnapshot
      geckoterminal.ts       # pool feed client + normaliser
      sol.ts                 # SOL/USD via Jupiter
      curve.ts               # pump.fun bonding-curve progress
      discover.ts            # composes the three Discover columns
      cache.ts               # TTL memo + request coalescing (rate limits)
    supabase/{client,server,proxy,env}.ts
    auth.ts                  # server-side auth context (user + profile + practice account)
    utils.ts                 # formatters
  proxy.ts                   # Next 16 proxy (= middleware): session refresh + route guards
supabase/migrations/0001_init.sql
```

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Setup, Supabase, auth, username step, header, routing, design tokens | done |
| 2 | Market data routes/cache, Discover live columns | done |
| 3 | Trading engine, coin page, chart, portfolio | next |
| 4 | Leagues, accounts, leaderboards, cron | pending |
| 5 | Calls, scoring, streaks, badges, profile | pending |
| 6 | Polish, mobile pass, landing, analytics | pending |

## Market data notes (checked before building)

**What phase 2 actually uses** (verified live on 2026-10-24, SOL ≈ $101.5):

- **GeckoTerminal** (`api.geckoterminal.com/api/v2`) — keyless, 30 req/min.
  `/networks/solana/new_pools` gives newest-first pools with price, FDV, volume
  and 5m/1h/24h transaction counts; `/networks/solana/dexes/pump-fun/pools`
  sorted by volume provides the bonding-curve candidates for "about to
  graduate"; `/networks/solana/trending_pools` backs the trending column. The
  market layer fetches six pages per refresh, memoised for 30s, so upstream sees
  ~12 requests/min at worst and the CDN absorbs every other tab.
- **Jupiter** (`api.jup.ag/price/v3`) — keyless SOL/USD, cached 30s. If it
  fails, the SOL price is derived from any SOL-quoted GeckoTerminal pool.
- **Bonding-curve progress is an estimate**: `FDV / (411 × SOL price)`. Checked
  against live data — coins still on the `pump-fun` dex cap out at $41.1–41.6K
  with SOL at $101.5, and every pool above that has already moved to `pumpswap`.
  Phase 3 reads real curve reserves before quoting a fill.
- **pump.fun's own frontend API is not usable server-side** — both
  `frontend-api.pump.fun` and `frontend-api-v3.pump.fun` answer `403` with a
  Cloudflare challenge. The plan below predates that; GeckoTerminal replaces it.


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
