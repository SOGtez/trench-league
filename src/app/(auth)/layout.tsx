import { Wordmark } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex justify-center">
          <Wordmark />
        </div>
        {children}
        <p className="mt-7 text-center text-[12px] leading-relaxed text-muted">
          Trench League is a paper-trading game. No deposits, no withdrawals, no
          real money — prizes are points, badges and bragging rights.
        </p>
      </div>
    </main>
  );
}
