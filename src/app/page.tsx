import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { Landing } from "@/components/marketing/landing";
import { getAuthContext } from "@/lib/auth";

export default async function HomePage() {
  const ctx = await getAuthContext();

  // Signed out (or Supabase not connected yet) — show the marketing page.
  if (!ctx) return <Landing />;

  if (!ctx.profile?.username) redirect("/welcome/username");

  return (
    <div className="min-h-screen">
      <AppHeader ctx={ctx} />
      <main className="mx-auto w-full max-w-[1360px] px-6 py-8">
        <HomeDashboard ctx={ctx} />
      </main>
    </div>
  );
}
