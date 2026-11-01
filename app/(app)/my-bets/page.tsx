import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My bets",
};

export const instant = false;

export default function MyBetsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Your record</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My bets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Singles and accumulators, open and settled.
        </p>
      </div>

      <Card className="border-border/80 bg-card/70">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <Ticket className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">No bets yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Add a selection from a match, choose your stake, and your slip will
            appear here with its live status.
          </p>
          <Link
            href="/"
            className={cn(buttonVariants(), "mt-6 h-11")}
          >
            Browse football
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
