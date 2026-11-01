import type { Metadata } from "next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Info,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import { DailyClaimButton } from "@/components/wallet/daily-claim-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatCoins, formatDateTime } from "@/lib/format";
import {
  getRecentTransactions,
  getWallet,
  hasClaimedToday,
} from "@/lib/wallet/queries";

export const metadata: Metadata = {
  title: "Wallet",
};

export const instant = false;

const transactionLabels: Record<string, string> = {
  signup_bonus: "Signup bonus",
  daily_claim: "Daily claim",
  bet_stake: "Bet stake",
  bet_payout: "Bet payout",
  bet_refund: "Bet refund",
  admin_adjustment: "Admin adjustment",
  correction: "Correction",
};

export default async function WalletPage() {
  const { user } = await requireUser();
  const [wallet, transactions, claimedToday] = await Promise.all([
    getWallet(user.id),
    getRecentTransactions(user.id),
    hasClaimedToday(user.id),
  ]);

  const balance = wallet?.balance ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="eyebrow">Your coins</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          BET coins are for play only. They have no cash value.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden border-brand/20 bg-gradient-to-br from-brand/10 via-card to-card">
          <div className="absolute right-4 top-4 text-brand/20">
            <Coins className="size-24" strokeWidth={1} />
          </div>
          <CardHeader className="relative gap-1">
            <CardDescription>Available balance</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-4xl tabular-nums sm:text-5xl">
              {formatCoins(balance)}
              <span className="text-sm font-medium tracking-normal text-muted-foreground">
                BET
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <Badge
              variant="outline"
              className="border-brand/30 bg-brand/5 text-brand"
            >
              <WalletCards className="size-3" />
              Closed-loop play money
            </Badge>
            <DailyClaimButton claimed={claimedToday} />
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/70">
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-brand" />
              How coins work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              You receive 10,000 BET coins after email verification and can
              claim 2,000 more each Lagos day.
            </p>
            <p>
              Stakes are deducted when a bet is placed. Winning payouts are
              credited automatically after settlement.
            </p>
            <p className="font-medium text-foreground">
              Coins cannot be bought, withdrawn, or exchanged for prizes.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4 text-brand" />
            Recent activity
          </CardTitle>
          <CardDescription>Your latest 20 wallet transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 px-6 py-10 text-center text-sm text-muted-foreground">
              No wallet activity yet. Claim your daily coins to get started.
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {transactions.map((transaction) => {
                const isPositive = transaction.amount > 0;
                const Icon = isPositive ? ArrowDownLeft : ArrowUpRight;

                return (
                  <li
                    key={transaction.id}
                    className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={
                          isPositive
                            ? "grid size-9 shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand/10 text-brand"
                            : "grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
                        }
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {transactionLabels[transaction.type] ??
                            transaction.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(transaction.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={
                          isPositive
                            ? "text-sm font-semibold tabular-nums text-brand"
                            : "text-sm font-semibold tabular-nums text-foreground"
                        }
                      >
                        {isPositive ? "+" : ""}
                        {formatCoins(transaction.amount)}
                      </p>
                      <p className="text-[0.65rem] tabular-nums text-muted-foreground">
                        bal. {formatCoins(transaction.balance_after)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
