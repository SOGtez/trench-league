type Entry<T> = {
  at: number;
  value: T;
  healthy: boolean;
};

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** How long a good value may keep being served after rebuilds go unhealthy. */
const STALE_GRACE_MS = 5 * 60_000;

/**
 * Tiny per-instance TTL cache with request coalescing.
 *
 * Upstream market feeds are rate limited (GeckoTerminal: 30 req/min), and the
 * Discover page is polled by every open tab, so identical work must collapse
 * into one upstream round-trip. The CDN cache on the API route covers cold
 * instances; this covers warm ones.
 *
 * When a build throws, the last healthy value keeps being served (slightly
 * stale is much better than an empty board). Unhealthy values expire fast so a
 * recovering feed is picked up quickly.
 */
export function memoize<T>(
  key: string,
  ttlMs: number,
  build: () => Promise<T>,
  isHealthy: (value: T) => boolean = () => true,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = build()
    .then((value) => {
      const healthy = isHealthy(value);
      const previous = store.get(key) as Entry<T> | undefined;

      // A degraded rebuild (GeckoTerminal 429, upstream outage) must not wipe
      // data we already had. Keep serving the last healthy value for a short
      // grace window instead of blanking a board that was populated seconds
      // ago, then accept the degraded value so the UI can report it as stale.
      if (
        !healthy &&
        previous?.healthy &&
        Date.now() - previous.at < STALE_GRACE_MS
      ) {
        return previous.value;
      }

      store.set(key, {
        at: healthy ? Date.now() : Date.now() - ttlMs + 5_000,
        value,
        healthy,
      });
      return value;
    })
    .catch((error) => {
      const last = store.get(key) as Entry<T> | undefined;
      if (last?.healthy) return last.value;
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
