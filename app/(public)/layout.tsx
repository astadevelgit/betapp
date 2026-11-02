import { Suspense } from "react";
import { connection } from "next/server";

import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/lib/auth/session";

async function PublicHeader() {
  await connection();
  const context = await getCurrentUser();
  return <SiteHeader context={context} />;
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
    </div>
  );
}
