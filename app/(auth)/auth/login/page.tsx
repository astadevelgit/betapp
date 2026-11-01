import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Log in",
};

export const instant = false;

const errorMessages: Record<string, string> = {
  link_expired: "That link has expired or has already been used. Request a new one.",
  missing_code: "That link is incomplete. Request a new one.",
  callback_failed: "We could not complete sign-in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const registered = params.registered === "1";
  const reset = params.reset === "1";
  const error =
    typeof params.error === "string" ? errorMessages[params.error] : undefined;

  return (
    <Card className="border-border/80 bg-card/90 shadow-2xl shadow-black/20">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Log in to place predictions and claim your daily coins.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isSupabaseConfigured() && (
          <Alert className="border-warning/30 bg-warning/10 text-warning">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-warning/90">
              Supabase is not configured yet. Add credentials to{" "}
              <code className="font-mono text-xs">.env.local</code> to enable
              authentication.
            </AlertDescription>
          </Alert>
        )}

        {registered && (
          <Alert className="border-brand/30 bg-brand/10 text-brand">
            <AlertDescription className="text-brand/90">
              Account created. Check your email to verify your address, then log
              in.
            </AlertDescription>
          </Alert>
        )}

        {reset && (
          <Alert className="border-brand/30 bg-brand/10 text-brand">
            <AlertDescription className="text-brand/90">
              Password updated. Log in with your new password.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <LoginForm next={next} />
      </CardContent>

      <CardFooter className="justify-center border-border/70 bg-transparent text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/auth/register"
          className="ml-1 font-medium text-brand hover:underline"
        >
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
