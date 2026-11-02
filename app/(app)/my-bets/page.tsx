import type { Metadata } from "next";
import { connection } from "next/server";

import { MyBetsTabs } from "@/components/bets/my-bets-tabs";
import { requireUser } from "@/lib/auth/session";
import { getMyBets } from "@/lib/bets/queries";

export const metadata: Metadata = {
  title: "My bets",
};

export const instant = false;

export default async function MyBetsPage() {
  await connection();
  const { user } = await requireUser();
  const bets = await getMyBets(user.id);

  const open = bets.filter((bet) => bet.status === "open");
  const settled = bets.filter((bet) => bet.status !== "open");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Your record</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My bets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Singles and accumulators, open and settled. Payouts are credited after
          the 90-minute result is confirmed.
        </p>
      </div>

      <MyBetsTabs open={open} settled={settled} />
    </div>
  );
}
