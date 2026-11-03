import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Activity, ShieldCheck } from "lucide-react";

import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { AdminSyncButtons } from "@/components/admin/admin-sync-buttons";
import { Badge } from "@/components/ui/badge";
import {
  getAdminMatches,
  getSyncJobStatus,
  type AdminMatchFilter,
  type AdminMatchRow,
  type SyncJobStatus,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { MARKET_LABELS } from "@/lib/catalog/labels";
import { formatDateTime, formatKickoff } from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin matches",
};

export const instant = false;

const FILTERS: Array<{ value: AdminMatchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
  { value: "finished", label: "Finished" },
];

const JOB_LABELS: Record<string, string> = {
  "sync-fixtures": "Fixtures",
  "sync-live": "Live scores",
  "sync-odds": "Odds",
  settle: "Settlement",
  cleanup: "Cleanup",
};

const MATCH_STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  scheduled: {
    label: "Scheduled",
    className: "border-border bg-muted text-muted-foreground",
  },
  live: {
    label: "Live",
    className: "border-live/30 bg-live/10 text-live",
  },
  halftime: {
    label: "Half-time",
    className: "border-live/30 bg-live/10 text-live",
  },
  finished: {
    label: "Finished",
    className: "border-brand/30 bg-brand/10 text-brand",
  },
  postponed: {
    label: "Postponed",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  suspended: {
    label: "Suspended",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
};

function resolveFilter(value: string | undefined): AdminMatchFilter {
  return value === "upcoming" || value === "live" || value === "finished"
    ? value
    : "all";
}

function jobTone(status: SyncJobStatus["status"]): string {
  return status === "success"
    ? "border-brand/30 bg-brand/10 text-brand"
    : status === "running"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-destructive/30 bg-destructive/10 text-destructive";
}

export default async function AdminMatchesPage({
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
  const [matches, syncJobs] = await Promise.all([
    getAdminMatches({ filter }),
    getSyncJobStatus(),
  ]);

  const liveCount = matches.filter((match) =>
    ["live", "halftime"].includes(match.status),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Matches</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Inspect fixture coverage, scores, and market depth. Manual syncs use
            the same provider jobs as cron and write to the sync log.
          </p>
        </div>
        <AdminSyncButtons />
      </div>

      {syncJobs.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {syncJobs.map((job) => {
            const label = JOB_LABELS[job.job] ?? job.job;
            const metadataFailures = Array.isArray(job.metadata.failures)
              ? job.metadata.failures.length
              : 0;

            return (
              <div
                key={job.job}
                className="rounded-xl border border-border/80 bg-card/70 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{label}</p>
                  <Badge
                    variant="outline"
                    className={cn("text-[0.58rem]", jobTone(job.status))}
                  >
                    {job.status}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
                  {job.finishedAt
                    ? `Finished ${formatDateTime(job.finishedAt)}`
                    : job.status === "running"
                      ? `Started ${formatDateTime(job.startedAt)}`
                      : `Last run ${formatDateTime(job.startedAt)}`}
                </p>
                <p className="mt-1 text-[0.68rem] text-muted-foreground">
                  {job.recordsProcessed} record
                  {job.recordsProcessed === 1 ? "" : "s"} processed
                  {metadataFailures > 0
                    ? ` · ${metadataFailures} failure${metadataFailures === 1 ? "" : "s"}`
                    : ""}
                </p>
                {job.error ? (
                  <p className="mt-1 line-clamp-2 text-[0.65rem] text-destructive">
                    {job.error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          No sync runs have been recorded yet. Use a manual sync to populate the
          catalog.
        </p>
      )}

      <div className="flex w-fit items-center rounded-lg bg-muted p-[3px]">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={
              item.value === "all"
                ? "/admin/matches"
                : `/admin/matches?status=${item.value}`
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{matches.length}</strong>{" "}
          fixture{matches.length === 1 ? "" : "s"}
        </span>
        <span>
          <Activity className="mr-1 inline size-3.5 text-live" />
          <strong className="text-live">{liveCount}</strong> live in view
        </span>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <ShieldCheck className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">No fixtures in this view</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Run a fixture sync or switch the status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: AdminMatchRow }) {
  const status = MATCH_STATUS_STYLES[match.status] ?? {
    label: match.status,
    className: "border-border bg-muted text-muted-foreground",
  };
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}–${match.awayScore}`
      : null;
  const selectionCount = match.markets.reduce(
    (sum, market) => sum + market.selectionCount,
    0,
  );

  return (
    <article className="rounded-xl border border-border/80 bg-card/70 px-4 py-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn("text-[0.58rem]", status.className)}>
              {status.label}
            </Badge>
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {match.competition}
            </span>
            <span className="font-mono text-[0.6rem] text-muted-foreground">
              #{match.externalId}
            </span>
            <span className="text-[0.6rem] text-muted-foreground">
              · {match.source}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-medium">
            {match.homeTeam} vs {match.awayTeam}
            {score ? (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                {score}
              </span>
            ) : null}
          </p>
          <p className="text-[0.65rem] text-muted-foreground">
            Kickoff {formatKickoff(match.kickoffAt)} · updated{" "}
            {formatDateTime(match.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {match.markets.length === 0 ? (
            <span className="text-[0.65rem] text-muted-foreground">
              No markets
            </span>
          ) : (
            match.markets.map((market) => (
              <Badge
                key={market.type}
                variant="outline"
                className={cn(
                  "text-[0.58rem]",
                  market.status === "open"
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-border bg-muted text-muted-foreground",
                )}
                title={`${market.selectionCount} active selections`}
              >
                {MARKET_LABELS[market.type]} · {market.selectionCount}
              </Badge>
            ))
          )}
        </div>
      </div>
      {match.markets.length > 0 ? (
        <p className="mt-2 text-[0.62rem] text-muted-foreground">
          {match.markets.length} market{match.markets.length === 1 ? "" : "s"} ·{" "}
          {selectionCount} active selection{selectionCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </article>
  );
}
