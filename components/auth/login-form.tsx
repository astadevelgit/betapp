"use client";

import Link from "next/link";
import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";
import { signInAction } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/auth/forgot-password"
            className="text-xs font-medium text-brand hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.password?.length)}
          className="h-11"
        />
        <FieldError messages={state.errors?.password} />
      </div>

      <SubmitButton pendingText="Signing in…">Log in</SubmitButton>
    </form>
  );
}
