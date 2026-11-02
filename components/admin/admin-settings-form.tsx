"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSettingsAction } from "@/lib/admin/actions";
import type { AdminSettingsValues } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

type NumericKey = {
  [K in keyof AdminSettingsValues]: AdminSettingsValues[K] extends number
    ? K
    : never;
}[keyof AdminSettingsValues];

type TextValues = Record<NumericKey, string> & {
  beta_enabled: boolean;
  maintenance_mode: boolean;
};

function toFormValues(initial: AdminSettingsValues): TextValues {
  return {
    signup_bonus: String(initial.signup_bonus),
    daily_claim: String(initial.daily_claim),
    min_stake: String(initial.min_stake),
    max_stake: String(initial.max_stake),
    max_payout: String(initial.max_payout),
    beta_cap: String(initial.beta_cap),
    odds_stale_seconds: String(initial.odds_stale_seconds),
    beta_enabled: initial.beta_enabled,
    maintenance_mode: initial.maintenance_mode,
  };
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        step="1"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      <p className="text-[0.65rem] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function ToggleField({
  id,
  label,
  hint,
  checked,
  onChange,
  tone = "default",
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: "default" | "warning";
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-3 transition-colors hover:border-border",
        tone === "warning" && checked && "border-warning/40 bg-warning/10",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function AdminSettingsForm({
  initial,
}: {
  initial: AdminSettingsValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<TextValues>(() =>
    toFormValues(initial),
  );
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function setNumber(key: NumericKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setBoolean(
    key: "beta_enabled" | "maintenance_mode",
    value: boolean,
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending || reason.trim().length < 3) return;

    const numericKeys: NumericKey[] = [
      "signup_bonus",
      "daily_claim",
      "min_stake",
      "max_stake",
      "max_payout",
      "beta_cap",
      "odds_stale_seconds",
    ];

    const settings = {} as AdminSettingsValues;

    for (const key of numericKeys) {
      const parsed = Number(values[key]);

      if (!Number.isInteger(parsed)) {
        toast.error(`Enter a whole number for ${key.replaceAll("_", " ")}.`);
        return;
      }

      settings[key] = parsed as never;
    }

    settings.beta_enabled = values.beta_enabled;
    settings.maintenance_mode = values.maintenance_mode;

    if (settings.max_stake < settings.min_stake) {
      toast.error("The maximum stake cannot be lower than the minimum stake.");
      return;
    }

    startTransition(async () => {
      const result = await updateSettingsAction({ settings, reason });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setReason("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Economy</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Closed-loop grants. Changes apply to future signups and daily claims,
          not to coins already issued.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            id="setting-signup-bonus"
            label="Signup bonus (BET)"
            hint="Credited once after email verification. 0 disables the grant."
            value={values.signup_bonus}
            onChange={(value) => setNumber("signup_bonus", value)}
            min={0}
            max={1_000_000}
          />
          <NumberField
            id="setting-daily-claim"
            label="Daily claim (BET)"
            hint="Available once per Africa/Lagos calendar day. 0 disables claims."
            value={values.daily_claim}
            onChange={(value) => setNumber("daily_claim", value)}
            min={0}
            max={1_000_000}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Betting limits</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Enforced by the atomic bet function on every placement.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            id="setting-min-stake"
            label="Minimum stake (BET)"
            value={values.min_stake}
            onChange={(value) => setNumber("min_stake", value)}
            min={1}
            max={1_000_000}
            hint="Smallest allowed single or accumulator stake."
          />
          <NumberField
            id="setting-max-stake"
            label="Maximum stake (BET)"
            value={values.max_stake}
            onChange={(value) => setNumber("max_stake", value)}
            min={1}
            max={1_000_000}
            hint="Largest allowed stake per bet. Must be at least the minimum."
          />
          <NumberField
            id="setting-max-payout"
            label="Maximum payout (BET)"
            value={values.max_payout}
            onChange={(value) => setNumber("max_payout", value)}
            min={1}
            max={10_000_000}
            hint="Hard cap applied after the odds product, including void-leg recalculations."
          />
          <NumberField
            id="setting-odds-stale"
            label="Odds staleness (seconds)"
            value={values.odds_stale_seconds}
            onChange={(value) => setNumber("odds_stale_seconds", value)}
            min={30}
            max={3600}
            hint="The odds sync skips markets refreshed inside this window."
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Beta gate</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The cap and toggle are enforced in the signup trigger and the capacity
          check, so they cannot be bypassed by the client.
        </p>
        <div className="mt-4 space-y-4">
          <NumberField
            id="setting-beta-cap"
            label="Beta cap (active profiles)"
            value={values.beta_cap}
            onChange={(value) => setNumber("beta_cap", value)}
            min={0}
            max={10_000}
            hint="Existing accounts are never removed. New signups go to the waitlist when full."
          />
          <ToggleField
            id="setting-beta-enabled"
            label="Accept new signups"
            hint="Turn off to send every new signup to the waitlist without changing the cap."
            checked={values.beta_enabled}
            onChange={(checked) => setBoolean("beta_enabled", checked)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Operations</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Maintenance mode pauses new bet placement immediately. Existing bets
          still settle normally.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleField
            id="setting-maintenance"
            label="Maintenance mode"
            hint="When enabled, the bet slip rejects new placements with a maintenance message."
            checked={values.maintenance_mode}
            onChange={(checked) => setBoolean("maintenance_mode", checked)}
            tone="warning"
          />
          {values.maintenance_mode ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              New bets are currently paused. Remember to switch maintenance off
              after the operation.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-brand/20 bg-brand/5 p-4 sm:p-5">
        <div className="space-y-1.5">
          <label
            htmlFor="settings-reason"
            className="text-xs font-medium text-muted-foreground"
          >
            Reason for this change
          </label>
          <Input
            id="settings-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="e.g. Lower daily claim during beta calibration"
            autoComplete="off"
          />
          <p className="text-[0.65rem] text-muted-foreground">
            Required. Saved to the audit log with before/after values.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[0.65rem] text-muted-foreground">
            All money values are whole BET coins.
          </p>
          <Button
            type="submit"
            disabled={pending || reason.trim().length < 3}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save settings
              </>
            )}
          </Button>
        </div>
      </section>
    </form>
  );
}
