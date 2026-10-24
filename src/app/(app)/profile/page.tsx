import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await getAuthContext();
  const name = ctx?.profile?.username ?? "—";
  const joined = ctx?.profile?.created_at
    ? new Date(ctx.profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your public trading identity." />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full border border-line-strong bg-active text-[18px] font-bold text-soft">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-extrabold tracking-tight">
              {name}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">Joined {joined}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "League wins", value: "0" },
            { label: "Badges", value: "0" },
            { label: "Trades", value: "0" },
            { label: "Best trade", value: "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[12px] border border-line bg-header px-3.5 py-3"
            >
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {stat.label}
              </dt>
              <dd className="num mt-1 text-[15px] font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Badges" subtitle="Earned by winning leagues and calling streaks." />
        <div className="p-5">
          <EmptyState
            title="No badges yet"
            description="Win a league or hit a five-call streak to start collecting."
          />
        </div>
      </Card>
    </div>
  );
}
