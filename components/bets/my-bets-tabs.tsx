"use client";

import Link from "next/link";
import { CheckCircle2, Ticket } from "lucide-react";

import { BetCard } from "@/components/bets/bet-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { BetSummary } from "@/lib/bets/types";
import { cn } from "@/lib/utils";

export function MyBetsTabs({
  open,
  settled,
}: {
  open: BetSummary[];
  settled: BetSummary[];
}) {
  return (
    <Tabs defaultValue="open" className="w-full gap-4">
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="open" className="flex-1 sm:flex-none">
          Open
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[0.6rem] tabular-nums">
            {open.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="settled" className="flex-1 sm:flex-none">
          Settled
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[0.6rem] tabular-nums">
            {settled.length}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="open" className="space-y-3">
        {open.length === 0 ? (
          <EmptyState
            icon="ticket"
            title="No open bets"
            description="Build a single or accumulator from any upcoming match and it will appear here."
          />
        ) : (
          open.map((bet) => <BetCard key={bet.id} bet={bet} />)
        )}
      </TabsContent>

      <TabsContent value="settled" className="space-y-3">
        {settled.length === 0 ? (
          <EmptyState
            icon="check"
            title="Nothing settled yet"
            description="Bets move here after their matches finish. Payouts are credited automatically."
          />
        ) : (
          settled.map((bet) => <BetCard key={bet.id} bet={bet} />)
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: "ticket" | "check";
  title: string;
  description: string;
}) {
  const Icon = icon === "ticket" ? Ticket : CheckCircle2;

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-14 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
        <Icon className="size-6" />
      </span>
      <p className="mt-4 text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "outline" }), "mt-5 h-9 px-4")}
      >
        Browse matches
      </Link>
    </div>
  );
}
