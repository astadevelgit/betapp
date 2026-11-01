import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Coins } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
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
  title: "Create account",
};

export const instant = false;

export default function RegisterPage() {
  return (
    <Card className="border-border/80 bg-card/90 shadow-2xl shadow-black/20">
      <CardHeader className="gap-1.5">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          <Coins className="size-4" />
          10,000 BET coins on verification
        </div>
        <CardTitle className="text-2xl">Join the private beta</CardTitle>
        <CardDescription>
          Create a play-money account. No deposit, no card, no cash-out.
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

        <RegisterForm />
      </CardContent>

      <CardFooter className="justify-center border-border/70 bg-transparent text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="ml-1 font-medium text-brand hover:underline"
        >
          Log in
        </Link>
      </CardFooter>
    </Card>
  );
}
