"use server";

import { revalidatePath } from "next/cache";

import * as Sentry from "@sentry/nextjs";

import { captureServerEvent } from "@/lib/analytics/server";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type {
  BetLegChange,
  PlaceBetInput,
  PlaceBetResult,
} from "./types";
import { placeBetSchema, type PlaceBetSchemaInput } from "./validation";

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeChanges(value: unknown): BetLegChange[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      selectionId: asString(row.selectionId),
      marketId: asString(row.marketId),
      matchId: asString(row.matchId),
      currentOdds: asNumber(row.currentOdds) ?? null,
      reason: asString(row.reason, "ODDS_CHANGED"),
      message: asString(row.message, "This selection changed."),
    };
  });
}

function normalizeResponse(data: unknown): PlaceBetResult {
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      code: "PLACEMENT_FAILED",
      message: "The bet could not be placed. Please try again.",
    };
  }

  const payload = data as Record<string, unknown>;

  if (payload.ok !== true) {
    return {
      ok: false,
      code: asString(payload.code, "PLACEMENT_FAILED"),
      message: asString(
        payload.message,
        "The bet could not be placed. Please try again.",
      ),
      changes: normalizeChanges(payload.changes),
      balance: asNumber(payload.balance),
      minStake: asNumber(payload.minStake),
      maxStake: asNumber(payload.maxStake),
    };
  }

  const bet = (payload.bet ?? {}) as Record<string, unknown>;
  const betId = asString(bet.id);

  if (!betId) {
    return {
      ok: false,
      code: "PLACEMENT_FAILED",
      message: "The bet was placed, but the response was incomplete. Check My Bets.",
    };
  }

  return {
    ok: true,
    duplicate: payload.duplicate === true,
    betId,
    stake: asNumber(bet.stake) ?? 0,
    totalOdds: asNumber(bet.totalOdds) ?? 0,
    potentialPayout: asNumber(bet.potentialPayout) ?? 0,
    balance: asNumber(payload.balance) ?? 0,
  };
}

export async function placeBetAction(
  input: PlaceBetInput,
): Promise<PlaceBetResult> {
  const parsed = placeBetSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message:
        parsed.error.issues[0]?.message ?? "Check your bet slip and try again.",
    };
  }

  const context = await getCurrentUser();

  if (!context) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "Log in to place your bet.",
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "Betting is not configured yet.",
    };
  }

  const payload: PlaceBetSchemaInput = parsed.data;

  try {
    const admin = getSupabaseAdminClient();
    const { data: maintenanceSetting, error: maintenanceError } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle();

    if (maintenanceError) {
      console.error(
        "[bets] Could not read maintenance mode",
        maintenanceError.message,
      );
    }

    if (!maintenanceError && maintenanceSetting?.value === true) {
      void captureServerEvent(context.user.id, "bet_failed", {
        code: "MAINTENANCE",
      });

      return {
        ok: false,
        code: "MAINTENANCE",
        message: "Betting is paused for maintenance. Please try again shortly.",
      };
    }

    try {
      const rateLimit = await consumeRateLimit(
        `bet:${context.user.id}`,
        10,
        60,
      );

      if (!rateLimit.allowed) {
        void captureServerEvent(context.user.id, "bet_failed", {
          code: "RATE_LIMITED",
        });

        return {
          ok: false,
          code: "RATE_LIMITED",
          message: `Too many bet attempts. Please wait ${rateLimit.retryAfterSeconds} seconds and try again.`,
        };
      }
    } catch (error) {
      // The limiter is defense-in-depth. A transient limiter failure should not
      // block the core betting flow; log it and continue.
      console.error(
        "[bets] Rate limit check failed",
        error instanceof Error ? error.message : error,
      );
    }

    const { data, error } = await admin.rpc("place_bet", {
      p_user_id: context.user.id,
      p_idempotency_key: payload.idempotencyKey,
      p_bet_type: payload.type,
      p_stake: payload.stake,
      p_legs: payload.legs.map((leg) => ({
        matchId: leg.matchId,
        marketId: leg.marketId,
        selectionId: leg.selectionId,
        expectedOdds: leg.expectedOdds,
      })),
    });

    if (error) {
      console.error("[bets] place_bet RPC failed", error.message);
      Sentry.captureException(error, {
        tags: { flow: "place_bet" },
      });
      void captureServerEvent(context.user.id, "bet_failed", {
        code: "PLACEMENT_FAILED",
      });

      return {
        ok: false,
        code: "PLACEMENT_FAILED",
        message: "The bet could not be placed. Please try again.",
      };
    }

    const result = normalizeResponse(data);

    if (result.ok) {
      await captureServerEvent(context.user.id, "bet_placed", {
        betId: result.betId,
        betType: payload.type,
        stake: result.stake,
        totalOdds: result.totalOdds,
        potentialPayout: result.potentialPayout,
        legCount: payload.legs.length,
        duplicate: result.duplicate,
      });

      revalidatePath("/");
      revalidatePath("/live");
      revalidatePath("/my-bets");
      revalidatePath("/wallet");
    } else {
      void captureServerEvent(context.user.id, "bet_failed", {
        code: result.code,
      });
    }

    return result;
  } catch (error) {
    console.error(
      "[bets] Unexpected placement error",
      error instanceof Error ? error.message : error,
    );
    Sentry.captureException(error, {
      tags: { flow: "place_bet" },
    });
    void captureServerEvent(context.user.id, "bet_failed", {
      code: "PLACEMENT_FAILED",
    });

    return {
      ok: false,
      code: "PLACEMENT_FAILED",
      message: "The bet could not be placed. Please try again.",
    };
  }
}
