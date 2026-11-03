import type { Metadata } from "next";
import { connection } from "next/server";
import { Settings } from "lucide-react";

import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { AdminSettingsForm } from "@/components/admin/admin-settings-form";
import { Badge } from "@/components/ui/badge";
import { getAppSettings, type AppSettingRow } from "@/lib/admin/queries";
import type { AdminSettingsValues } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Admin settings",
};

export const instant = false;

const EDITABLE_KEYS = [
  "signup_bonus",
  "daily_claim",
  "min_stake",
  "max_stake",
  "max_payout",
  "beta_cap",
  "odds_stale_seconds",
  "beta_enabled",
  "maintenance_mode",
] as const;

function readNumber(
  rows: AppSettingRow[],
  key: string,
  fallback: number,
): number {
  const value = rows.find((row) => row.key === key)?.value;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(
  rows: AppSettingRow[],
  key: string,
  fallback: boolean,
): boolean {
  const value = rows.find((row) => row.key === key)?.value;
  return typeof value === "boolean" ? value : fallback;
}

export default async function AdminSettingsPage() {
  await connection();
  await requireAdmin();

  if (!isSupabaseAdminConfigured()) {
    return <AdminConfigNotice />;
  }

  const rows = await getAppSettings();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        No app settings were found. Apply supabase/seed.sql before using this
        screen.
      </div>
    );
  }

  const initial: AdminSettingsValues = {
    signup_bonus: readNumber(rows, "signup_bonus", 10_000),
    daily_claim: readNumber(rows, "daily_claim", 2_000),
    min_stake: readNumber(rows, "min_stake", 100),
    max_stake: readNumber(rows, "max_stake", 50_000),
    max_payout: readNumber(rows, "max_payout", 1_000_000),
    beta_cap: readNumber(rows, "beta_cap", 100),
    odds_stale_seconds: readNumber(rows, "odds_stale_seconds", 900),
    beta_enabled: readBoolean(rows, "beta_enabled", true),
    maintenance_mode: readBoolean(rows, "maintenance_mode", false),
  };

  const updatedAt = rows
    .filter((row) =>
      (EDITABLE_KEYS as readonly string[]).includes(row.key),
    )
    .map((row) => row.updatedAt)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Control the closed-loop economy, betting limits, and beta gate
            without SQL. Every save requires a reason and writes before/after
            values to the audit log.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-brand/30 bg-brand/10 text-brand"
        >
          <Settings className="mr-1 size-3.5" />
          {updatedAt ? `Updated ${formatDateTime(updatedAt)}` : "Not updated"}
        </Badge>
      </div>

      <AdminSettingsForm initial={initial} />
    </div>
  );
}
