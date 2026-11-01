import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-shell flex h-20 items-center">
        <Logo />
      </header>
      <main className="page-shell flex flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="grid size-16 place-items-center rounded-2xl border border-border bg-card text-muted-foreground">
          <SearchX className="size-7" />
        </span>
        <p className="eyebrow mt-6">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          This page is off target.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The link may be wrong, or the page may not exist yet in this beta
          build.
        </p>
        <Link
          href="/"
          className={cn(buttonVariants(), "mt-6 h-11")}
        >
          <ArrowLeft className="size-4" />
          Back to lobby
        </Link>
      </main>
    </div>
  );
}
