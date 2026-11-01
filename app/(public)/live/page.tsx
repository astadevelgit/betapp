import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Live matches",
};

export default function LivePage() {
  return (
    <div className="page-shell py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-live/20 bg-live/10 text-live">
          <Radio className="size-7" />
        </span>
        <p className="eyebrow mt-5">Live match centre</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          No matches are live right now.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          When fixtures are connected, live scores and match minutes will appear
          here and refresh automatically. Pre-match markets stay open until
          kickoff.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }), "h-11")}
          >
            <ArrowLeft className="size-4" />
            Back to lobby
          </Link>
          <Link
            href="/auth/register"
            className={cn(buttonVariants(), "h-11")}
          >
            Join the beta
          </Link>
        </div>
      </div>
    </div>
  );
}
