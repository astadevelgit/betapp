"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { consumeRateLimit, hashClientIp } from "@/lib/security/rate-limit";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { safeNextPath } from "./redirect";
import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  signInSchema,
  waitlistSchema,
} from "./validation";

const CONFIG_ERROR =
  "Authentication is not configured yet. Add Supabase credentials to .env.local.";

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

function valuesFor(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, value(formData, key)]));
}

function validationState(
  error: z.ZodError,
  values: Record<string, string>,
): ActionState {
  return {
    status: "error",
    message: "Please fix the highlighted fields.",
    errors: error.flatten().fieldErrors,
    values,
  };
}

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Verify your email before signing in. Check your inbox for the link.";
  }
  if (normalized.includes("user already registered")) {
    return "An account with this email already exists.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (normalized.includes("password")) {
    return "That password does not meet the requirements.";
  }

  return "Something went wrong. Please try again.";
}

async function addToWaitlist(email: string, source = "signup"): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    return;
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("waitlist").upsert(
    { email, source },
    { onConflict: "email", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[waitlist] Could not add email", error.message);
  }
}

const WAITLIST_RATE_LIMIT = 5;
const WAITLIST_RATE_WINDOW_SECONDS = 60;

async function isWaitlistRateLimited(): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) {
    return false;
  }

  try {
    const ipHash = await hashClientIp();
    const result = await consumeRateLimit(
      `waitlist:${ipHash}`,
      WAITLIST_RATE_LIMIT,
      WAITLIST_RATE_WINDOW_SECONDS,
    );
    return !result.allowed;
  } catch (error) {
    // Do not take the waitlist down if the limiter is temporarily unavailable.
    console.error(
      "[waitlist] Rate limit check failed",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

function waitlistRateLimitState(email: string): ActionState {
  return {
    status: "error",
    message:
      "Too many waitlist requests. Please wait a minute and try again.",
    values: { email },
  };
}

function betaFullState(email: string): ActionState {
  return {
    status: "error",
    message:
      "The beta is full right now. We saved your email and will reach out when a spot opens.",
    values: { email },
  };
}

export async function signUpAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: CONFIG_ERROR };
  }

  const values = valuesFor(formData, [
    "displayName",
    "email",
    "dob",
    "country",
  ]);

  const parsed = registerSchema.safeParse({
    displayName: value(formData, "displayName"),
    email: value(formData, "email"),
    password: value(formData, "password"),
    confirmPassword: value(formData, "confirmPassword"),
    dob: value(formData, "dob"),
    country: value(formData, "country"),
    acceptTerms: value(formData, "acceptTerms"),
  });

  if (!parsed.success) {
    return validationState(parsed.error, values);
  }

  const { displayName, email, password, dob, country } = parsed.data;

  if (isSupabaseAdminConfigured()) {
    const admin = getSupabaseAdminClient();
    const { data: hasCapacity, error: capacityError } =
      await admin.rpc("beta_has_capacity");

    if (!capacityError && hasCapacity === false) {
      if (await isWaitlistRateLimited()) {
        return waitlistRateLimitState(email);
      }

      await addToWaitlist(email);
      return betaFullState(email);
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      data: {
        display_name: displayName,
        dob,
        country,
      },
    },
  });

  if (error) {
    console.error("[auth] Signup failed", error.message);

    if (
      isSupabaseAdminConfigured() &&
      /database error saving new user|beta_full/i.test(error.message)
    ) {
      const admin = getSupabaseAdminClient();
      const { data: hasCapacity } = await admin.rpc("beta_has_capacity");

      if (hasCapacity === false) {
        if (await isWaitlistRateLimited()) {
          return waitlistRateLimitState(email);
        }

        await addToWaitlist(email);
        return betaFullState(email);
      }
    }

    return {
      status: "error",
      message: friendlyAuthError(error.message),
      values,
    };
  }

  // If email confirmation is disabled in Supabase, signup returns a session.
  if (data.session) {
    if (isSupabaseAdminConfigured() && data.user) {
      const admin = getSupabaseAdminClient();
      await admin.rpc("grant_signup_bonus", { p_user_id: data.user.id });
    }
    redirect("/");
  }

  redirect("/auth/login?registered=1");
}

export async function signInAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: CONFIG_ERROR };
  }

  const values = valuesFor(formData, ["email"]);

  const parsed = signInSchema.safeParse({
    email: value(formData, "email"),
    password: value(formData, "password"),
    next: value(formData, "next"),
  });

  if (!parsed.success) {
    return validationState(parsed.error, values);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    console.error("[auth] Sign in failed", error?.message);
    return {
      status: "error",
      message: friendlyAuthError(error?.message ?? "No user returned."),
      values,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile && profile.status !== "active") {
    await supabase.auth.signOut();
    return {
      status: "error",
      message: "This account is suspended. Contact support if you think this is a mistake.",
      values,
    };
  }

  if (isSupabaseAdminConfigured()) {
    const admin = getSupabaseAdminClient();
    const { error: grantError } = await admin.rpc("grant_signup_bonus", {
      p_user_id: data.user.id,
    });

    if (grantError) {
      console.error("[auth] Signup bonus grant failed", grantError.message);
    }
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/");
}

export async function forgotPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: CONFIG_ERROR };
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: value(formData, "email"),
  });

  if (!parsed.success) {
    return validationState(parsed.error, valuesFor(formData, ["email"]));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(
        "/auth/reset-password",
      )}`,
    },
  );

  if (error && /rate limit|too many|seconds/i.test(error.message)) {
    return {
      status: "error",
      message: "Please wait a moment before requesting another reset link.",
      values: valuesFor(formData, ["email"]),
    };
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, a password reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: CONFIG_ERROR };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: value(formData, "password"),
    confirmPassword: value(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return validationState(parsed.error, {});
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "That reset link is invalid or has expired. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[auth] Password reset failed", error.message);
    return {
      status: "error",
      message: friendlyAuthError(error.message),
    };
  }

  await supabase.auth.signOut();
  redirect("/auth/login?reset=1");
}

export async function joinWaitlistAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = waitlistSchema.safeParse({
    email: value(formData, "email"),
  });

  if (!parsed.success) {
    return validationState(parsed.error, valuesFor(formData, ["email"]));
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      status: "error",
      message:
        "The waitlist is not connected yet. Add Supabase credentials to .env.local.",
    };
  }

  if (await isWaitlistRateLimited()) {
    return waitlistRateLimitState(parsed.data.email);
  }

  await addToWaitlist(parsed.data.email, "waitlist_page");

  return {
    status: "success",
    message: "You are on the list. We will email you when a beta spot opens.",
  };
}
