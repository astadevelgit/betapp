import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, Radio } from "lucide-react";

import { LiveScore } from "@/components/matches/live-score";
import { MarketPanel } from "@/components/matches/market-panel";
import { TeamCrest } from "@/components/matches/team-crest";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getMatchById } from "@/lib/catalog/queries";
import type { CatalogMatch } from "@/lib/catalog/types";
import { formatKickoff, formatMatchDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Match centre",
};

export default function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="page-shell py-8 sm:py-12">
      <Suspense fallback={<MatchDetailSkeleton />}>
        <MatchContent params={params} />
      </Suspense>
    </div>
  );
}

async function MatchContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await io();
  const match = await getMatchById(id);

  if (!match) {
    notFound();
  }

  const isScheduled = match.status === "scheduled";

  return (
    <div className="mx-auto max-w-4xl">
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

      <section className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card/70">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            {match.competition.name}
            {match.competition.country ? (
              <span className="text-muted-foreground/60">
                · {match.competition.country}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            {match.isDemo ? (
              <Badge
                variant="outline"
                className="h-5 border-amber-500/30 px-1.5 text-[0.6rem] text-amber-300"
              >
                Demo
              </Badge>
            ) : null}
            <StatusBadge match={match} />
          </span>
        </div>

        <div className="px-5 py-7 sm:px-8">
          <div className="grid grid-cols-3 items-center gap-3">
            <TeamBlock team={match.homeTeam} side="Home" />
            <LiveScore
              matchId={match.id}
              kickoffAt={match.kickoffAt}
              initial={{
                id: match.id,
                status: match.status,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                minute: match.minute,
                lastSyncedAt: null,
              }}
            />
            <TeamBlock team={match.awayTeam} side="Away" />
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            {isScheduled
              ? `${formatMatchDay(match.kickoffAt)} · ${formatKickoff(match.kickoffAt)}`
              : "Pre-match markets are closed."}
          </p>
        </div>
      </section>

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" />
        <p>
          Markets close at kickoff. BetApp is pre-match only: no in-play
          betting, no cash-out, and BET coins have no cash value.
        </p>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Markets</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              Pick your outcome
            </h1>
          </div>
          <Badge variant="outline" className="shrink-0 text-[0.65rem]">
            {match.markets.length} markets
          </Badge>
        </div>

        {match.markets.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {match.markets.map((market) => (
              <MarketPanel key={market.type} market={market} match={match} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center">
            <p className="text-sm font-medium">Odds unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The feed has not published markets for this match yet. Check back
              closer to kickoff.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ match }: { match: CatalogMatch }) {
  if (match.status === "live") {
    return (
      <Badge className="border-live/30 bg-live/10 text-live">
        <Radio className="size-3" />
        Live {match.minute ?? 0}&apos;
      </Badge>
    );
  }

  if (match.status === "halftime") {
    return (
      <Badge className="border-live/30 bg-live/10 text-live">
        <Radio className="size-3" />
        Half time
      </Badge>
    );
  }

  if (match.status === "finished") {
    return <Badge variant="outline">Full time</Badge>;
  }

  if (match.status === "postponed") {
    return <Badge variant="outline">Postponed</Badge>;
  }

  if (match.status === "cancelled") {
    return <Badge variant="outline">Cancelled</Badge>;
  }

  if (match.status === "suspended") {
    return <Badge variant="outline">Suspended</Badge>;
  }

  return <Badge variant="outline">{formatKickoff(match.kickoffAt)}</Badge>;
}

function TeamBlock({
  team,
  side,
}: {
  team: CatalogMatch["homeTeam"];
  side: "Home" | "Away";
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <TeamCrest name={team.name} logoUrl={team.logoUrl} size={52} />
      <p className="text-sm font-semibold leading-tight sm:text-base">
        {team.name}
      </p>
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {side}
      </p>
    </div>
  );
}

function MatchDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="h-52 animate-pulse rounded-2xl border border-border/70 bg-card/50" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl border border-border/70 bg-card/50"
          />
        ))}
      </div>
    </div>
  );
}
