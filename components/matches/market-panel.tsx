import { Badge } from "@/components/ui/badge";
import {
  MARKET_HINTS,
  MARKET_LABELS,
  selectionHint,
  selectionLabel,
} from "@/lib/catalog/labels";
import type { CatalogMarket, CatalogMatch } from "@/lib/catalog/types";
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
      : "Betting opens in the next build.";

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
        {market.selections.map((selection) => (
          <SelectionButton
            key={selection.name}
            label={selectionLabel(market.type, selection.name)}
            hint={selectionHint(
              market.type,
              selection.name,
              match.homeTeam.name,
              match.awayTeam.name,
            )}
            odds={selection.odds}
            disabled={disabled || !selection.active}
            reason={
              selection.active ? reason : "This selection is unavailable."
            }
          />
        ))}
      </div>
    </section>
  );
}
