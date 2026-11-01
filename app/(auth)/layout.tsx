import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/layout/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-14rem] size-[34rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-10rem] size-[28rem] rounded-full bg-sky-500/5 blur-3xl" />
      </div>

      <header className="page-shell flex h-20 items-center justify-between">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to lobby
        </Link>
      </header>

      <main className="page-shell flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="page-shell flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
        <p>Play money only. BET coins have no cash value.</p>
        <p>18+ · Nigeria private beta</p>
      </footer>
    </div>
  );
}
