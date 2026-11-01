import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ForgotPasswordPage() {
  return (
    <Card className="border-border/80 bg-card/90 shadow-2xl shadow-black/20">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          Enter the email on your account and we will send a reset link.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ForgotPasswordForm />
      </CardContent>

      <CardFooter className="justify-center border-border/70 bg-transparent text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/auth/login"
          className="ml-1 font-medium text-brand hover:underline"
        >
          Back to log in
        </Link>
      </CardFooter>
    </Card>
  );
}
