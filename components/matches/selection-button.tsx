"use client";

import { toast } from "sonner";

import { formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SelectionButton({
  label,
  hint,
  odds,
  disabled,
  reason,
}: {
  label: string;
  hint: string;
  odds: number;
  disabled: boolean;
  reason: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? reason : `Add ${label} to your bet slip`}
      onClick={() => {
        toast.info("Bet slip opens in the next build.", {
          description: "Markets are ready. Betting and wallet debits come next.",
        });
      }}
      className={cn(
        "group flex w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-background/50 px-3 py-2.5 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-brand/50 hover:bg-brand/5",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-[0.68rem] text-muted-foreground">
          {hint}
        </span>
      </span>
      <span className="shrink-0 rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-sm font-semibold tabular-nums text-brand">
        {formatOdds(odds)}
      </span>
    </button>
  );
}
