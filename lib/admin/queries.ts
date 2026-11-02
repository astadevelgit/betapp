import "server-only";

import type {
  CatalogMarketType,
  CatalogSelectionName,
} from "@/lib/catalog/types";
import type {
  BetStatus,
  BetType,
  LegResult,
} from "@/lib/bets/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateBetLegs, type BetEvaluation } from "@/lib/settlement/markets";

export type AdminBetFilter = "open" | "settled" | "all";

export interface AdminBetLeg {
  id: string;
  result: LegResult;
  oddsAtPlacement: number;
  marketType: CatalogMarketType;
  line: number | null;
  selectionName: CatalogSelectionName;
  match: {
    id: string;
    status: string;
    kickoffAt: string;
    homeScore: number | null;
    awayScore: number | null;
    competition: string;
    homeTeam: string;
    awayTeam: string;
  };
}

export interface AdminBetRow {
  id: string;
  type: BetType;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  payout: number;
  status: BetStatus;
  placedAt: string;
  settledAt: string | null;
  settlementReason: string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  legs: AdminBetLeg[];
  evaluation: BetEvaluation;
}

export interface AdminAuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
  admin: {
    email: string;
    displayName: string;
  } | null;
}

const ADMIN_BET_SELECT = `
  id,
  type,
  stake,
  total_odds,
  potential_payout,
  payout,
  status,
  placed_at,
  settled_at,
  settlement_reason,
  user:profiles!bets_user_id_fkey (id, email, display_name),
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

interface AdminBetDbRow {
  id: string;
  type: BetType;
  stake: number | string;
  total_odds: number | string;
  potential_payout: number | string;
  payout: number | string;
  status: BetStatus;
  placed_at: string;
  settled_at: string | null;
  settlement_reason: string | null;
  user: { id: string; email: string; display_name: string } | null;
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

export async function getAdminBets(
  filter: AdminBetFilter,
  limit = 100,
): Promise<AdminBetRow[]> {
  const admin = getSupabaseAdminClient();
  let query = admin
    .from("bets")
    .select(ADMIN_BET_SELECT)
    .order("placed_at", { ascending: false })
    .limit(limit);

  if (filter === "open") {
    query = query.eq("status", "open");
  } else if (filter === "settled") {
    query = query.neq("status", "open");
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin] Could not load bets", error.message);
    return [];
  }

  return (data as unknown as AdminBetDbRow[]).map(mapAdminBet);
}

export async function getAdminBet(
  betId: string,
): Promise<AdminBetRow | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("bets")
    .select(ADMIN_BET_SELECT)
    .eq("id", betId)
    .maybeSingle();

  if (error) {
    console.error("[admin] Could not load bet", error.message);
    return null;
  }

  return data ? mapAdminBet(data as unknown as AdminBetDbRow) : null;
}

function mapAdminBet(row: AdminBetDbRow): AdminBetRow {
  const legs: AdminBetLeg[] = (row.legs ?? []).map((leg) => ({
    id: leg.id,
    result: leg.result,
    oddsAtPlacement: Number(leg.odds_at_placement),
    marketType: leg.market?.type ?? "1X2",
    line: leg.market?.line == null ? null : Number(leg.market.line),
    selectionName: leg.selection?.name ?? "home",
    match: {
      id: leg.match?.id ?? "",
      status: leg.match?.status ?? "unknown",
      kickoffAt: leg.match?.kickoff_at ?? new Date().toISOString(),
      homeScore: leg.match?.home_score ?? null,
      awayScore: leg.match?.away_score ?? null,
      competition: leg.match?.competition?.name ?? "Football",
      homeTeam: leg.match?.home_team?.name ?? "Home",
      awayTeam: leg.match?.away_team?.name ?? "Away",
    },
  }));

  const evaluation = (row.legs ?? []).some(
    (leg) => !leg.market || !leg.selection || !leg.match,
  )
    ? {
        ready: false as const,
        reason:
          "A leg is missing its market, selection, or match, so the provider result cannot be applied.",
      }
    : evaluateBetLegs(
        legs.map((leg) => ({
          id: leg.id,
          label: `${leg.match.homeTeam} vs ${leg.match.awayTeam}`,
          marketType: leg.marketType,
          line: leg.line,
          selectionName: leg.selectionName,
          matchStatus: leg.match.status,
          homeScore: leg.match.homeScore,
          awayScore: leg.match.awayScore,
        })),
      );

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
    settlementReason: row.settlement_reason,
    user: {
      id: row.user?.id ?? "",
      email: row.user?.email ?? "Unknown player",
      displayName: row.user?.display_name ?? "Unknown player",
    },
    legs,
    evaluation,
  };
}

interface AdminAuditDbRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
  admin: { email: string; display_name: string } | null;
}

export async function getAdminAuditLogs(
  limit = 100,
): Promise<AdminAuditRow[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_audit_logs")
    .select(
      "id, action, entity, entity_id, before, after, reason, created_at, admin:profiles!admin_audit_logs_admin_id_fkey (email, display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin] Could not load audit logs", error.message);
    return [];
  }

  return (data as unknown as AdminAuditDbRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    reason: row.reason,
    createdAt: row.created_at,
    admin: row.admin
      ? {
          email: row.admin.email,
          displayName: row.admin.display_name,
        }
      : null,
  }));
}
