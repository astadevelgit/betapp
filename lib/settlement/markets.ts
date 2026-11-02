import type { CatalogMarketType, CatalogSelectionName } from "@/lib/catalog/types";
import type { LegResult } from "@/lib/bets/types";

export type SettledLegResult = Exclude<LegResult, "pending">;

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

export interface SettlementInput {
  marketType: CatalogMarketType;
  line: number | null;
  selectionName: CatalogSelectionName;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Settle one selection from the final 90-minute score. Extra time and penalties
 * are ignored by design: the catalog stores the regulation-time result.
 */
export function settleSelection(input: SettlementInput): SettledLegResult {
  const { homeScore, awayScore } = input;

  if (
    homeScore === null ||
    awayScore === null ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    throw new SettlementError("The final score is missing.");
  }

  switch (input.marketType) {
    case "1X2": {
      const winner =
        homeScore > awayScore
          ? "home"
          : homeScore < awayScore
            ? "away"
            : "draw";

      if (
        input.selectionName !== "home" &&
        input.selectionName !== "draw" &&
        input.selectionName !== "away"
      ) {
        throw new SettlementError("This selection does not match the market.");
      }

      return input.selectionName === winner ? "won" : "lost";
    }

    case "OU25": {
      if (
        input.selectionName !== "over" &&
        input.selectionName !== "under"
      ) {
        throw new SettlementError("This selection does not match the market.");
      }

      const line = input.line ?? 2.5;
      const total = homeScore + awayScore;

      if (total === line) {
        return "void";
      }

      const result = total > line ? "over" : "under";
      return input.selectionName === result ? "won" : "lost";
    }

    case "BTTS": {
      if (input.selectionName !== "yes" && input.selectionName !== "no") {
        throw new SettlementError("This selection does not match the market.");
      }

      const bothScored = homeScore > 0 && awayScore > 0;
      const result = bothScored ? "yes" : "no";
      return input.selectionName === result ? "won" : "lost";
    }

    case "DC": {
      if (
        input.selectionName !== "1X" &&
        input.selectionName !== "X2" &&
        input.selectionName !== "12"
      ) {
        throw new SettlementError("This selection does not match the market.");
      }

      const won =
        (input.selectionName === "1X" && homeScore >= awayScore) ||
        (input.selectionName === "X2" && awayScore >= homeScore) ||
        (input.selectionName === "12" && homeScore !== awayScore);

      return won ? "won" : "lost";
    }

    default: {
      const exhaustive: never = input.marketType;
      throw new SettlementError(`Unsupported market: ${exhaustive}`);
    }
  }
}

export interface SettlementLegInput extends SettlementInput {
  matchStatus: string;
}

export interface EvaluableLeg extends SettlementLegInput {
  id: string;
  label?: string;
}

export interface LegEvaluation {
  legId: string;
  result: SettledLegResult;
}

export type BetEvaluation =
  | { ready: true; results: LegEvaluation[] }
  | { ready: false; reason: string };

/**
 * A postponed or cancelled fixture is void. A suspended fixture can still
 * resume, so it stays pending until the provider finishes it or an admin acts.
 */
export function settleLegResult(
  input: SettlementLegInput,
): SettledLegResult | null {
  if (input.matchStatus === "cancelled" || input.matchStatus === "postponed") {
    return "void";
  }

  if (input.matchStatus !== "finished") {
    return null;
  }

  return settleSelection(input);
}

export function evaluateBetLegs(legs: EvaluableLeg[]): BetEvaluation {
  if (legs.length === 0) {
    return { ready: false, reason: "This bet has no legs." };
  }

  const results: LegEvaluation[] = [];

  for (const leg of legs) {
    let result: SettledLegResult | null;

    try {
      result = settleLegResult(leg);
    } catch (error) {
      return {
        ready: false,
        reason:
          error instanceof SettlementError
            ? error.message
            : "The result could not be evaluated.",
      };
    }

    if (result === null) {
      return {
        ready: false,
        reason: `${leg.label ?? "A match"} is not finished.`,
      };
    }

    results.push({ legId: leg.id, result });
  }

  return { ready: true, results };
}
