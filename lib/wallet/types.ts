export type WalletRow = {
  user_id: string;
  balance: number;
  currency: string;
  version: number;
  updated_at: string;
};

export type WalletTransactionRow = {
  id: string;
  user_id: string;
  type:
    | "signup_bonus"
    | "daily_claim"
    | "bet_stake"
    | "bet_payout"
    | "bet_refund"
    | "admin_adjustment"
    | "correction";
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
