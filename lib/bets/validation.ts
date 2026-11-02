import { z } from "zod";

import { MAX_LEGS, MAX_STAKE, MIN_STAKE } from "./math";
import type { PlaceBetInput } from "./types";

export const betLegInputSchema = z.object({
  matchId: z.string().uuid("Invalid match."),
  marketId: z.string().uuid("Invalid market."),
  selectionId: z.string().uuid("Invalid selection."),
  expectedOdds: z
    .number()
    .finite()
    .gt(1, "Odds must be greater than 1.")
    .lt(1000, "Odds are out of range."),
});

export const placeBetSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(8, "Invalid submission key.")
      .max(100, "Invalid submission key.")
      .regex(/^[A-Za-z0-9:_-]+$/, "Invalid submission key."),
    type: z.enum(["single", "accumulator"]),
    stake: z
      .number()
      .int("Stake must be a whole number.")
      .min(MIN_STAKE, `Minimum stake is ${MIN_STAKE} BET coins.`)
      .max(MAX_STAKE, `Maximum stake is ${MAX_STAKE} BET coins.`),
    legs: z.array(betLegInputSchema).min(1).max(MAX_LEGS),
  })
  .superRefine((value, ctx) => {
    if (value.type === "single" && value.legs.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["legs"],
        message: "A single bet needs exactly one selection.",
      });
    }

    if (
      value.type === "accumulator" &&
      (value.legs.length < 2 || value.legs.length > MAX_LEGS)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["legs"],
        message: "An accumulator needs between 2 and 10 selections.",
      });
    }

    const matchIds = new Set<string>();
    for (const leg of value.legs) {
      if (matchIds.has(leg.matchId)) {
        ctx.addIssue({
          code: "custom",
          path: ["legs"],
          message: "An accumulator cannot include two selections from the same match.",
        });
        break;
      }
      matchIds.add(leg.matchId);
    }
  });

export type PlaceBetSchemaInput = z.infer<typeof placeBetSchema>;

export function toPlaceBetInput(
  value: PlaceBetSchemaInput,
): PlaceBetInput {
  return value;
}
