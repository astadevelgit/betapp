"use client";

import { useActionState } from "react";
import { CalendarCheck2 } from "lucide-react";

import { initialActionState } from "@/lib/action-state";
import { claimDailyAction } from "@/app/(app)/wallet/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function DailyClaimButton({ claimed }: { claimed: boolean }) {
  const [state, formAction] = useActionState(
    claimDailyAction,
    initialActionState,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <SubmitButton
          pendingText="Claiming…"
          disabled={claimed}
          className="w-full sm:w-auto"
        >
          <CalendarCheck2 className="size-4" />
          {claimed ? "Claimed today" : "Claim 2,000 daily coins"}
        </SubmitButton>
      </form>
      <FormMessage state={state} />
      <p className="text-xs text-muted-foreground">
        Resets at midnight in Lagos. One claim per player per day.
      </p>
    </div>
  );
}
