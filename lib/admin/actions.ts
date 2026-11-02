"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { formatCoins } from "@/lib/format";
import { syncFixtures, syncLive, syncOdds } from "@/lib/provider/sync";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

import { getAdminBet } from "./queries";
import type {
  AdminAdjustBalanceInput,
  AdminActionResult,
  AdminBetActionInput,
  AdminBetActionResult,
  AdminSyncJob,
  AdminUpdateSettingsInput,
  AdminUserStatusInput,
} from "./types";

const adminBetActionSchema = z.object({
  betId: z.string().uuid("Invalid bet."),
  mode: z.enum(["settle", "void"]),
  reason: z
    .string()
    .trim()
    .min(3, "Add a short reason (at least 3 characters).")
    .max(300, "Keep the reason under 300 characters."),
});

const reasonSchema = z
  .string()
  .trim()
  .min(3, "Add a short reason (at least 3 characters).")
  .max(300, "Keep the reason under 300 characters.");

const adjustBalanceSchema = z.object({
  userId: z.string().uuid("Invalid player."),
  amount: z
    .number()
    .int("Use a whole number of coins.")
    .min(-1_000_000, "The adjustment is too large.")
    .max(1_000_000, "The adjustment is too large.")
    .refine((value) => value !== 0, "Enter a non-zero amount."),
  reason: reasonSchema,
  idempotencyKey: z.string().uuid("Invalid adjustment request."),
});

const userStatusSchema = z.object({
  userId: z.string().uuid("Invalid player."),
  status: z.enum(["active", "suspended"]),
  reason: reasonSchema,
});

const settingsSchema = z
  .object({
    signup_bonus: z.number().int().min(0).max(1_000_000),
    daily_claim: z.number().int().min(0).max(1_000_000),
    min_stake: z.number().int().min(1).max(1_000_000),
    max_stake: z.number().int().min(1).max(1_000_000),
    max_payout: z.number().int().min(1).max(10_000_000),
    beta_cap: z.number().int().min(0).max(10_000),
    odds_stale_seconds: z.number().int().min(30).max(3_600),
    beta_enabled: z.boolean(),
    maintenance_mode: z.boolean(),
  })
  .refine((value) => value.max_stake >= value.min_stake, {
    message: "The maximum stake cannot be lower than the minimum stake.",
    path: ["max_stake"],
  });

const updateSettingsSchema = z.object({
  settings: settingsSchema,
  reason: reasonSchema,
});

const syncJobSchema = z.enum(["fixtures", "live", "odds"]);

async function requireActiveAdmin(): Promise<string | null> {
  const context = await getCurrentUser();

  if (
    !context ||
    context.profile.role !== "admin" ||
    context.profile.status !== "active"
  ) {
    return null;
  }

  return context.user.id;
}

interface AdminRpcResponse {
  ok?: boolean;
  duplicate?: boolean;
  unchanged?: boolean;
  balance?: number | string;
  status?: string;
  changed?: unknown;
  code?: string;
  message?: string;
}

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

// ---------------------------------------------------------------------------
// Balance adjustments
// ---------------------------------------------------------------------------

export async function adjustUserBalanceAction(
  input: AdminAdjustBalanceInput,
): Promise<AdminActionResult> {
  const parsed = adjustBalanceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the adjustment and try again.",
    };
  }

  const adminId = await requireActiveAdmin();

  if (!adminId) {
    return { ok: false, message: "Admin access is required for this action." };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      message: "The admin database client is not configured.",
    };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("admin_adjust_balance", {
      p_admin_id: adminId,
      p_user_id: parsed.data.userId,
      p_amount: parsed.data.amount,
      p_reason: parsed.data.reason,
      p_idempotency_key: parsed.data.idempotencyKey,
    });

    if (error) {
      console.error("[admin] admin_adjust_balance failed", error.message);
      return {
        ok: false,
        message: "The adjustment could not be applied. Please try again.",
      };
    }

    const payload = (data ?? {}) as AdminRpcResponse;

    if (payload.ok !== true) {
      return {
        ok: false,
        message:
          payload.message ??
          payload.code ??
          "The adjustment could not be applied.",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath("/admin/transactions");
    revalidatePath("/admin/audit");
    revalidatePath("/wallet");

    if (payload.duplicate) {
      return {
        ok: true,
        message: "This adjustment was already applied. No coins were added twice.",
      };
    }

    return {
      ok: true,
      message: `Balance updated to ${formatCoins(payload.balance ?? 0)} BET.`,
    };
  } catch (error) {
    console.error(
      "[admin] Unexpected balance adjustment error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message: "The adjustment could not be applied. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Suspensions
// ---------------------------------------------------------------------------

export async function setUserStatusAction(
  input: AdminUserStatusInput,
): Promise<AdminActionResult> {
  const parsed = userStatusSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the status change and try again.",
    };
  }

  const adminId = await requireActiveAdmin();

  if (!adminId) {
    return { ok: false, message: "Admin access is required for this action." };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      message: "The admin database client is not configured.",
    };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("admin_set_user_status", {
      p_admin_id: adminId,
      p_user_id: parsed.data.userId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason,
    });

    if (error) {
      console.error("[admin] admin_set_user_status failed", error.message);
      return {
        ok: false,
        message: "The status change could not be applied. Please try again.",
      };
    }

    const payload = (data ?? {}) as AdminRpcResponse;

    if (payload.ok !== true) {
      return {
        ok: false,
        message:
          payload.message ??
          payload.code ??
          "The status change could not be applied.",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");

    if (payload.unchanged) {
      return { ok: true, message: "The account already has that status." };
    }

    return {
      ok: true,
      message:
        parsed.data.status === "suspended"
          ? "Player suspended. Their session can no longer open the app."
          : "Player restored to active.",
    };
  } catch (error) {
    console.error(
      "[admin] Unexpected status change error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message: "The status change could not be applied. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettingsAction(
  input: AdminUpdateSettingsInput,
): Promise<AdminActionResult> {
  const parsed = updateSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the settings and try again.",
    };
  }

  const adminId = await requireActiveAdmin();

  if (!adminId) {
    return { ok: false, message: "Admin access is required for this action." };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      message: "The admin database client is not configured.",
    };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("admin_update_settings", {
      p_admin_id: adminId,
      p_settings: parsed.data.settings,
      p_reason: parsed.data.reason,
    });

    if (error) {
      console.error("[admin] admin_update_settings failed", error.message);
      return {
        ok: false,
        message: "The settings could not be saved. Please try again.",
      };
    }

    const payload = (data ?? {}) as AdminRpcResponse;

    if (payload.ok !== true) {
      return {
        ok: false,
        message:
          payload.message ??
          payload.code ??
          "The settings could not be saved.",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/audit");
    revalidatePath("/");
    revalidatePath("/live");
    revalidatePath("/wallet");

    if (payload.unchanged) {
      return { ok: true, message: "No setting values changed." };
    }

    const changed = Array.isArray(payload.changed)
      ? payload.changed.length
      : 0;

    return {
      ok: true,
      message:
        changed > 0
          ? `Saved ${changed} setting${changed === 1 ? "" : "s"}.`
          : "Settings saved.",
    };
  } catch (error) {
    console.error(
      "[admin] Unexpected settings error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message: "The settings could not be saved. Please try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Manual sync
// ---------------------------------------------------------------------------

export async function runSyncJobAction(
  job: AdminSyncJob,
): Promise<AdminActionResult> {
  const parsed = syncJobSchema.safeParse(job);

  if (!parsed.success) {
    return { ok: false, message: "Unknown sync job." };
  }

  const adminId = await requireActiveAdmin();

  if (!adminId) {
    return { ok: false, message: "Admin access is required for this action." };
  }

  try {
    const result =
      parsed.data === "fixtures"
        ? await syncFixtures({ days: 7 })
        : parsed.data === "live"
          ? await syncLive()
          : await syncOdds();

    revalidatePath("/admin");
    revalidatePath("/admin/matches");
    revalidatePath("/");
    revalidatePath("/live");

    return {
      ok: true,
      message: `${result.recordsProcessed} record${
        result.recordsProcessed === 1 ? "" : "s"
      } processed.`,
    };
  } catch (error) {
    console.error(
      "[admin] Manual sync failed",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Sync failed: ${error.message}`
          : "Sync failed. Check the provider configuration.",
    };
  }
}
