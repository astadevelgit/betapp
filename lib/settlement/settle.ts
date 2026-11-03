import "server-only";

import * as Sentry from "@sentry/nextjs";

import { captureServerEvent } from "@/lib/analytics/server";
import type {
  CatalogMarketType,
  CatalogSelectionName,
} from "@/lib/catalog/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishSyncRun, startSyncRun } from "@/lib/sync-runs";
import { evaluateBetLegs, type EvaluableLeg } from "./markets";

const SETTLE_PAGE_SIZE = 200;
const MAX_OPEN_BETS_SCAN = 1000;

const SETTLE_BET_SELECT = `
  id,
  user_id,
  legs:bet_legs (
    id,
    market:markets!bet_legs_market_id_fkey (type, line),
    selection:selections!bet_legs_selection_id_fkey (name),
    match:matches!bet_legs_match_id_fkey (
      id,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey (name),
      away_team:teams!matches_away_team_id_fkey (name)
    )
  )
`;

interface SettleBetRow {
  id: string;
  user_id: string;
  legs: Array<{
    id: string;
    market: { type: CatalogMarketType; line: number | string | null } | null;
    selection: { name: CatalogSelectionName } | null;
    match: {
      id: string;
      status: string;
      home_score: number | null;
      away_score: number | null;
      home_team: { name: string } | null;
      away_team: { name: string } | null;
    } | null;
  }> | null;
}

interface SettlementResponse {
  ok?: boolean;
  duplicate?: boolean;
  code?: string;
  message?: string;
  bet?: {
    id?: string;
    status?: string;
    payout?: number | string;
  };
}

export interface SettlementResult {
  job: "settle";
  recordsProcessed: number;
  metadata: Record<string, unknown>;
}

function toEvaluableLeg(
  row: NonNullable<SettleBetRow["legs"]>[number],
): EvaluableLeg | null {
  if (!row.market || !row.selection || !row.match) {
    return null;
  }

  const home = row.match.home_team?.name;
  const away = row.match.away_team?.name;

  return {
    id: row.id,
    label: home && away ? `${home} vs ${away}` : "A match",
    marketType: row.market.type,
    line: row.market.line === null ? null : Number(row.market.line),
    selectionName: row.selection.name,
    matchStatus: row.match.status,
    homeScore: row.match.home_score,
    awayScore: row.match.away_score,
  };
}

function readSettlementResponse(data: unknown): SettlementResponse {
  return data && typeof data === "object"
    ? (data as SettlementResponse)
    : { ok: false, message: "The settlement response was empty." };
}

/**
 * Settle every open bet whose legs are all final. Each RPC is independently
 * idempotent, so overlapping cron invocations cannot credit a payout twice.
 * A single bad bet is reported and skipped without blocking the rest.
 */
export async function settleFinishedBets(
  pageSize = SETTLE_PAGE_SIZE,
): Promise<SettlementResult> {
  const admin = getSupabaseAdminClient();
  const runId = await startSyncRun(admin, "settle");

  let settled = 0;
  let skipped = 0;
  let failed = 0;
  let won = 0;
  let lost = 0;
  let voided = 0;
  const failures: Array<{ betId: string; message: string }> = [];

  try {
    // Load every open bet before applying any settlement. Paging while rows
    // disappear from the open set would otherwise skip candidates, and a
    // single non-final bet must not starve the queue behind it.
    const bets: SettleBetRow[] = [];
    let from = 0;

    while (bets.length < MAX_OPEN_BETS_SCAN) {
      const { data, error } = await admin
        .from("bets")
        .select(SETTLE_BET_SELECT)
        .eq("status", "open")
        .order("placed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Could not load open bets: ${error.message}`);
      }

      const page = (data ?? []) as unknown as SettleBetRow[];
      bets.push(...page);

      if (page.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    for (const bet of bets) {
      const legs = bet.legs ?? [];

      if (legs.length === 0) {
        failed += 1;
        failures.push({
          betId: bet.id,
          message: "The bet has no legs.",
        });
        continue;
      }

      const evaluable: EvaluableLeg[] = [];
      let missingLeg = false;

      for (const leg of legs) {
        const mapped = toEvaluableLeg(leg);
        if (!mapped) {
          missingLeg = true;
          break;
        }
        evaluable.push(mapped);
      }

      if (missingLeg) {
        failed += 1;
        failures.push({
          betId: bet.id,
          message: "A leg is missing its market, selection, or match.",
        });
        continue;
      }

      const evaluation = evaluateBetLegs(evaluable);

      if (!evaluation.ready) {
        skipped += 1;
        continue;
      }

      try {
        const { data: responseData, error: settleError } = await admin.rpc(
          "apply_bet_settlement",
          {
            p_bet_id: bet.id,
            p_leg_results: evaluation.results,
            p_settled_by: null,
            p_reason: "Auto-settlement: all legs final.",
          },
        );

        if (settleError) {
          failed += 1;
          failures.push({
            betId: bet.id,
            message: settleError.message,
          });
          continue;
        }

        const response = readSettlementResponse(responseData);

        if (!response.ok) {
          failed += 1;
          failures.push({
            betId: bet.id,
            message: response.message ?? response.code ?? "Settlement failed.",
          });
          continue;
        }

        if (response.duplicate) {
          skipped += 1;
          continue;
        }

        settled += 1;

        if (response.bet?.status === "won") won += 1;
        else if (response.bet?.status === "lost") lost += 1;
        else if (response.bet?.status === "void") voided += 1;

        void captureServerEvent(bet.user_id, "bet_settled", {
          betId: bet.id,
          status: response.bet?.status ?? "unknown",
          payout: Number(response.bet?.payout ?? 0),
        });
      } catch (error) {
        failed += 1;
        failures.push({
          betId: bet.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const metadata = {
      candidates: bets.length,
      scanTruncated: bets.length >= MAX_OPEN_BETS_SCAN,
      settled,
      skipped,
      failed,
      won,
      lost,
      voided,
      failures: failures.slice(0, 10),
    };

    if (failed > 0) {
      Sentry.captureMessage("Settlement completed with failed bets", {
        level: "warning",
        tags: { flow: "settle" },
        extra: { failed, failures: failures.slice(0, 10) },
      });
    }

    await finishSyncRun(admin, runId, "success", settled, metadata);

    return {
      job: "settle",
      recordsProcessed: settled,
      metadata,
    };
  } catch (error) {
    await finishSyncRun(admin, runId, "failed", settled, {
      settled,
      skipped,
      failed,
      failures: failures.slice(0, 10),
    }, error);
    throw error;
  }
}
