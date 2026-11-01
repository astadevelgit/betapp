import type { Metadata } from "next";
import { Mail } from "lucide-react";

import { WaitlistForm } from "@/components/auth/waitlist-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Join the waitlist",
};

export default function WaitlistPage() {
  return (
    <div className="page-shell py-12 sm:py-20">
      <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <span className="grid size-12 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
            <Mail className="size-5" />
          </span>
          <p className="eyebrow">Beta cap reached</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Get the next spot.
          </h1>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            The private beta is capped at 100 players. Leave your email and we
            will contact you if a spot opens. No spam, no marketing list.
          </p>
        </div>

        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle>Join the waitlist</CardTitle>
            <CardDescription>
              We will only use this email to contact you about beta access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WaitlistForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
