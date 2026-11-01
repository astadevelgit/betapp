import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Coins,
  Radio,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const markets = [
  { label: "1X2", detail: "Home, draw, away" },
  { label: "O/U 2.5", detail: "Over or under" },
  { label: "BTTS", detail: "Both teams to score" },
  { label: "DC", detail: "Double chance" },
];

const features = [
  {
    icon: Radio,
    title: "Live match centre",
    description:
      "Scores, minutes, and match status refresh while you follow the action.",
  },
  {
    icon: Ticket,
    title: "Singles and accas",
    description:
      "Back one result or combine 2–10 legs. No same-match legs, no hidden surprises.",
  },
  {
    icon: ShieldCheck,
    title: "Settled automatically",
    description:
      "Results settle from the feed after 90 minutes plus stoppage. Admin overrides are audited.",
  },
];

const steps = [
  {
    icon: Coins,
    title: "Start with 10,000",
    description:
      "Verify your email and receive 10,000 BET coins. No card, no deposit.",
  },
  {
    icon: CalendarDays,
    title: "Claim 2,000 daily",
    description:
      "One claim per Africa/Lagos day keeps your balance topped up.",
  },
  {
    icon: Trophy,
    title: "Build your record",
    description:
      "Predict, track your bets, and see every result in one place.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="page-shell relative overflow-hidden pb-16 pt-12 sm:pt-20">
        <div className="pointer-events-none absolute right-[-10rem] top-[-8rem] -z-10 size-[30rem] rounded-full bg-brand/10 blur-3xl" />

        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-brand/30 bg-brand/10 text-brand">
                <Sparkles className="size-3" />
                Private beta · 100 players
              </Badge>
              <Badge variant="outline" className="border-border/80 text-muted-foreground">
                Play money only
              </Badge>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                Football predictions,
                <span className="text-brand"> without the cash.</span>
              </h1>
              <p className="max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                BetApp is a Nigeria-focused sportsbook for matchday bragging
                rights. Use BET coins, predict real fixtures, and keep every
                naira out of it.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 gap-2 px-5 text-base",
                )}
              >
                Create your account
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#how-it-works"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 px-5 text-base",
                )}
              >
                How it works
              </Link>
            </div>

            <div className="grid max-w-lg grid-cols-3 gap-3 pt-2">
              {[
                ["10,000", "signup coins"],
                ["2,000", "daily coins"],
                ["4", "markets"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-border/70 bg-card/50 p-3">
                  <p className="text-xl font-semibold tabular-nums text-foreground">
                    {value}
                  </p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="relative overflow-hidden border-brand/20 bg-card/90 shadow-2xl shadow-black/30">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent" />
            <CardHeader className="gap-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Matchday preview</p>
                  <CardTitle className="mt-1 text-xl">Your bet slip</CardTitle>
                </div>
                <Badge variant="outline" className="border-brand/30 text-brand">
                  Preview
                </Badge>
              </div>
              <CardDescription>
                The fixture and odds feed connects in the next build.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/80 bg-background/50 p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Premier League</span>
                  <span>Sat · 17:30</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Home team</p>
                    <p className="text-xs text-muted-foreground">vs Away team</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["1.85", "3.40", "4.10"].map((odd) => (
                      <span
                        key={odd}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground"
                      >
                        {odd}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {markets.map((market) => (
                  <div
                    key={market.label}
                    className="rounded-lg border border-border/70 bg-background/40 p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {market.label}
                    </p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {market.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-brand/20 bg-brand/5 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Potential payout</p>
                  <p className="text-xl font-semibold tabular-nums text-brand">
                    12,450 BET
                  </p>
                </div>
                <Coins className="size-6 text-brand" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="page-shell py-14">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow">Built for matchday</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            A football product, not a casino.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-border/80 bg-card/70">
                <CardHeader className="gap-3">
                  <span className="grid size-10 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
                    <Icon className="size-5" />
                  </span>
                  <div className="space-y-1">
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription className="leading-6">
                      {feature.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="page-shell py-14">
        <div className="surface p-6 sm:p-8">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">The loop</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Three steps to your first slip.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="page-shell py-14">
        <div className="grid gap-6 rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-card to-card p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-xl space-y-2">
            <p className="eyebrow">Closed-loop by design</p>
            <h2 className="text-2xl font-semibold tracking-tight">
              No purchases. No cash-out. No prizes.
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              BET coins are a game score, not money. There is nothing to buy,
              withdraw, or convert. BetApp is for entertainment and is strictly
              18+.
            </p>
          </div>
          <Link
            href="/legal#responsible-play"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11",
            )}
          >
            Responsible play
          </Link>
        </div>
      </section>
    </>
  );
}
