"use client";

import Link from "next/link";
import { useActionState } from "react";

import { initialActionState } from "@/lib/action-state";
import { signUpAction } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function RegisterForm() {
  const [state, formAction] = useActionState(signUpAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="nickname"
            placeholder="Sunday"
            required
            defaultValue={state.values?.displayName}
            aria-invalid={Boolean(state.errors?.displayName?.length)}
            className="h-11"
          />
          <FieldError messages={state.errors?.displayName} />
        </div>

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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state.errors?.password?.length)}
            className="h-11"
          />
          <FieldError messages={state.errors?.password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state.errors?.confirmPassword?.length)}
            className="h-11"
          />
          <FieldError messages={state.errors?.confirmPassword} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <Input
            id="dob"
            name="dob"
            type="date"
            autoComplete="bday"
            required
            defaultValue={state.values?.dob}
            aria-invalid={Boolean(state.errors?.dob?.length)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">You must be 18 or older.</p>
          <FieldError messages={state.errors?.dob} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <select
            id="country"
            name="country"
            defaultValue={state.values?.country || "NG"}
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="NG" className="bg-card">
              Nigeria
            </option>
          </select>
          <FieldError messages={state.errors?.country} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="mt-0.5 size-4 shrink-0 accent-brand"
          />
          <span>
            I am 18+ and agree to the{" "}
            <Link href="/legal#terms" className="text-brand hover:underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/legal#privacy" className="text-brand hover:underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        <FieldError messages={state.errors?.acceptTerms} />
      </div>

      <SubmitButton pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
