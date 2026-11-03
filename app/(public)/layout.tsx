import { Suspense } from "react";
import { connection } from "next/server";

import { AnalyticsIdentify } from "@/components/analytics/analytics";
import { BetSlip } from "@/components/bets/bet-slip";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getWallet } from "@/lib/wallet/queries";

async function PublicHeader() {
  await connection();
  const context = await getCurrentUser();
  return <SiteHeader context={context} />;
}

async function PublicBetSlip() {
  await connection();
  const context = await getCurrentUser();
  const wallet = context ? await getWallet(context.user.id) : null;

  return (
    <>
      {context ? (
        <AnalyticsIdentify
          distinctId={context.user.id}
          role={context.profile.role}
        />
      ) : null}
      <BetSlip
        authenticated={Boolean(context)}
        balance={wallet?.balance ?? null}
      />
    </>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<SiteHeader />}>
        <PublicHeader />
      </Suspense>
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <SiteFooter />
      <BottomNav />
      <Suspense fallback={<BetSlip authenticated={false} balance={null} />}>
        <PublicBetSlip />
      </Suspense>
    </div>
  );
}
