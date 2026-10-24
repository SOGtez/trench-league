import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <Card className="p-6 sm:p-7">
      <h1 className="text-[22px] font-extrabold tracking-tight">
        Start with 10 paper SOL
      </h1>
      <p className="mt-1 text-sm text-muted">
        Practice on live memecoins. No wallet, no deposits.
      </p>

      <div className="mt-6">
        <SignUpForm />
      </div>

      <p className="mt-6 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-link hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
