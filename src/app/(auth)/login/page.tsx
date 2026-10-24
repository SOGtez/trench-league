import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";
  const initialError = params.error
    ? "Could not complete sign in. Please try again."
    : null;

  return (
    <Card className="p-6 sm:p-7">
      <h1 className="text-[22px] font-extrabold tracking-tight">Log in</h1>
      <p className="mt-1 text-sm text-muted">
        Pick up where your paper portfolio left off.
      </p>

      <div className="mt-6">
        <LoginForm nextPath={nextPath} initialError={initialError} />
      </div>

      <p className="mt-6 text-center text-[13px] text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-link hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
