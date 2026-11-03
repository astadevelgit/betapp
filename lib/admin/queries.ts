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

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type AdminUserFilter = "all" | "active" | "suspended" | "deleted";

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  status: "active" | "suspended" | "deleted";
  balance: number;
  createdAt: string;
}

interface AdminUserDbRow {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "suspended" | "deleted";
  created_at: string;
  wallets:
    | { balance: number | string }
    | Array<{ balance: number | string }>
    | null;
}

function readEmbeddedBalance(
  wallets: AdminUserDbRow["wallets"],
): number {
  const row = Array.isArray(wallets) ? wallets[0] : wallets;
  return Number(row?.balance ?? 0);
}

function cleanSearch(value: string | undefined): string {
  return (value ?? "").replace(/[,%()*]/g, " ").trim().slice(0, 80);
}

export async function getAdminUsers(options: {
  search?: string;
  status: AdminUserFilter;
  limit?: number;
}): Promise<AdminUserRow[]> {
  const admin = getSupabaseAdminClient();
  let query = admin
    .from("profiles")
    .select(
      "id, email, display_name, role, status, created_at, wallets!wallets_user_id_fkey (balance)",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const search = cleanSearch(options.search);

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,display_name.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin] Could not load users", error.message);
    return [];
  }

  return (data as unknown as AdminUserDbRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    balance: readEmbeddedBalance(row.wallets),
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type WalletTxType =
  | "signup_bonus"
  | "daily_claim"
  | "bet_stake"
  | "bet_payout"
  | "bet_refund"
  | "admin_adjustment"
  | "correction";

export type AdminTransactionFilter = "all" | WalletTxType;

export interface AdminTransactionRow {
  id: string;
  type: WalletTxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

interface AdminTransactionDbRow {
  id: string;
  type: WalletTxType;
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  reference: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user: { id: string; email: string; display_name: string } | null;
}

function dateBound(
  value: string | undefined,
  endOfDay = false,
): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  // Admin date filters follow the Nigeria (Africa/Lagos, UTC+1) day.
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+01:00`;
}

export async function getAdminTransactions(options: {
  type: AdminTransactionFilter;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AdminTransactionRow[]> {
  const admin = getSupabaseAdminClient();
  let query = admin
    .from("wallet_transactions")
    .select(
      "id, type, amount, balance_before, balance_after, reference, metadata, created_at, user:profiles!wallet_transactions_user_id_fkey (id, email, display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (options.type !== "all") {
    query = query.eq("type", options.type);
  }

  const search = cleanSearch(options.search);

  if (search) {
    const { data: matches, error: matchError } = await admin
      .from("profiles")
      .select("id")
      .or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
      .limit(100);

    if (matchError) {
      console.error("[admin] Could not search ledger users", matchError.message);
      return [];
    }

    if (!matches || matches.length === 0) {
      return [];
    }

    query = query.in(
      "user_id",
      matches.map((profile) => profile.id),
    );
  }

  const from = dateBound(options.from);
  const to = dateBound(options.to, true);

  if (from) {
    query = query.gte("created_at", from);
  }

  if (to) {
    query = query.lte("created_at", to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin] Could not load transactions", error.message);
    return [];
  }

  return (data as unknown as AdminTransactionDbRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    reference: row.reference,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    user: {
      id: row.user?.id ?? "",
      email: row.user?.email ?? "Unknown player",
      displayName: row.user?.display_name ?? "Unknown player",
    },
  }));
}

// ---------------------------------------------------------------------------
// Matches and sync status
// ---------------------------------------------------------------------------

export type AdminMatchFilter = "all" | "upcoming" | "live" | "finished";

export interface AdminMatchRow {
  id: string;
  externalId: string;
  source: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  updatedAt: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  markets: Array<{
    type: CatalogMarketType;
    status: string;
    selectionCount: number;
  }>;
}

interface AdminMatchDbRow {
  id: string;
  external_id: string;
  source: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  updated_at: string;
  competition: { name: string } | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  markets: Array<{
    type: CatalogMarketType;
    status: string;
    selections: Array<{ id: string; active: boolean }> | null;
  }> | null;
}

export async function getAdminMatches(options: {
  filter: AdminMatchFilter;
  limit?: number;
}): Promise<AdminMatchRow[]> {
  const admin = getSupabaseAdminClient();
  let query = admin
    .from("matches")
    .select(
      "id, external_id, source, kickoff_at, status, home_score, away_score, updated_at, competition:competitions!matches_competition_id_fkey (name), home_team:teams!matches_home_team_id_fkey (name), away_team:teams!matches_away_team_id_fkey (name), markets (id, type, status, selections (id, active))",
    )
    .order("kickoff_at", { ascending: options.filter === "upcoming" })
    .limit(options.limit ?? 100);

  if (options.filter === "upcoming") {
    query = query.eq("status", "scheduled");
  } else if (options.filter === "live") {
    query = query.in("status", ["live", "halftime"]);
  } else if (options.filter === "finished") {
    query = query.in("status", [
      "finished",
      "postponed",
      "cancelled",
      "suspended",
    ]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[admin] Could not load matches", error.message);
    return [];
  }

  return (data as unknown as AdminMatchDbRow[]).map((row) => ({
    id: row.id,
    externalId: row.external_id,
    source: row.source,
    kickoffAt: row.kickoff_at,
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    updatedAt: row.updated_at,
    competition: row.competition?.name ?? "Football",
    homeTeam: row.home_team?.name ?? "Home",
    awayTeam: row.away_team?.name ?? "Away",
    markets: (row.markets ?? []).map((market) => ({
      type: market.type,
      status: market.status,
      selectionCount: (market.selections ?? []).filter(
        (selection) => selection.active,
      ).length,
    })),
  }));
}

export interface SyncJobStatus {
  job: string;
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  recordsProcessed: number;
  error: string | null;
  metadata: Record<string, unknown>;
}

interface SyncJobDbRow {
  job: string;
  status: SyncJobStatus["status"];
  started_at: string;
  finished_at: string | null;
  records_processed: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

const SYNC_JOB_ORDER = [
  "sync-fixtures",
  "sync-live",
  "sync-odds",
  "settle",
  "cleanup",
];

export async function getSyncJobStatus(): Promise<SyncJobStatus[]> {
  const admin = getSupabaseAdminClient();

  const rows = await Promise.all(
    SYNC_JOB_ORDER.map(async (job) => {
      const { data, error } = await admin
        .from("sync_runs")
        .select(
          "job, status, started_at, finished_at, records_processed, error, metadata",
        )
        .eq("job", job)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(`[admin] Could not load ${job} sync run`, error.message);
        return null;
      }

      return data as unknown as SyncJobDbRow | null;
    }),
  );

  return rows
    .filter((row): row is SyncJobDbRow => Boolean(row))
    .map((row) => ({
      job: row.job,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      recordsProcessed: Number(row.records_processed ?? 0),
      error: row.error,
      metadata: row.metadata ?? {},
    }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

export async function getAppSettings(): Promise<AppSettingRow[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("key, value, description, updated_at")
    .order("key", { ascending: true });

  if (error) {
    console.error("[admin] Could not load settings", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}
