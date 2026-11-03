import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishSyncRun, startSyncRun } from "@/lib/sync-runs";
import { getProvider } from "./index";
import type {
  ProviderFixture,
  ProviderFixtureStatus,
  ProviderOdds,
} from "./types";

type AdminClient = SupabaseClient;

export interface SyncResult {
  job: string;
  recordsProcessed: number;
  metadata: Record<string, unknown>;
}

const ODDS_MARKET_TYPES = ["1X2", "OU25", "BTTS", "DC"] as const;
// Refresh window only. The betting cutoff is odds_stale_seconds and is enforced
// atomically in place_bet, so a missed sync does not immediately stop betting.
const ODDS_REFRESH_SECONDS = 300;
const DEFAULT_MAX_ODDS_FIXTURES = 8;
const FIXTURE_LOOKAHEAD_HOURS = 168;

let footballSportId: string | undefined;

export async function syncFixtures(options?: {
  days?: number;
}): Promise<SyncResult> {
  const provider = getProvider();
  const admin = getSupabaseAdminClient();
  const days = options?.days ?? 7;
  const runId = await startSyncRun(admin, "sync-fixtures");

  try {
    const from = new Date();
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    const fixtures = await provider.getFixtures({
      from: formatDateUtc(from),
      to: formatDateUtc(to),
    });

    await upsertCatalog(admin, fixtures, provider.name);
    await finishSyncRun(admin, runId, "success", fixtures.length, {
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      provider: provider.name,
    });

    return {
      job: "sync-fixtures",
      recordsProcessed: fixtures.length,
      metadata: { days },
    };
  } catch (error) {
    await finishSyncRun(admin, runId, "failed", 0, {}, error);
    throw error;
  }
}

export async function syncLive(): Promise<SyncResult> {
  const provider = getProvider();
  const admin = getSupabaseAdminClient();
  const runId = await startSyncRun(admin, "sync-live");

  try {
    const [live, results] = await Promise.allSettled([
      provider.getLiveFixtures(),
      provider.getResults({ date: formatDateUtc(new Date()) }),
    ]);

    if (live.status === "rejected" && results.status === "rejected") {
      throw live.reason;
    }

    const fixtures = mergeFixtures(
      results.status === "fulfilled" ? results.value : [],
      live.status === "fulfilled" ? live.value : [],
    );

    const catalog = await upsertCatalog(admin, fixtures, provider.name);
    const closedMatchIds = catalog.matches
      .filter((match) => match.status !== "scheduled")
      .map((match) => match.id);

    if (closedMatchIds.length > 0) {
      await closeMarketsForMatches(admin, closedMatchIds);
    }

    await finishSyncRun(admin, runId, "success", fixtures.length, {
      live: live.status === "fulfilled" ? live.value.length : 0,
      results: results.status === "fulfilled" ? results.value.length : 0,
      closedMatches: closedMatchIds.length,
    });

    return {
      job: "sync-live",
      recordsProcessed: fixtures.length,
      metadata: { closedMatches: closedMatchIds.length },
    };
  } catch (error) {
    await finishSyncRun(admin, runId, "failed", 0, {}, error);
    throw error;
  }
}

export async function syncOdds(): Promise<SyncResult> {
  const provider = getProvider();
  const admin = getSupabaseAdminClient();
  const runId = await startSyncRun(admin, "sync-odds");

  try {
    const maxFixtures = readPositiveInt(
      process.env.ODDS_SYNC_MAX_FIXTURES,
      DEFAULT_MAX_ODDS_FIXTURES,
    );
    const now = new Date();
    const horizon = new Date(
      now.getTime() + FIXTURE_LOOKAHEAD_HOURS * 60 * 60 * 1000,
    );

    const { data: matches, error: matchError } = await admin
      .from("matches")
      .select("id, external_id, kickoff_at, markets(type, status, updated_at)")
      .eq("status", "scheduled")
      .eq("source", provider.name)
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", horizon.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(maxFixtures * 5);

    if (matchError) {
      throw new Error(`Could not load matches for odds sync: ${matchError.message}`);
    }

    const freshCutoff = now.getTime() - ODDS_REFRESH_SECONDS * 1000;
    const requiredMarketTypes =
      provider.supportedMarketTypes ?? ODDS_MARKET_TYPES;
    const candidates = (matches ?? [])
      .filter((match) => {
        const markets = Array.isArray(match.markets) ? match.markets : [];
        const hasAllOpenMarkets = requiredMarketTypes.every((type) =>
          markets.some(
            (market) => market.type === type && market.status === "open",
          ),
        );

        return (
          !hasAllOpenMarkets ||
          markets.some((market) => {
            const updatedAt = new Date(market.updated_at).getTime();
            return !Number.isFinite(updatedAt) || updatedAt < freshCutoff;
          })
        );
      })
      .slice(0, maxFixtures);

    if (candidates.length === 0) {
      await finishSyncRun(admin, runId, "success", 0, { candidates: 0 });
      return {
        job: "sync-odds",
        recordsProcessed: 0,
        metadata: { candidates: 0 },
      };
    }

    const payloads: Array<{ matchId: string; odds: ProviderOdds }> = [];
    const failures: Array<{ fixtureId: string; error: string }> = [];

    for (const match of candidates) {
      try {
        const odds = await provider.getOdds(match.external_id);
        if (odds) {
          payloads.push({ matchId: match.id, odds });
        }
      } catch (error) {
        failures.push({
          fixtureId: match.external_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (payloads.length > 0) {
      await upsertOdds(admin, payloads);
    }

    await finishSyncRun(admin, runId, "success", payloads.length, {
      candidates: candidates.length,
      failures: failures.slice(0, 10),
    });

    return {
      job: "sync-odds",
      recordsProcessed: payloads.length,
      metadata: { candidates: candidates.length, failures: failures.length },
    };
  } catch (error) {
    await finishSyncRun(admin, runId, "failed", 0, {}, error);
    throw error;
  }
}

interface CatalogMatch {
  id: string;
  externalId: string;
  status: ProviderFixtureStatus;
}

interface CatalogResult {
  matches: CatalogMatch[];
}

async function upsertCatalog(
  admin: AdminClient,
  fixtures: ProviderFixture[],
  source: string,
): Promise<CatalogResult> {
  if (fixtures.length === 0) {
    return { matches: [] };
  }

  const sportId = await getFootballSportId(admin);
  const competitions = dedupeBy(
    fixtures.map((fixture) => fixture.competition),
    (competition) => competition.externalId,
  );
  const teams = dedupeBy(
    fixtures.flatMap((fixture) => [fixture.homeTeam, fixture.awayTeam]),
    (team) => team.externalId,
  );

  const competitionRows = competitions.map((competition) => ({
    sport_id: sportId,
    external_id: competition.externalId,
    source,
    name: competition.name,
    country: competition.country,
    logo_url: competition.logoUrl,
    season: competition.season,
    active: true,
  }));

  const { data: competitionData, error: competitionError } = await admin
    .from("competitions")
    .upsert(competitionRows, { onConflict: "external_id" })
    .select("id, external_id");

  if (competitionError) {
    throw new Error(`Could not upsert competitions: ${competitionError.message}`);
  }

  const competitionIds = new Map(
    (competitionData ?? []).map((row) => [row.external_id, row.id]),
  );

  const { data: existingTeamData, error: existingTeamError } = await admin
    .from("teams")
    .select("external_id, logo_url")
    .in(
      "external_id",
      teams.map((team) => team.externalId),
    );

  if (existingTeamError) {
    throw new Error(`Could not read existing team logos: ${existingTeamError.message}`);
  }

  const existingTeamLogos = new Map(
    (existingTeamData ?? []).map((row) => [row.external_id, row.logo_url]),
  );

  const teamRows = teams.map((team) => ({
    external_id: team.externalId,
    source,
    name: team.name,
    logo_url: team.logoUrl ?? existingTeamLogos.get(team.externalId) ?? null,
  }));

  const { data: teamData, error: teamError } = await admin
    .from("teams")
    .upsert(teamRows, { onConflict: "external_id" })
    .select("id, external_id");

  if (teamError) {
    throw new Error(`Could not upsert teams: ${teamError.message}`);
  }

  const teamIds = new Map((teamData ?? []).map((row) => [row.external_id, row.id]));
  const now = new Date().toISOString();

  const matchRows = fixtures.map((fixture) => {
    const competitionId = competitionIds.get(fixture.competition.externalId);
    const homeTeamId = teamIds.get(fixture.homeTeam.externalId);
    const awayTeamId = teamIds.get(fixture.awayTeam.externalId);

    if (!competitionId || !homeTeamId || !awayTeamId) {
      throw new Error(`Missing catalog mapping for fixture ${fixture.externalId}.`);
    }

    return {
      external_id: fixture.externalId,
      source,
      sport_id: sportId,
      competition_id: competitionId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: fixture.kickoffAt,
      status: fixture.status,
      home_score: fixture.homeScore,
      away_score: fixture.awayScore,
      minute: fixture.minute,
      round: fixture.round,
      venue: fixture.venue,
      metadata: { providerStatus: fixture.rawStatus },
      last_synced_at: now,
    };
  });

  const { data: matchData, error: matchError } = await admin
    .from("matches")
    .upsert(dedupeBy(matchRows, (row) => row.external_id), {
      onConflict: "external_id",
    })
    .select("id, external_id, status");

  if (matchError) {
    throw new Error(`Could not upsert matches: ${matchError.message}`);
  }

  return {
    matches: (matchData ?? []).map((row) => ({
      id: row.id,
      externalId: row.external_id,
      status: row.status as ProviderFixtureStatus,
    })),
  };
}

async function upsertOdds(
  admin: AdminClient,
  payloads: Array<{ matchId: string; odds: ProviderOdds }>,
): Promise<void> {
  const now = new Date().toISOString();
  const marketRows: Array<{
    match_id: string;
    type: string;
    status: string;
    line: number | null;
    provider_market_id: string;
    metadata: Record<string, unknown>;
    updated_at: string;
  }> = [];

  for (const { matchId, odds } of payloads) {
    for (const market of odds.markets) {
      marketRows.push({
        match_id: matchId,
        type: market.type,
        status: "open",
        line: market.line,
        provider_market_id: market.providerMarketId,
        metadata: {
          bookmaker: odds.bookmaker,
          providerUpdatedAt: odds.updatedAt,
        },
        updated_at: now,
      });
    }
  }

  const { data: marketData, error: marketError } = await admin
    .from("markets")
    .upsert(dedupeBy(marketRows, (row) => `${row.match_id}:${row.type}`), {
      onConflict: "match_id,type",
    })
    .select("id, match_id, type");

  if (marketError) {
    throw new Error(`Could not upsert markets: ${marketError.message}`);
  }

  const marketIds = new Map(
    (marketData ?? []).map((row) => [`${row.match_id}:${row.type}`, row.id]),
  );

  const selectionRows: Array<{
    market_id: string;
    name: string;
    odds: number;
    active: boolean;
    provider_selection_id: string;
    metadata: Record<string, unknown>;
    updated_at: string;
  }> = [];

  const marketKeys = new Set<string>();
  const payloadMarketsByMatch = new Map<string, Set<string>>();

  for (const { matchId, odds } of payloads) {
    const types = new Set<string>();

    for (const market of odds.markets) {
      const marketId = marketIds.get(`${matchId}:${market.type}`);
      if (!marketId) {
        continue;
      }

      types.add(market.type);
      marketKeys.add(`${matchId}:${market.type}`);

      for (const selection of market.selections) {
        selectionRows.push({
          market_id: marketId,
          name: selection.name,
          odds: selection.odds,
          active: true,
          provider_selection_id: `${market.providerMarketId}:${selection.name}`,
          metadata: { providerValue: selection.providerValue },
          updated_at: now,
        });
      }
    }

    payloadMarketsByMatch.set(matchId, types);
  }

  if (selectionRows.length > 0) {
    const ids = [...marketKeys]
      .map((key) => marketIds.get(key))
      .filter((id): id is string => Boolean(id));

    const { error: deactivateError } = await admin
      .from("selections")
      .update({ active: false, updated_at: now })
      .in("market_id", ids);

    if (deactivateError) {
      throw new Error(
        `Could not deactivate old selections: ${deactivateError.message}`,
      );
    }

    const { error: selectionError } = await admin
      .from("selections")
      .upsert(dedupeBy(selectionRows, (row) => `${row.market_id}:${row.name}`), {
        onConflict: "market_id,name",
      });

    if (selectionError) {
      throw new Error(`Could not upsert selections: ${selectionError.message}`);
    }
  }

  const matchIds = [...payloadMarketsByMatch.keys()];
  if (matchIds.length === 0) {
    return;
  }

  const { data: existingMarkets, error: existingError } = await admin
    .from("markets")
    .select("id, match_id, type")
    .in("match_id", matchIds);

  if (existingError) {
    throw new Error(
      `Could not load existing markets: ${existingError.message}`,
    );
  }

  const missingMarketIds = (existingMarkets ?? [])
    .filter((market) => {
      const types = payloadMarketsByMatch.get(market.match_id);
      return types ? !types.has(market.type) : false;
    })
    .map((market) => market.id);

  if (missingMarketIds.length > 0) {
    const { error: suspendError } = await admin
      .from("markets")
      .update({ status: "suspended", updated_at: now })
      .in("id", missingMarketIds);

    if (suspendError) {
      throw new Error(`Could not suspend missing markets: ${suspendError.message}`);
    }

    const { error: deactivateError } = await admin
      .from("selections")
      .update({ active: false, updated_at: now })
      .in("market_id", missingMarketIds);

    if (deactivateError) {
      throw new Error(
        `Could not deactivate missing selections: ${deactivateError.message}`,
      );
    }
  }
}

async function closeMarketsForMatches(
  admin: AdminClient,
  matchIds: string[],
): Promise<void> {
  const now = new Date().toISOString();

  const { data: markets, error } = await admin
    .from("markets")
    .update({ status: "suspended", updated_at: now })
    .in("match_id", matchIds)
    .eq("status", "open")
    .select("id");

  if (error) {
    throw new Error(`Could not suspend markets: ${error.message}`);
  }

  const marketIds = (markets ?? []).map((market) => market.id);
  if (marketIds.length === 0) {
    return;
  }

  const { error: selectionError } = await admin
    .from("selections")
    .update({ active: false, updated_at: now })
    .in("market_id", marketIds)
    .eq("active", true);

  if (selectionError) {
    throw new Error(
      `Could not deactivate selections: ${selectionError.message}`,
    );
  }
}

async function getFootballSportId(admin: AdminClient): Promise<string> {
  if (footballSportId) {
    return footballSportId;
  }

  const { data, error } = await admin
    .from("sports")
    .select("id")
    .eq("slug", "football")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load football sport: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "Football sport is missing. Apply supabase/migrations/20261102000001_catalog.sql.",
    );
  }

  footballSportId = data.id;
  return data.id;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mergeFixtures(
  base: ProviderFixture[],
  overrides: ProviderFixture[],
): ProviderFixture[] {
  const merged = new Map<string, ProviderFixture>();
  for (const fixture of base) {
    merged.set(fixture.externalId, fixture);
  }
  for (const fixture of overrides) {
    merged.set(fixture.externalId, fixture);
  }
  return [...merged.values()];
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return [...map.values()];
}
