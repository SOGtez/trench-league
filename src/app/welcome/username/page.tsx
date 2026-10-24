import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth";

import { UsernameForm } from "./username-form";

export const metadata: Metadata = { title: "Choose your username" };

export default async function ChooseUsernamePage() {
  const ctx = await getAuthContext();

  if (!ctx) redirect("/login");
  if (ctx.profile?.username) redirect("/");

  const suggestion = (ctx.user.email ?? "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex justify-center">
          <Wordmark />
        </div>

        <Card className="p-6 sm:p-7">
          <h1 className="text-[22px] font-extrabold tracking-tight">
            Choose your username
          </h1>
          <p className="mt-1 text-sm text-muted">
            This is how friends will see you on league leaderboards. It can be
            changed later.
          </p>

          <div className="mt-6">
            <UsernameForm suggestion={suggestion} />
          </div>
        </Card>

        <p className="mt-7 text-center text-[12px] leading-relaxed text-muted">
          Your practice account already has 10 paper SOL waiting.
        </p>
      </div>
    </main>
  );
}
