import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Ticket } from "lucide-react";

import { AdminBetActions } from "@/components/admin/admin-bet-actions";
import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth/session";
import {
  getAdminBets,
  type AdminBetFilter,
  type AdminBetRow,
} from "@/lib/admin/queries";
import { formatTotalOdds } from "@/lib/bets/math";
import type { BetStatus, LegResult } from "@/lib/bets/types";
import { MARKET_LABELS, selectionLabel } from "@/lib/catalog/labels";
import {
  formatCoins,
  formatDateTime,
  formatKickoff,
  formatOdds,
} from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin bets",
};

export const instant = false;

const FILTERS: Array<{ value: AdminBetFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "settled", label: "Settled" },
  { value: "all", label: "All" },
];

const BET_STATUS: Record<BetStatus, { label: string; className: string }> = {
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
    label: "Awaiting",
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

function resolveFilter(value: string | undefined): AdminBetFilter {
  return value === "settled" || value === "all" ? value : "open";
}

export default async function AdminBetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  await requireAdmin();

  if (!isSupabaseAdminConfigured()) {
    return <AdminConfigNotice />;
  }

  const params = await searchParams;
  const filter = resolveFilter(params.status);
  const bets = await getAdminBets(filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Bets</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Inspect leg snapshots and settled results. Manual settlements use
            the same atomic function as the cron, require a reason, and write an
            audit entry.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-brand/30 bg-brand/10 text-brand"
        >
          Atomic settlement live
        </Badge>
      </div>

      <div className="flex w-fit items-center rounded-lg bg-muted p-[3px]">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={
              item.value === "open"
                ? "/admin/bets"
                : `/admin/bets?status=${item.value}`
            }
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filter === item.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {bets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <Ticket className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">
            {filter === "open" ? "No open bets" : "No bets in this view"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Bets appear here as soon as players place them. Completed fixtures
            settle automatically every five minutes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bets.map((bet) => (
            <AdminBetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminBetCard({ bet }: { bet: AdminBetRow }) {
  const status = BET_STATUS[bet.status];
  const isOpen = bet.status === "open";
  const payout = isOpen ? bet.potentialPayout : bet.payout;
  const canSettle = isOpen && bet.evaluation.ready;
  const settleReason = isOpen && !bet.evaluation.ready ? bet.evaluation.reason : null;

  return (
    <article className="overflow-hidden rounded-xl border border-border/80 bg-card/70">
      <div className="flex flex-col justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn("text-[0.6rem]", status.className)}>
              {status.label}
            </Badge>
            <Badge variant="outline" className="text-[0.6rem] capitalize">
              {bet.type}
            </Badge>
            <span className="font-mono text-[0.62rem] text-muted-foreground">
              #{bet.id.slice(0, 8)}
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium">
            {bet.user.displayName}
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {bet.user.email}
            </span>
          </p>
          <p className="text-[0.65rem] text-muted-foreground">
            Placed {formatDateTime(bet.placedAt)}
            {bet.settledAt
              ? ` · settled ${formatDateTime(bet.settledAt)}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-start justify-between gap-6 sm:justify-end">
          <div className="text-right">
            <p className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {isOpen ? "Potential payout" : "Payout"}
            </p>
            <p
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums",
                isOpen
                  ? "text-brand"
                  : bet.status === "lost"
                    ? "text-muted-foreground"
                    : "text-foreground",
              )}
            >
              {formatCoins(payout)}
              <span className="ml-1 text-[0.65rem] font-medium tracking-normal text-muted-foreground">
                BET
              </span>
            </p>
          </div>
          {isOpen ? (
            <AdminBetActions
              betId={bet.id}
              canSettle={canSettle}
              settleReason={settleReason}
              stake={bet.stake}
            />
          ) : null}
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
                    ) : (
                      <span className="ml-2 text-[0.65rem] font-normal capitalize text-muted-foreground">
                        {leg.match.status}
                      </span>
                    )}
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
                  <Badge
                    variant="outline"
                    className={cn("h-4 px-1.5 text-[0.58rem]", result.className)}
                  >
                    {result.label}
                  </Badge>
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
            {formatTotalOdds(bet.totalOdds)}
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

      {bet.settlementReason ? (
        <div className="border-t border-border/60 bg-background/30 px-4 py-2.5 text-[0.68rem] text-muted-foreground">
          <span className="font-medium text-foreground">Settlement note:</span>{" "}
          {bet.settlementReason}
        </div>
      ) : null}
    </article>
  );
}
