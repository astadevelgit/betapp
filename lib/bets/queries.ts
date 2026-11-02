import "server-only";

import type {
  CatalogMarketType,
  CatalogSelectionName,
} from "@/lib/catalog/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type {
  BetLegSummary,
  BetStatus,
  BetSummary,
  BetType,
  LegResult,
} from "./types";

const MARKET_ORDER: Record<CatalogMarketType, number> = {
  "1X2": 0,
  OU25: 1,
  BTTS: 2,
  DC: 3,
};

const BET_SELECT = `
  id,
  type,
  stake,
  total_odds,
  potential_payout,
  payout,
  status,
  placed_at,
  settled_at,
  legs:bet_legs (
    id,
    odds_at_placement,
    result,
    market:markets!bet_legs_market_id_fkey (type, line),
    selection:selections!bet_legs_selection_id_fkey (name),
    match:matches!bet_legs_match_id_fkey (
      id,
      kickoff_at,
      status,
      home_score,
      away_score,
      competition:competitions!matches_competition_id_fkey (name),
      home_team:teams!matches_home_team_id_fkey (name),
      away_team:teams!matches_away_team_id_fkey (name)
    )
  )
`;

interface BetRow {
  id: string;
  type: BetType;
  stake: number | string;
  total_odds: number | string;
  potential_payout: number | string;
  payout: number | string;
  status: BetStatus;
  placed_at: string;
  settled_at: string | null;
  legs: Array<{
    id: string;
    odds_at_placement: number | string;
    result: LegResult;
    market: { type: CatalogMarketType; line: number | string | null } | null;
    selection: { name: CatalogSelectionName } | null;
    match: {
      id: string;
      kickoff_at: string;
      status: string;
      home_score: number | null;
      away_score: number | null;
      competition: { name: string } | null;
      home_team: { name: string } | null;
      away_team: { name: string } | null;
    } | null;
  }> | null;
}

export async function getMyBets(
  userId: string,
  limit = 50,
): Promise<BetSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bets")
    .select(BET_SELECT)
    .eq("user_id", userId)
    .order("placed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[bets] Could not load bets", error.message);
    return [];
  }

  return (data as unknown as BetRow[]).map(mapBet);
}

function mapBet(row: BetRow): BetSummary {
  return {
    id: row.id,
    type: row.type,
    stake: Number(row.stake),
    totalOdds: Number(row.total_odds),
    potentialPayout: Number(row.potential_payout),
    payout: Number(row.payout),
    status: row.status,
    placedAt: row.placed_at,
    settledAt: row.settled_at,
    legs: (row.legs ?? [])
      .map(mapLeg)
      .sort((a, b) => MARKET_ORDER[a.marketType] - MARKET_ORDER[b.marketType]),
  };
}

function mapLeg(row: NonNullable<BetRow["legs"]>[number]): BetLegSummary {
  return {
    id: row.id,
    oddsAtPlacement: Number(row.odds_at_placement),
    result: row.result,
    marketType: row.market?.type ?? "1X2",
    line: row.market?.line == null ? null : Number(row.market.line),
    selectionName: row.selection?.name ?? "home",
    match: {
      id: row.match?.id ?? "",
      kickoffAt: row.match?.kickoff_at ?? new Date().toISOString(),
      status: row.match?.status ?? "unknown",
      homeScore: row.match?.home_score ?? null,
      awayScore: row.match?.away_score ?? null,
      competition: row.match?.competition?.name ?? "Football",
      homeTeam: row.match?.home_team?.name ?? "Home",
      awayTeam: row.match?.away_team?.name ?? "Away",
    },
  };
}
