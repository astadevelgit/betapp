import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/config";
import type {
  CatalogMarket,
  CatalogMarketStatus,
  CatalogMarketType,
  CatalogMatch,
  CatalogMatchStatus,
  CatalogSelection,
  CatalogSelectionName,
  MatchLiveSnapshot,
} from "./types";

const MATCH_SELECT = `
  id,
  external_id,
  kickoff_at,
  status,
  home_score,
  away_score,
  minute,
  source,
  competition:competitions!matches_competition_id_fkey(name, country, logo_url),
  home_team:teams!matches_home_team_id_fkey(name, logo_url),
  away_team:teams!matches_away_team_id_fkey(name, logo_url),
  markets(id, type, status, line, updated_at, selections(id, name, odds, active))
`;

const MARKET_ORDER: Record<CatalogMarketType, number> = {
  "1X2": 0,
  OU25: 1,
  BTTS: 2,
  DC: 3,
};

const SELECTION_ORDER: Record<CatalogSelectionName, number> = {
  home: 0,
  draw: 1,
  away: 2,
  over: 0,
  under: 1,
  yes: 0,
  no: 1,
  "1X": 0,
  X2: 1,
  "12": 2,
};

interface MatchRow {
  id: string;
  external_id: string;
  kickoff_at: string;
  status: CatalogMatchStatus;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  source: string;
  competition: {
    name: string;
    country: string | null;
    logo_url: string | null;
  } | null;
  home_team: { name: string; logo_url: string | null } | null;
  away_team: { name: string; logo_url: string | null } | null;
  markets: Array<{
    id: string;
    type: CatalogMarketType;
    status: CatalogMarketStatus;
    line: number | string | null;
    updated_at: string;
    selections: Array<{
      id: string;
      name: CatalogSelectionName;
      odds: number | string;
      active: boolean;
    }> | null;
  }> | null;
}

let publicClient: SupabaseClient | undefined;

function getPublicClient(): SupabaseClient {
  if (publicClient) {
    return publicClient;
  }

  const { url, anonKey } = getSupabaseConfig();
  publicClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publicClient;
}

export async function getLiveMatches(): Promise<CatalogMatch[]> {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("status", ["live", "halftime"])
    .order("kickoff_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("[catalog] Could not load live matches", error.message);
    return [];
  }

  return (data as unknown as MatchRow[]).map(mapMatch);
}

export async function getUpcomingMatches(limit = 24): Promise<CatalogMatch[]> {
  const supabase = getPublicClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("status", "scheduled")
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", horizon.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[catalog] Could not load upcoming matches", error.message);
    return [];
  }

  return (data as unknown as MatchRow[]).map(mapMatch);
}

export async function getFeaturedMatch(): Promise<CatalogMatch | null> {
  const [upcoming, live] = await Promise.all([
    getUpcomingMatches(1),
    getLiveMatches(),
  ]);

  return upcoming[0] ?? live[0] ?? null;
}

export async function getMatchById(id: string): Promise<CatalogMatch | null> {
  if (!isUuid(id)) {
    return null;
  }

  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[catalog] Could not load match", error.message);
    return null;
  }

  return data ? mapMatch(data as unknown as MatchRow) : null;
}

export async function getMatchLiveSnapshot(
  id: string,
): Promise<MatchLiveSnapshot | null> {
  if (!isUuid(id)) {
    return null;
  }

  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("matches")
    .select("id, status, home_score, away_score, minute, last_synced_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[catalog] Could not load live snapshot", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    status: data.status as CatalogMatchStatus,
    homeScore: data.home_score,
    awayScore: data.away_score,
    minute: data.minute,
    lastSyncedAt: data.last_synced_at,
  };
}

export function isOddsStale(
  updatedAt: string,
  staleSeconds = 300,
): boolean {
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > staleSeconds * 1000;
}

function mapMatch(row: MatchRow): CatalogMatch {
  return {
    id: row.id,
    externalId: row.external_id,
    kickoffAt: row.kickoff_at,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    minute: row.minute,
    source: row.source,
    isDemo: row.source === "demo",
    competition: {
      name: row.competition?.name ?? "Football",
      country: row.competition?.country ?? null,
      logoUrl: row.competition?.logo_url ?? null,
    },
    homeTeam: {
      name: row.home_team?.name ?? "Home",
      logoUrl: row.home_team?.logo_url ?? null,
    },
    awayTeam: {
      name: row.away_team?.name ?? "Away",
      logoUrl: row.away_team?.logo_url ?? null,
    },
    markets: (row.markets ?? [])
      .map(mapMarket)
      .sort((a, b) => MARKET_ORDER[a.type] - MARKET_ORDER[b.type]),
  };
}

function mapMarket(row: NonNullable<MatchRow["markets"]>[number]): CatalogMarket {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    line: row.line === null ? null : Number(row.line),
    updatedAt: row.updated_at,
    selections: (row.selections ?? [])
      .map(mapSelection)
      .sort((a, b) => SELECTION_ORDER[a.name] - SELECTION_ORDER[b.name]),
  };
}

function mapSelection(
  row: NonNullable<NonNullable<MatchRow["markets"]>[number]["selections"]>[number],
): CatalogSelection {
  return {
    id: row.id,
    name: row.name,
    odds: Number(row.odds),
    active: row.active,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
