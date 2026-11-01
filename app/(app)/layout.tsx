import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { requireUser } from "@/lib/auth/session";

export const instant = false;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader context={context} />
      <main className="page-shell flex-1 py-8 pb-28 md:pb-12">{children}</main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
