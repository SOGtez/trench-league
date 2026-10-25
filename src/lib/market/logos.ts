import { memoize } from "./cache";

const SEARCH_URL = "https://api.jup.ag/tokens/v2/search";
const TIMEOUT_MS = 6_000;
const CHUNK = 50;
const TTL_MS = 10 * 60_000;

/**
 * The public IPFS gateways answer 429 to a lot of traffic, which is exactly
 * what a busy board generates, so those links are repointed at the gateway
 * pump.fun itself uses for its token metadata. Measured on 2026-10-25: the
 * same CID was 429 on ipfs.io and dweb.link, 200 in 0.3s here.
 */
const SLOW_GATEWAYS = new Set(["ipfs.io", "gateway.ipfs.io", "dweb.link"]);
const IPFS_GATEWAY = "https://pump.mypinata.cloud";

type JupiterToken = { id?: string; icon?: string | null };

/**
 * Token art is served from about a dozen unrelated hosts (pump's CDN, IPFS
 * gateways, Twitter media, axiom, irys…), so only https URLs off a real host
 * are accepted and everything else falls back to the generated badge.
 */
function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > 500 || !value.startsWith("https://")) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!url.hostname.includes(".")) return null;
  if (SLOW_GATEWAYS.has(url.hostname.toLowerCase())) {
    return `${IPFS_GATEWAY}${url.pathname}${url.search}`;
  }

  return url.toString();
}

/**
 * Logos for many mints in one request.
 *
 * Jupiter's token search answers a comma-separated list in a single call, which
 * is what makes real token art affordable here: per-token lookups would cost 30
 * requests every Discover refresh and blow GeckoTerminal's budget. Logos do not
 * change, so results are memoised for ten minutes.
 */
export function getTokenLogos(mints: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(mints.filter(Boolean))].sort();
  if (unique.length === 0) return Promise.resolve({});

  return memoize(
    `logos:${unique.join(",")}`,
    TTL_MS,
    () => fetchLogos(unique),
    (logos) => Object.keys(logos).length > 0,
  );
}

async function fetchLogos(mints: string[]): Promise<Record<string, string>> {
  const logos: Record<string, string> = {};

  for (let index = 0; index < mints.length; index += CHUNK) {
    const batch = mints.slice(index, index + CHUNK);
    const wanted = new Set(batch);

    try {
      const response = await fetch(
        `${SEARCH_URL}?query=${encodeURIComponent(batch.join(","))}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          next: { revalidate: 600 },
        },
      );

      if (!response.ok) continue;

      const body = (await response.json()) as unknown;
      if (!Array.isArray(body)) continue;

      for (const token of body as JupiterToken[]) {
        const mint = token.id;
        // Unindexed mints return [] — and a search may answer with a similar
        // ticker, so only keep ids we actually asked for.
        if (!mint || !wanted.has(mint)) continue;

        const icon = safeImageUrl(token.icon);
        if (icon) logos[mint] = icon;
      }
    } catch {
      // Missing art is fine: the badge renders instead.
    }
  }

  return logos;
}
