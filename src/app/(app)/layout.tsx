import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getAuthContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (isSupabaseConfigured()) {
    if (!ctx) redirect("/login");
    if (!ctx.profile?.username) redirect("/welcome/username");
  }

  return (
    <div className="min-h-screen">
      <AppHeader ctx={ctx} />
      <main className="mx-auto w-full max-w-[1360px] px-6 py-8">
        {children}
      </main>
    </div>
  );
}
