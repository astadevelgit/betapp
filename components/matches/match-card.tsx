import Link from "next/link";
import { Radio } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { CatalogMatch, CatalogSelectionName } from "@/lib/catalog/types";
import { formatKickoffTime, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TeamCrest } from "./team-crest";

const ONE_X_TWO: Array<{ name: CatalogSelectionName; label: string }> = [
  { name: "home", label: "1" },
  { name: "draw", label: "X" },
  { name: "away", label: "2" },
];

export function MatchCard({
  match,
  className,
}: {
  match: CatalogMatch;
  className?: string;
}) {
  const market = match.markets.find(
    (entry) => entry.type === "1X2" && entry.status === "open",
  );
  const isLive = match.status === "live" || match.status === "halftime";
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <Link
      href={`/match/${match.id}`}
      className={cn(
        "group block rounded-xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-brand/40 hover:bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{match.competition.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {match.isDemo ? (
            <Badge
              variant="outline"
              className="h-5 border-amber-500/30 px-1.5 text-[0.6rem] text-amber-300"
            >
              Demo
            </Badge>
          ) : null}
          {isLive ? (
            <span className="inline-flex items-center gap-1 font-semibold text-live">
              <Radio className="size-3" />
              {match.status === "halftime" ? "HT" : `${match.minute ?? 0}'`}
            </span>
          ) : (
            <span>{formatKickoffTime(match.kickoffAt)}</span>
          )}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <TeamRow
          name={match.homeTeam.name}
          logoUrl={match.homeTeam.logoUrl}
          score={hasScore ? match.homeScore : null}
        />
        <TeamRow
          name={match.awayTeam.name}
          logoUrl={match.awayTeam.logoUrl}
          score={hasScore ? match.awayScore : null}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {ONE_X_TWO.map((selection) => {
          const option = market?.selections.find(
            (entry) => entry.name === selection.name && entry.active,
          );

          return (
            <span
              key={selection.name}
              className={cn(
                "flex items-center justify-between rounded-lg border border-border/70 bg-background/50 px-2.5 py-1.5 text-xs",
                option
                  ? "text-foreground"
                  : "text-muted-foreground/60",
              )}
            >
              <span className="font-medium">{selection.label}</span>
              <span className="font-semibold tabular-nums">
                {option ? formatOdds(option.odds) : "—"}
              </span>
            </span>
          );
        })}
      </div>
    </Link>
  );
}

function TeamRow({
  name,
  logoUrl,
  score,
}: {
  name: string;
  logoUrl: string | null;
  score: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamCrest name={name} logoUrl={logoUrl} size={24} />
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
      {score !== null ? (
        <span className="shrink-0 text-base font-semibold tabular-nums">
          {score}
        </span>
      ) : null}
    </div>
  );
}
