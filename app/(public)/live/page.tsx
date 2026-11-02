import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";

import { LiveMatches } from "@/components/matches/live-matches";
import { MatchCard } from "@/components/matches/match-card";
import { buttonVariants } from "@/components/ui/button";
import { getLiveMatches, getUpcomingMatches } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Live matches",
};

export default function LivePage() {
  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mb-6">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 h-9 gap-2 text-muted-foreground",
          )}
        >
          <ArrowLeft className="size-4" />
          Back to lobby
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-live/20 bg-live/10 text-live">
            <Radio className="size-5" />
          </span>
          <div>
            <p className="eyebrow">Live match centre</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Scores, minutes, and status
            </h1>
          </div>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Live scores refresh every 60 seconds. Pre-match markets close at
          kickoff; there is no in-play betting.
        </p>
      </div>

      <Suspense fallback={<LiveSkeleton />}>
        <LiveContent />
      </Suspense>
    </div>
  );
}

async function LiveContent() {
  await io();
  const [live, upcoming] = await Promise.all([
    getLiveMatches(),
    getUpcomingMatches(6),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Live now
        </h2>
        <LiveMatches initialMatches={live} />
      </div>

      {upcoming.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Next up
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LiveSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-xl border border-border/70 bg-card/50"
          />
        ))}
      </div>
    </div>
  );
}
