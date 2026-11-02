import type {
  CatalogMarketType,
  CatalogSelectionName,
} from "@/lib/catalog/types";

export type BetType = "single" | "accumulator";
export type BetStatus = "open" | "won" | "lost" | "void";
export type LegResult = "pending" | "won" | "lost" | "void";

/**
 * A selection saved in the client-side bet slip. Team and competition names are
 * snapshots so the slip can render offline; odds are re-checked server-side.
 */
export interface BetSlipLeg {
  matchId: string;
  marketId: string;
  selectionId: string;
  odds: number;
  marketType: CatalogMarketType;
  selectionName: CatalogSelectionName;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: string;
}

export interface PlaceBetInput {
  idempotencyKey: string;
  type: BetType;
  stake: number;
  legs: Array<{
    matchId: string;
    marketId: string;
    selectionId: string;
    expectedOdds: number;
  }>;
}

export type BetChangeReason =
  | "ODDS_CHANGED"
  | "MATCH_STARTED"
  | "MARKET_SUSPENDED"
  | "SELECTION_INACTIVE"
  | "SELECTION_UNAVAILABLE";

export interface BetLegChange {
  selectionId: string;
  marketId: string;
  matchId: string;
  currentOdds: number | null;
  reason: BetChangeReason | string;
  message: string;
}

export type PlaceBetResult =
  | {
      ok: true;
      duplicate: boolean;
      betId: string;
      stake: number;
      totalOdds: number;
      potentialPayout: number;
      balance: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
      changes?: BetLegChange[];
      balance?: number;
      minStake?: number;
      maxStake?: number;
    };

export type AddLegResult = "added" | "removed" | "replaced" | "limit";

export interface BetLegSummary {
  id: string;
  oddsAtPlacement: number;
  result: LegResult;
  marketType: CatalogMarketType;
  line: number | null;
  selectionName: CatalogSelectionName;
  match: {
    id: string;
    kickoffAt: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    competition: string;
    homeTeam: string;
    awayTeam: string;
  };
}

export interface BetSummary {
  id: string;
  type: BetType;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  payout: number;
  status: BetStatus;
  placedAt: string;
  settledAt: string | null;
  legs: BetLegSummary[];
}
