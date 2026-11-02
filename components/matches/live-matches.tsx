"use client";

import useSWR from "swr";
import { Radio } from "lucide-react";

import { MatchCard } from "./match-card";
import type { CatalogMatch } from "@/lib/catalog/types";

interface LiveResponse {
  matches: CatalogMatch[];
  updatedAt: string;
}

async function fetcher(url: string): Promise<LiveResponse> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load live matches.");
  }
  return (await response.json()) as LiveResponse;
}

export function LiveMatches({
  initialMatches,
}: {
  initialMatches: CatalogMatch[];
}) {
  const { data, error } = useSWR<LiveResponse>("/api/live", fetcher, {
    fallbackData: {
      matches: initialMatches,
      updatedAt: new Date().toISOString(),
    },
    refreshInterval: 60_000,
    refreshWhenHidden: false,
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });

  const matches = data?.matches ?? initialMatches;

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-xl border border-live/20 bg-live/10 text-live">
          <Radio className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium">No matches are live right now.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Live scores appear here and refresh every 60 seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {error
          ? "Live updates are delayed. Showing the last known scores."
          : "Scores refresh every 60 seconds."}
      </p>
    </div>
  );
}
