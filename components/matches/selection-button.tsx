"use client";

import { Check } from "lucide-react";
import { toast } from "sonner";

import { captureClientEvent } from "@/lib/analytics/client";
import { formatOdds } from "@/lib/format";
import { useBetSlipStore } from "@/lib/bets/store";
import type { BetSlipLeg } from "@/lib/bets/types";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export function SelectionButton({
  leg,
  label,
  hint,
  disabled,
  reason,
}: {
  leg: BetSlipLeg;
  label: string;
  hint: string;
  disabled: boolean;
  reason: string;
}) {
  const hydrated = useHydrated();
  const selectedInStore = useBetSlipStore((state) =>
    state.legs.some((item) => item.selectionId === leg.selectionId),
  );
  const selected = hydrated && selectedInStore;
  const addLeg = useBetSlipStore((state) => state.addLeg);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      title={
        disabled
          ? reason
          : selected
            ? `Remove ${label} from your bet slip`
            : `Add ${label} to your bet slip`
      }
      onClick={() => {
        const result = addLeg(leg);

        if (result === "added" || result === "replaced") {
          void captureClientEvent("bet_slip_add", {
            matchId: leg.matchId,
            marketId: leg.marketId,
            selectionId: leg.selectionId,
            odds: leg.odds,
            result,
          });
        }

        if (result === "added") {
          toast.success(`${label} added`, {
            description: `${leg.homeTeam} vs ${leg.awayTeam}`,
          });
        } else if (result === "removed") {
          toast("Removed from bet slip");
        } else if (result === "replaced") {
          toast.info("Selection replaced", {
            description: "An accumulator can only use one selection per match.",
          });
        } else {
          toast.error("Bet slip is full", {
            description: "You can combine up to 10 selections.",
          });
        }
      }}
      className={cn(
        "group flex w-full items-center justify-between gap-2 rounded-lg border bg-background/50 px-3 py-2.5 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border/80 opacity-50"
          : selected
            ? "border-brand/60 bg-brand/10"
            : "border-border/80 hover:border-brand/50 hover:bg-brand/5",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-[0.68rem] text-muted-foreground">
          {hint}
        </span>
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm font-semibold tabular-nums",
          selected
            ? "border-brand/40 bg-brand/15 text-brand"
            : "border-brand/20 bg-brand/10 text-brand",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        {formatOdds(leg.odds)}
      </span>
    </button>
  );
}
