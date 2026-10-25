/**
 * Shown while a page inside the app shell streams in. It mirrors the usual
 * page header plus a card grid, so content lands in place instead of jumping.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-[6px] bg-card" />
          <div className="h-3.5 w-64 max-w-full animate-pulse rounded-[4px] bg-card" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 animate-pulse rounded-full bg-card" />
          <div className="hidden h-10 w-24 animate-pulse rounded-full bg-card sm:block" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div
            key={column}
            className="rounded-[18px] border border-line bg-card"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="space-y-1.5">
                <div className="h-4 w-28 animate-pulse rounded-[4px] bg-hover" />
                <div className="h-3 w-36 animate-pulse rounded-[4px] bg-hover" />
              </div>
              <div className="h-3 w-6 animate-pulse rounded-[4px] bg-hover" />
            </div>
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="size-9 shrink-0 animate-pulse rounded-full bg-hover" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-20 animate-pulse rounded-[4px] bg-hover" />
                    <div className="h-3 w-28 animate-pulse rounded-[4px] bg-hover" />
                  </div>
                  <div className="h-3.5 w-14 shrink-0 animate-pulse rounded-[4px] bg-hover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
