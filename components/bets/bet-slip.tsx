"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Loader2,
  Ticket,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { placeBetAction } from "@/lib/bets/actions";
import {
  calculateBetPreview,
  formatTotalOdds,
  MAX_PAYOUT,
  MAX_STAKE,
  MIN_STAKE,
} from "@/lib/bets/math";
import { useBetSlipStore } from "@/lib/bets/store";
import type { BetLegChange, BetType } from "@/lib/bets/types";
import { MARKET_LABELS, selectionLabel } from "@/lib/catalog/labels";
import { formatCoins, formatKickoff, formatOdds } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

interface ChangeView extends BetLegChange {
  previousOdds: number | null;
  matchLabel: string;
  selectionLabel: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BetSlip({
  authenticated,
  balance,
}: {
  authenticated: boolean;
  balance: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mounted = useHydrated();
  const [submitting, setSubmitting] = useState(false);
  const [changeViews, setChangeViews] = useState<ChangeView[] | null>(null);
  const idempotencyRef = useRef<string | null>(null);

  const legs = useBetSlipStore((state) => state.legs);
  const stakeValue = useBetSlipStore((state) => state.stake);
  const mode = useBetSlipStore((state) => state.mode);
  const removeLeg = useBetSlipStore((state) => state.removeLeg);
  const removeLegs = useBetSlipStore((state) => state.removeLegs);
  const clear = useBetSlipStore((state) => state.clear);
  const setStake = useBetSlipStore((state) => state.setStake);
  const setMode = useBetSlipStore((state) => state.setMode);
  const updateOdds = useBetSlipStore((state) => state.updateOdds);

  useEffect(() => {
    const store = useBetSlipStore.getState();
    store.normalize();
    const removed = store.pruneStarted();

    if (removed > 0) {
      toast.info(
        `${removed} selection${removed === 1 ? "" : "s"} removed`,
        {
          description: "Matches that already kicked off were cleared from your slip.",
        },
      );
    }
  }, []);

  const activeLegs = mounted ? legs : [];
  const shownStake = mounted ? stakeValue : "100";
  const shownMode = mounted ? mode : "single";
  const count = activeLegs.length;
  const previewLegs =
    shownMode === "single" ? activeLegs.slice(0, 1) : activeLegs;
  const stakeNumber = Number(shownStake);
  const stakeValid =
    Number.isInteger(stakeNumber) &&
    stakeNumber >= MIN_STAKE &&
    stakeNumber <= MAX_STAKE;
  const modeValid = shownMode === "single" ? count === 1 : count >= 2;
  const preview = calculateBetPreview(
    previewLegs,
    Number.isFinite(stakeNumber) && stakeNumber > 0 ? stakeNumber : 0,
  );
  const insufficient =
    authenticated && balance !== null && stakeValid && stakeNumber > balance;
  const hasBlockingChanges =
    changeViews?.some(
      (change) =>
        change.reason !== "ODDS_CHANGED" || change.currentOdds === null,
    ) ?? false;

  const signature = `${activeLegs
    .map((leg) => `${leg.selectionId}:${leg.odds}`)
    .join("|")}|${shownStake}|${shownMode}`;

  useEffect(() => {
    idempotencyRef.current = null;
  }, [signature]);

  const submitDisabled =
    submitting ||
    count === 0 ||
    !modeValid ||
    !stakeValid ||
    insufficient ||
    !mounted;

  function goToLogin() {
    setOpen(false);
    const next =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;
    router.push(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  async function submit() {
    if (!authenticated) {
      goToLogin();
      return;
    }

    if (submitting) return;

    if (!stakeValid) {
      toast.error(`Stake must be between ${MIN_STAKE} and ${MAX_STAKE} BET coins.`);
      return;
    }

    if (insufficient) {
      toast.error("Not enough BET coins", {
        description: `Your wallet has ${formatCoins(balance ?? 0)} BET.`,
      });
      return;
    }

    if (shownMode === "single" && count !== 1) {
      toast.error("A single needs exactly one selection.");
      return;
    }

    if (shownMode === "accumulator" && (count < 2 || count > 10)) {
      toast.error("An accumulator needs between 2 and 10 selections.");
      return;
    }

    const selectedLegs =
      shownMode === "single" ? activeLegs.slice(0, 1) : activeLegs;
    const key = idempotencyRef.current ?? newIdempotencyKey();
    idempotencyRef.current = key;

    setSubmitting(true);

    try {
      const result = await placeBetAction({
        idempotencyKey: key,
        type: shownMode,
        stake: stakeNumber,
        legs: selectedLegs.map((leg) => ({
          matchId: leg.matchId,
          marketId: leg.marketId,
          selectionId: leg.selectionId,
          expectedOdds: leg.odds,
        })),
      });

      if (result.ok) {
        idempotencyRef.current = null;
        clear();
        setChangeViews(null);
        setOpen(false);
        toast.success(result.duplicate ? "Bet already placed" : "Bet placed", {
          description: `${result.duplicate ? "Your earlier submission" : `${shownMode === "single" ? "Single" : "Accumulator"} · ${formatCoins(result.stake)} BET at ${formatTotalOdds(result.totalOdds)}`} · potential payout ${formatCoins(result.potentialPayout)} BET.`,
        });
        router.refresh();
        return;
      }

      if (result.code === "ODDS_CHANGED") {
        const changes = result.changes ?? [];
        const currentLegs = useBetSlipStore.getState().legs;
        const views: ChangeView[] = changes.map((change) => {
          const leg = currentLegs.find(
            (item) => item.selectionId === change.selectionId,
          );

          return {
            ...change,
            previousOdds: leg?.odds ?? null,
            matchLabel: leg
              ? `${leg.homeTeam} vs ${leg.awayTeam}`
              : "Selection",
            selectionLabel: leg
              ? selectionLabel(leg.marketType, leg.selectionName)
              : "Selection",
          };
        });

        if (views.length === 0) {
          toast.error(result.message);
          return;
        }

        for (const change of changes) {
          if (
            change.reason === "ODDS_CHANGED" &&
            change.currentOdds !== null
          ) {
            updateOdds(change.selectionId, change.currentOdds);
          }
        }

        setOpen(false);
        setChangeViews(views);
        return;
      }

      if (result.code === "AUTH_REQUIRED") {
        goToLogin();
        return;
      }

      if (result.code === "INSUFFICIENT_BALANCE") {
        toast.error(result.message, {
          description: "Your wallet was refreshed. Lower the stake and try again.",
        });
        router.refresh();
        return;
      }

      toast.error(result.message);
    } catch {
      toast.error("Network error", {
        description: "Your bet was not confirmed. Try again — retries are safe.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function acceptNewOdds() {
    if (hasBlockingChanges) return;
    setChangeViews(null);
    void submit();
  }

  function removeUnavailable() {
    const ids = (changeViews ?? [])
      .filter(
        (change) =>
          change.reason !== "ODDS_CHANGED" || change.currentOdds === null,
      )
      .map((change) => change.selectionId);

    if (ids.length > 0) {
      removeLegs(ids);
      toast("Unavailable selections removed");
    }

    setChangeViews(null);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Open bet slip${count > 0 ? `, ${count} selections` : ""}`}
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-20 z-40 flex items-center gap-2.5 rounded-2xl border border-brand/30 bg-card/95 p-2 pr-3 text-left shadow-xl shadow-black/30 backdrop-blur transition-colors hover:border-brand/60 md:right-6 md:bottom-6"
        >
          <span className="relative grid size-10 place-items-center rounded-xl bg-brand text-primary-foreground">
            <Ticket className="size-5" />
            {count > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full border-2 border-card bg-warning px-1 text-[0.6rem] font-bold text-black">
                {count}
              </span>
            ) : null}
          </span>
          <span>
            <span className="block text-xs font-semibold">Bet slip</span>
            <span className="block text-[0.65rem] text-muted-foreground">
              {count === 0
                ? "Add a selection"
                : `${count} selection${count === 1 ? "" : "s"} · ${formatTotalOdds(preview.totalOdds)}`}
            </span>
          </span>
        </button>

        <SheetContent className="w-full gap-0 bg-card p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/70 p-4 pr-14">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <Ticket className="size-5 text-brand" />
                  Bet slip
                </SheetTitle>
                <SheetDescription>
                  {count === 0
                    ? "Your selections will appear here."
                    : `${count} selection${count === 1 ? "" : "s"} ready to review.`}
                </SheetDescription>
              </div>
              {count > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clear();
                    idempotencyRef.current = null;
                    toast("Bet slip cleared");
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>
          </SheetHeader>

          {count === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
              <span className="grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
                <Ticket className="size-6" />
              </span>
              <p className="mt-4 text-base font-semibold">Your slip is empty</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Tap any odds on a match to add a single or build an accumulator.
              </p>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-5 h-9 px-4",
                )}
              >
                Browse matches
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <Tabs
                  value={shownMode}
                  onValueChange={(value) => setMode(value as BetType)}
                  className="w-full gap-3"
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="single" className="flex-1">
                      Singles
                    </TabsTrigger>
                    <TabsTrigger value="accumulator" className="flex-1">
                      Accumulator
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {!modeValid ? (
                  <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <p>
                      {shownMode === "single"
                        ? "A single uses one selection. Remove the extra legs or switch to Accumulator."
                        : "Add at least one more selection to place an accumulator."}
                    </p>
                  </div>
                ) : null}

                <ul className="mt-3 divide-y divide-border/70">
                  {activeLegs.map((leg, index) => (
                    <li key={leg.selectionId} className="py-3 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[0.62rem] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                            {leg.competition} · {formatKickoff(leg.kickoffAt)}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium">
                            {leg.homeTeam} vs {leg.awayTeam}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {MARKET_LABELS[leg.marketType]} ·{" "}
                            {selectionLabel(leg.marketType, leg.selectionName)}
                            {shownMode === "single" && index > 0
                              ? " · not included in this single"
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-md border border-brand/20 bg-brand/10 px-2 py-1 text-sm font-semibold tabular-nums text-brand">
                            {formatOdds(leg.odds)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove ${selectionLabel(leg.marketType, leg.selectionName)}`}
                            onClick={() => removeLeg(leg.selectionId)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-[0.68rem] leading-5 text-muted-foreground">
                  No same-match legs. Odds are checked again when you place the
                  bet, and any movement is shown before you confirm.
                </div>
              </div>

              <SheetFooter className="mt-0 border-t border-border/70 bg-card p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Coins className="size-3.5 text-brand" />
                    Wallet balance
                  </span>
                  <span className="font-semibold tabular-nums">
                    {authenticated && balance !== null
                      ? `${formatCoins(balance)} BET`
                      : "—"}
                  </span>
                </div>

                {authenticated ? (
                  <>
                    <label
                      htmlFor="bet-slip-stake"
                      className="mt-1 block text-xs font-medium text-muted-foreground"
                    >
                      Stake per bet
                    </label>
                    <Input
                      id="bet-slip-stake"
                      inputMode="numeric"
                      autoComplete="off"
                      value={shownStake}
                      onChange={(event) => setStake(event.target.value)}
                      aria-invalid={!stakeValid}
                      className="h-10 bg-background/60 text-base font-semibold tabular-nums"
                    />

                    <div className="grid grid-cols-4 gap-1.5">
                      {[100, 500, 1000, 5000].map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => setStake(String(value))}
                          className={cn(
                            "tabular-nums",
                            stakeNumber === value && "border-brand/50 text-brand",
                          )}
                        >
                          {formatCoins(value)}
                        </Button>
                      ))}
                    </div>

                    {!stakeValid && shownStake.length > 0 ? (
                      <p className="text-xs text-destructive">
                        Stake must be a whole number from {MIN_STAKE} to{" "}
                        {MAX_STAKE} BET coins.
                      </p>
                    ) : null}

                    {insufficient ? (
                      <p className="text-xs text-destructive">
                        Not enough coins. Lower your stake or claim daily coins.
                      </p>
                    ) : null}

                    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Total odds
                        </span>
                        <span className="font-semibold tabular-nums">
                          {modeValid ? formatTotalOdds(preview.totalOdds) : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Potential payout
                        </span>
                        <span className="font-semibold tabular-nums text-brand">
                          {modeValid && stakeValid
                            ? `${formatCoins(preview.potentialPayout)} BET`
                            : "—"}
                        </span>
                      </div>
                      {preview.capped && modeValid ? (
                        <p className="mt-1.5 text-[0.65rem] text-warning">
                          Payout is capped at {formatCoins(MAX_PAYOUT)} BET.
                        </p>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      size="lg"
                      className="mt-1 h-11 w-full text-sm font-semibold"
                      disabled={submitDisabled}
                      onClick={() => void submit()}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Placing bet…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4" />
                          {shownMode === "single"
                            ? "Place single"
                            : "Place accumulator"}
                          {stakeValid ? ` · ${formatCoins(stakeNumber)} BET` : ""}
                        </>
                      )}
                    </Button>

                    <p className="text-center text-[0.62rem] leading-4 text-muted-foreground">
                      BetApp is play money only. BET coins cannot be bought,
                      withdrawn, or exchanged for prizes.
                    </p>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Log in to place this bet. Your slip is saved on this
                      device.
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      className="h-10 w-full"
                      onClick={goToLogin}
                    >
                      Log in to bet
                    </Button>
                    <Link
                      href="/auth/register"
                      onClick={() => setOpen(false)}
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "h-10 w-full",
                      )}
                    >
                      Create a beta account
                    </Link>
                  </div>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={changeViews !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setChangeViews(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-warning" />
              Review your slip
            </DialogTitle>
            <DialogDescription>
              {hasBlockingChanges
                ? "Some selections are no longer available. Remove them before placing the bet."
                : "The odds moved while you were checking out. Accept the updated odds to place at the new price."}
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(changeViews ?? []).map((change) => {
              const isOddsChange = change.reason === "ODDS_CHANGED";
              return (
                <li
                  key={change.selectionId}
                  className="rounded-lg border border-border/70 bg-background/40 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {change.matchLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {change.selectionLabel}
                      </p>
                    </div>
                    {isOddsChange &&
                    change.previousOdds !== null &&
                    change.currentOdds !== null ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums">
                        <span className="text-muted-foreground line-through">
                          {formatOdds(change.previousOdds)}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="text-brand">
                          {formatOdds(change.currentOdds)}
                        </span>
                      </span>
                    ) : (
                      <Badge
                        variant={isOddsChange ? "outline" : "destructive"}
                        className="shrink-0 text-[0.6rem]"
                      >
                        {isOddsChange ? "Unavailable" : "Closed"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">
                    {change.message}
                  </p>
                </li>
              );
            })}
          </ul>

          <DialogFooter>
            {hasBlockingChanges ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangeViews(null)}
                >
                  Review slip
                </Button>
                <Button type="button" onClick={removeUnavailable}>
                  Remove unavailable
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangeViews(null)}
                >
                  Not now
                </Button>
                <Button
                  type="button"
                  onClick={acceptNewOdds}
                  disabled={submitting}
                >
                  {submitting ? "Placing…" : "Accept new odds"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
