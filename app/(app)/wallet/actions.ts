"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { captureServerEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/session";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export async function claimDailyAction(): Promise<ActionState> {
  const { user } = await requireUser();

  if (!isSupabaseAdminConfigured()) {
    return {
      status: "error",
      message: "The wallet service is not configured yet.",
    };
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_daily", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[wallet] Daily claim failed", error.message);
    return {
      status: "error",
      message: "Could not claim your daily coins. Please try again.",
    };
  }

  const result = data as {
    claimed?: boolean;
    amount?: number;
    reason?: string;
    next_claim_date?: string;
  } | null;

  if (!result?.claimed) {
    revalidatePath("/wallet");
    return {
      status: "error",
      message:
        result?.reason === "ALREADY_CLAIMED"
          ? "You have already claimed today. Come back after midnight in Lagos."
          : "Could not claim your daily coins. Please try again.",
    };
  }

  await captureServerEvent(user.id, "daily_claim", {
    amount: result.amount ?? 0,
    nextClaimDate: result.next_claim_date ?? null,
  });

  revalidatePath("/wallet");

  return {
    status: "success",
    message: `${new Intl.NumberFormat("en-NG").format(
      result.amount ?? 0,
    )} BET coins added to your wallet.`,
  };
}
