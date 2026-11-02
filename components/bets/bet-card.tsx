import { Badge } from "@/components/ui/badge";
import type { BetStatus, BetSummary, LegResult } from "@/lib/bets/types";
import { MARKET_LABELS, selectionLabel } from "@/lib/catalog/labels";
import {
  formatCoins,
  formatDateTime,
  formatKickoff,
  formatOdds,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const BET_STATUS: Record<
  BetStatus,
  { label: string; className: string }
> = {
  open: {
    label: "Open",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  won: {
    label: "Won",
    className: "border-brand/30 bg-brand/10 text-brand",
  },
  lost: {
    label: "Lost",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  void: {
    label: "Void",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const LEG_RESULT: Record<LegResult, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "border-border text-muted-foreground",
  },
  won: {
    label: "Won",
    className: "border-brand/30 bg-brand/10 text-brand",
  },
  lost: {
    label: "Lost",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  void: {
    label: "Void",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function BetCard({ bet }: { bet: BetSummary }) {
  const status = BET_STATUS[bet.status];
  const isOpen = bet.status === "open";
  const payout = isOpen ? bet.potentialPayout : bet.payout;

  return (
    <article className="overflow-hidden rounded-xl border border-border/80 bg-card/70">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[0.6rem] capitalize">
              {bet.type}
            </Badge>
            <Badge className={cn("text-[0.6rem]", status.className)}>
              {status.label}
            </Badge>
          </div>
          <p className="mt-1.5 text-[0.65rem] text-muted-foreground">
            Placed {formatDateTime(bet.placedAt)}
            {bet.settledAt ? ` · settled ${formatDateTime(bet.settledAt)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {isOpen ? "Potential payout" : "Payout"}
          </p>
          <p
            className={cn(
              "mt-0.5 text-lg font-semibold tabular-nums",
              isOpen ? "text-brand" : bet.status === "lost" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {formatCoins(payout)}
            <span className="ml-1 text-[0.65rem] font-medium tracking-normal text-muted-foreground">
              BET
            </span>
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {bet.legs.map((leg) => {
          const result = LEG_RESULT[leg.result];
          const score =
            leg.match.homeScore !== null && leg.match.awayScore !== null
              ? `${leg.match.homeScore}–${leg.match.awayScore}`
              : null;

          return (
            <li key={leg.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {leg.match.competition} ·{" "}
                    {formatKickoff(leg.match.kickoffAt)}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {leg.match.homeTeam} vs {leg.match.awayTeam}
                    {score ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] tabular-nums text-foreground">
                        {score}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {MARKET_LABELS[leg.marketType]} ·{" "}
                    {selectionLabel(leg.marketType, leg.selectionName)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-brand">
                    {formatOdds(leg.oddsAtPlacement)}
                  </span>
                  {bet.status !== "open" ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1.5 text-[0.58rem]",
                        result.className,
                      )}
                    >
                      {result.label}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 bg-background/30 text-center">
        <div className="px-2 py-2.5">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground">
            Stake
          </p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums">
            {formatCoins(bet.stake)} BET
          </p>
        </div>
        <div className="px-2 py-2.5">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground">
            Total odds
          </p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums">
            {bet.totalOdds.toFixed(2)}
          </p>
        </div>
        <div className="px-2 py-2.5">
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground">
            Legs
          </p>
          <p className="mt-0.5 text-xs font-semibold tabular-nums">
            {bet.legs.length}
          </p>
        </div>
      </div>
    </article>
  );
}
