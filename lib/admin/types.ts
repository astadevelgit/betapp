export interface AdminBetActionInput {
  betId: string;
  mode: "settle" | "void";
  reason: string;
}

export type AdminActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type AdminBetActionResult = AdminActionResult;

export interface AdminAdjustBalanceInput {
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}

export interface AdminUserStatusInput {
  userId: string;
  status: "active" | "suspended";
  reason: string;
}

export interface AdminSettingsValues {
  signup_bonus: number;
  daily_claim: number;
  min_stake: number;
  max_stake: number;
  max_payout: number;
  beta_cap: number;
  odds_stale_seconds: number;
  beta_enabled: boolean;
  maintenance_mode: boolean;
}

export interface AdminUpdateSettingsInput {
  settings: AdminSettingsValues;
  reason: string;
}

export type AdminSyncJob = "fixtures" | "live" | "odds";
