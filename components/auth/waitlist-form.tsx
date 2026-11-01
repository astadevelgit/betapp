"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";
import { joinWaitlistAction } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function WaitlistForm() {
  const [state, formAction] = useActionState(
    joinWaitlistAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />

      <div className="space-y-2">
        <Label htmlFor="waitlist-email">Email</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.errors?.email?.length)}
          className="h-11"
        />
        <FieldError messages={state.errors?.email} />
      </div>

      <SubmitButton pendingText="Joining…">Join the waitlist</SubmitButton>
    </form>
  );
}
