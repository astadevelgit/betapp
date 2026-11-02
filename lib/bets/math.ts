import type { BetSlipLeg } from "./types";

export const MIN_STAKE = 100;
export const MAX_STAKE = 50_000;
export const MAX_PAYOUT = 1_000_000;
export const MAX_LEGS = 10;

/**
 * The server recomputes the payout from numeric odds. This preview mirrors the
 * same floor-and-cap rule closely enough for display; the RPC is authoritative.
 * The epsilon absorbs binary floating-point error on 3-decimal odds.
 */
export function calculateBetPreview(
  legs: BetSlipLeg[],
  stake: number,
  maxPayout = MAX_PAYOUT,
): {
  totalOdds: number;
  potentialPayout: number;
  capped: boolean;
} {
  if (legs.length === 0 || !Number.isFinite(stake) || stake <= 0) {
    return { totalOdds: 1, potentialPayout: 0, capped: false };
  }

  const totalOdds = legs.reduce((product, leg) => product * leg.odds, 1);
  const rawPayout = Math.floor(stake * totalOdds + 1e-6);
  const capped = rawPayout > maxPayout;

  return {
    totalOdds,
    potentialPayout: capped ? maxPayout : rawPayout,
    capped,
  };
}

export function formatTotalOdds(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10_000) return "10,000+";
  return value.toFixed(2);
}
