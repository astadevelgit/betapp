import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export const instant = false;

export default function ResetPasswordPage() {
  return (
    <Card className="border-border/80 bg-card/90 shadow-2xl shadow-black/20">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          Use at least 8 characters. You will be asked to log in again.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ResetPasswordForm />
      </CardContent>

      <CardFooter className="justify-center border-border/70 bg-transparent text-sm text-muted-foreground">
        Link expired?{" "}
        <Link
          href="/auth/forgot-password"
          className="ml-1 font-medium text-brand hover:underline"
        >
          Request another
        </Link>
      </CardFooter>
    </Card>
  );
}
