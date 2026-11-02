import { Badge } from "@/components/ui/badge";
import {
  MARKET_HINTS,
  MARKET_LABELS,
  selectionHint,
  selectionLabel,
} from "@/lib/catalog/labels";
import type { CatalogMarket, CatalogMatch } from "@/lib/catalog/types";
import type { BetSlipLeg } from "@/lib/bets/types";
import { cn } from "@/lib/utils";

import { SelectionButton } from "./selection-button";

export function MarketPanel({
  market,
  match,
}: {
  market: CatalogMarket;
  match: CatalogMatch;
}) {
  const isOpen = market.status === "open";
  const isScheduled = match.status === "scheduled";
  const disabled = !isOpen || !isScheduled;
  const reason = !isScheduled
    ? "Markets close at kickoff."
    : !isOpen
      ? "This market is suspended."
      : "This selection is unavailable.";

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{MARKET_LABELS[market.type]}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {MARKET_HINTS[market.type]}
          </p>
        </div>
        {!isOpen ? (
          <Badge variant="outline" className="shrink-0 text-[0.65rem]">
            Suspended
          </Badge>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-3 grid gap-2",
          market.selections.length > 2 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {market.selections.map((selection) => {
          const label = selectionLabel(market.type, selection.name);
          const leg: BetSlipLeg = {
            matchId: match.id,
            marketId: market.id,
            selectionId: selection.id,
            odds: selection.odds,
            marketType: market.type,
            selectionName: selection.name,
            homeTeam: match.homeTeam.name,
            awayTeam: match.awayTeam.name,
            competition: match.competition.name,
            kickoffAt: match.kickoffAt,
          };

          return (
            <SelectionButton
              key={selection.id}
              leg={leg}
              label={label}
              hint={selectionHint(
                market.type,
                selection.name,
                match.homeTeam.name,
                match.awayTeam.name,
              )}
              disabled={disabled || !selection.active}
              reason={
                selection.active ? reason : "This selection is unavailable."
              }
            />
          );
        })}
      </div>
    </section>
  );
}
