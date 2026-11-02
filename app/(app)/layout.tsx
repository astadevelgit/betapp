import { Suspense } from "react";
import { connection } from "next/server";

import { BetSlip } from "@/components/bets/bet-slip";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { requireUser } from "@/lib/auth/session";
import { getWallet } from "@/lib/wallet/queries";

export const instant = false;

async function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const context = await requireUser();
  const wallet = await getWallet(context.user.id);

  return (
    <>
      <SiteHeader context={context} />
      <main className="page-shell flex-1 py-8 pb-28 md:pb-12">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
      <BetSlip
        authenticated
        balance={wallet?.balance ?? 0}
      />
    </>
  );
}

function ShellFallback() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell flex-1 py-8 pb-28 md:pb-12">
        <div className="space-y-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-48 animate-pulse rounded bg-muted" />
          <div className="h-40 w-full animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<ShellFallback />}>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </Suspense>
    </div>
  );
}
