"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { formatCoins } from "@/lib/format";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

import { getAdminBet } from "./queries";
import type { AdminBetActionInput, AdminBetActionResult } from "./types";

const adminBetActionSchema = z.object({
  betId: z.string().uuid("Invalid bet."),
  mode: z.enum(["settle", "void"]),
  reason: z
    .string()
    .trim()
    .min(3, "Add a short reason (at least 3 characters).")
    .max(300, "Keep the reason under 300 characters."),
});

interface SettlementResponse {
  ok?: boolean;
  duplicate?: boolean;
  code?: string;
  message?: string;
  bet?: {
    status?: string;
    payout?: number | string;
  };
}

export async function resolveAdminBetAction(
  input: AdminBetActionInput,
): Promise<AdminBetActionResult> {
  const parsed = adminBetActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Check the settlement details and try again.",
    };
  }

  const context = await getCurrentUser();

  if (!context || context.profile.role !== "admin") {
    return {
      ok: false,
      message: "Admin access is required for this action.",
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      message: "The admin database client is not configured.",
    };
  }

  const bet = await getAdminBet(parsed.data.betId);

  if (!bet) {
    return { ok: false, message: "This bet could not be found." };
  }

  if (bet.status !== "open") {
    return {
      ok: false,
      message: `This bet is already ${bet.status}. Corrections require a separate balance adjustment.`,
    };
  }

  let legResults: Array<{ legId: string; result: string }>;

  if (parsed.data.mode === "void") {
    legResults = bet.legs.map((leg) => ({
      legId: leg.id,
      result: "void",
    }));
  } else {
    if (!bet.evaluation.ready) {
      return {
        ok: false,
        message: `This bet cannot be settled yet: ${bet.evaluation.reason}`,
      };
    }

    legResults = bet.evaluation.results;
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("apply_bet_settlement", {
      p_bet_id: bet.id,
      p_leg_results: legResults,
      p_settled_by: context.user.id,
      p_reason: `${parsed.data.mode === "void" ? "Manual void" : "Manual settle"}: ${parsed.data.reason}`,
    });

    if (error) {
      console.error("[admin] apply_bet_settlement failed", error.message);
      return {
        ok: false,
        message: "The settlement could not be applied. Please try again.",
      };
    }

    const payload = (data ?? {}) as SettlementResponse;

    if (payload.ok !== true) {
      return {
        ok: false,
        message:
          payload.message ??
          payload.code ??
          "The settlement could not be applied.",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/bets");
    revalidatePath("/admin/audit");
    revalidatePath("/my-bets");
    revalidatePath("/wallet");

    if (payload.duplicate) {
      return {
        ok: true,
        message: "This bet was already settled. No coins were credited twice.",
      };
    }

    const status = payload.bet?.status ?? (parsed.data.mode === "void" ? "void" : "settled");
    const payout = Number(payload.bet?.payout ?? 0);

    return {
      ok: true,
      message:
        payout > 0
          ? `Bet ${status}. ${formatCoins(payout)} BET credited to the player.`
          : `Bet ${status}. No payout was credited.`,
    };
  } catch (error) {
    console.error(
      "[admin] Unexpected settlement error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message: "The settlement could not be applied. Please try again.",
    };
  }
}
