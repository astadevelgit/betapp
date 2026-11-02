import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  Coins,
  Database,
  RefreshCw,
  Ticket,
  Users,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { formatCoins, formatDateTime } from "@/lib/format";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Admin dashboard",
};

export const instant = false;

type SyncRun = {
  job: string;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export default async function AdminDashboardPage() {
  await connection();
  await requireAdmin();

  let players = 0;
  let waitlisted = 0;
  let coinsInCirculation = 0;
  let openBets = 0;
  let openLiability = 0;
  let syncRuns: SyncRun[] = [];
  let dataError: string | null = null;

  if (isSupabaseAdminConfigured()) {
    const admin = getSupabaseAdminClient();
    const [
      profilesResult,
      waitlistResult,
      walletsResult,
      openBetsResult,
      syncResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("status", "deleted"),
      admin
        .from("waitlist")
        .select("id", { count: "exact", head: true }),
      admin.from("wallets").select("balance"),
      admin
        .from("bets")
        .select("potential_payout")
        .eq("status", "open"),
      admin
        .from("sync_runs")
        .select("job, status, started_at, finished_at, error")
        .order("started_at", { ascending: false })
        .limit(6),
    ]);

    if (
      profilesResult.error ||
      waitlistResult.error ||
      walletsResult.error ||
      openBetsResult.error ||
      syncResult.error
    ) {
      dataError = "Some dashboard metrics could not be loaded.";
    } else {
      players = profilesResult.count ?? 0;
      waitlisted = waitlistResult.count ?? 0;
      coinsInCirculation = (walletsResult.data ?? []).reduce(
        (total, wallet) => total + Number(wallet.balance ?? 0),
        0,
      );
      openBets = (openBetsResult.data ?? []).length;
      openLiability = (openBetsResult.data ?? []).reduce(
        (total, bet) => total + Number(bet.potential_payout ?? 0),
        0,
      );
      syncRuns = (syncResult.data ?? []) as SyncRun[];
    }
  }

  const metrics = [
    {
      label: "Active players",
      value: players.toString(),
      detail: `${waitlisted} on the waitlist`,
      icon: Users,
    },
    {
      label: "Coins in circulation",
      value: formatCoins(coinsInCirculation),
      detail: "BET wallet balances",
      icon: CircleDollarSign,
    },
    {
      label: "Open bets",
      value: openBets.toString(),
      detail: "Awaiting final results",
      icon: Ticket,
    },
    {
      label: "Open liability",
      value: formatCoins(openLiability),
      detail: "Maximum potential payout",
      icon: Coins,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Live operational metrics for the private beta.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-brand/30 bg-brand/10 text-brand"
        >
          Week 4 settlement
        </Badge>
      </div>

      {!isSupabaseAdminConfigured() && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Add <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          to load live admin metrics. Placeholder values are shown until then.
        </div>
      )}

      {dataError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {dataError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="border-border/80 bg-card/70">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <Icon className="size-4 text-brand" />
                </div>
                <p className="text-3xl font-semibold tabular-nums">
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="size-4 text-brand" />
              Sync health
            </CardTitle>
            <CardDescription>
              Recent Sportmonks fixture, live-score, and odds syncs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {syncRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 px-5 py-8 text-center text-sm text-muted-foreground">
                No sync runs yet. Run a cron sync to populate the catalog.
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {syncRuns.map((run, index) => (
                  <li
                    key={`${run.job}-${run.started_at}-${index}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{run.job}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(run.started_at)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        run.status === "success"
                          ? "border-brand/30 bg-brand/10 text-brand"
                          : run.status === "failed"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-warning/30 bg-warning/10 text-warning"
                      }
                    >
                      {run.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-brand" />
              Operational checklist
            </CardTitle>
            <CardDescription>
              Core loops that are wired up for the beta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              "Supabase auth, wallets, ledger, and daily claims",
              "Sportmonks catalog, live scores, and pre-match odds",
              "Atomic bet placement with odds snapshots",
              "Automatic settlement with void recalculation",
              "Admin settle/void actions and audit trail",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
            <Link
              href="/admin/settings"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              Review settings
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WalletCards className="size-4 text-brand" />
            Operational screens
          </CardTitle>
          <CardDescription>
            Jump into the daily operating views.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Matches", "/admin/matches"],
            ["Bets", "/admin/bets"],
            ["Users", "/admin/users"],
            ["Audit log", "/admin/audit"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground"
            >
              {label}
              <ArrowRight className="size-3.5" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
