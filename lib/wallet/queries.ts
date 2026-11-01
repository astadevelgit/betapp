import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WalletRow, WalletTransactionRow } from "./types";

export async function getWallet(userId: string): Promise<WalletRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallets")
    .select("user_id, balance, currency, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[wallet] Could not load wallet", error.message);
    return null;
  }

  return data as WalletRow | null;
}

export async function getRecentTransactions(
  userId: string,
  limit = 20,
): Promise<WalletTransactionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      "id, user_id, type, amount, balance_before, balance_after, reference, metadata, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[wallet] Could not load transactions", error.message);
    return [];
  }

  return (data ?? []) as WalletTransactionRow[];
}

export async function hasClaimedToday(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data, error } = await supabase
    .from("daily_claims")
    .select("claim_date")
    .eq("user_id", userId)
    .eq("claim_date", today)
    .maybeSingle();

  if (error) {
    console.error("[wallet] Could not load daily claim", error.message);
    return false;
  }

  return Boolean(data);
}
