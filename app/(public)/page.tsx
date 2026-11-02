import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
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

import { MatchCard } from "@/components/matches/match-card";
import { LiveMatches } from "@/components/matches/live-matches";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFeaturedMatch, getLiveMatches, getUpcomingMatches } from "@/lib/catalog/queries";
import type { CatalogMatch } from "@/lib/catalog/types";
import { formatKickoff, formatMatchDay } from "@/lib/format";
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

          <Suspense fallback={<PreviewCard />}>
            <FeaturedMatchCard />
          </Suspense>
        </div>
      </section>

      <section className="page-shell py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Match centre</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Live and upcoming
            </h2>
          </div>
          <Link
            href="/live"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
          >
            Live centre
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <Suspense fallback={<MatchCentreSkeleton />}>
          <MatchCentre />
        </Suspense>
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

async function FeaturedMatchCard() {
  await io();
  const match = await getFeaturedMatch();

  if (!match) {
    return <PreviewCard />;
  }

  const isLive = match.status === "live" || match.status === "halftime";

  return (
    <Card className="relative overflow-hidden border-brand/20 bg-card/90 shadow-2xl shadow-black/30">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent" />
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{isLive ? "Live now" : "Next up"}</p>
            <CardTitle className="mt-1 text-xl">{match.competition.name}</CardTitle>
          </div>
          <Badge variant="outline" className="border-brand/30 text-brand">
            {match.isDemo ? "Demo" : "Featured"}
          </Badge>
        </div>
        <CardDescription>
          {match.status === "scheduled"
            ? `Kickoff ${formatKickoff(match.kickoffAt)}`
            : "Follow the live score and pre-match markets."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MatchCard match={match} className="border-0 bg-transparent p-0" />
        <Link
          href={`/match/${match.id}`}
          className={cn(buttonVariants(), "mt-4 h-11 w-full gap-2")}
        >
          View markets
          <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function PreviewCard() {
  return (
    <Card className="relative overflow-hidden border-brand/20 bg-card/90 shadow-2xl shadow-black/30">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent" />
      <CardHeader className="gap-1">
        <p className="eyebrow">Matchday</p>
        <CardTitle className="text-xl">Fixtures are syncing</CardTitle>
        <CardDescription>
          Live scores and odds will appear here as soon as the feed is
          connected. The match centre updates every minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {markets.map((market) => (
          <div
            key={market.label}
            className="rounded-lg border border-border/70 bg-background/40 p-3"
          >
            <p className="text-sm font-semibold text-foreground">
              {market.label}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">{market.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function MatchCentre() {
  await io();
  const [live, upcoming] = await Promise.all([
    getLiveMatches(),
    getUpcomingMatches(18),
  ]);

  if (live.length === 0 && upcoming.length === 0) {
    return <EmptyFixtures />;
  }

  const groups = groupByMatchDay(upcoming);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              live.length > 0
                ? "animate-pulse bg-live"
                : "bg-muted-foreground/40",
            )}
          />
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Live now
          </h3>
        </div>
        {live.length > 0 ? (
          <LiveMatches initialMatches={live} />
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 bg-card/30 px-4 py-3 text-sm text-muted-foreground">
            No matches are live right now. The next kickoff is listed below.
          </p>
        )}
      </div>

      {groups.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Upcoming
          </h3>
          <div className="space-y-5">
            {groups.map(([day, matches]) => (
              <div key={day}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {day}
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyFixtures() {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
        <CalendarDays className="size-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">Fixtures are being prepared</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        The next set of matches will appear here as soon as the feed syncs.
        Check the live centre for scores and status updates.
      </p>
      <Link
        href="/live"
        className={cn(buttonVariants({ variant: "outline" }), "mt-5 h-10")}
      >
        Open live centre
      </Link>
    </div>
  );
}

function MatchCentreSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-xl border border-border/70 bg-card/50"
          />
        ))}
      </div>
    </div>
  );
}

function groupByMatchDay(matches: CatalogMatch[]): Array<[string, CatalogMatch[]]> {
  const groups = new Map<string, CatalogMatch[]>();

  for (const match of matches) {
    const day = formatMatchDay(match.kickoffAt);
    const existing = groups.get(day) ?? [];
    existing.push(match);
    groups.set(day, existing);
  }

  return [...groups.entries()];
}
