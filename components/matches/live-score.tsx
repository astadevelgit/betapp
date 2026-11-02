"use client";

import useSWR from "swr";

import type { MatchLiveSnapshot } from "@/lib/catalog/types";
import { formatKickoffTime } from "@/lib/format";

interface LiveSnapshotResponse {
  ok: boolean;
  match: MatchLiveSnapshot;
}

async function fetcher(url: string): Promise<LiveSnapshotResponse> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load live score.");
  }
  return (await response.json()) as LiveSnapshotResponse;
}

export function LiveScore({
  matchId,
  kickoffAt,
  initial,
}: {
  matchId: string;
  kickoffAt: string;
  initial: MatchLiveSnapshot;
}) {
  const { data } = useSWR<LiveSnapshotResponse>(
    `/api/matches/${matchId}/live`,
    fetcher,
    {
      fallbackData: { ok: true, match: initial },
      refreshInterval: 60_000,
      refreshWhenHidden: false,
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
    },
  );

  const match = data?.match ?? initial;

  if (match.status === "scheduled") {
    return (
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Kickoff
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {formatKickoffTime(kickoffAt)}
        </p>
      </div>
    );
  }

  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-live">
        {match.status === "halftime"
          ? "Half time"
          : match.status === "live"
            ? `Live ${match.minute ?? 0}'`
            : match.status === "finished"
              ? "Full time"
              : statusLabel(match.status)}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {hasScore ? `${match.homeScore} – ${match.awayScore}` : "–"}
      </p>
    </div>
  );
}

function statusLabel(status: MatchLiveSnapshot["status"]): string {
  if (status === "postponed") return "Postponed";
  if (status === "cancelled") return "Cancelled";
  if (status === "suspended") return "Suspended";
  return "Match";
}
