import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/session";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar p-4 md:flex">
          <Logo />
          <p className="mt-1 pl-[3.1rem] text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Admin console
          </p>
          <AdminNav />
          <div className="mt-auto space-y-2 border-t border-border/70 pt-4">
            <p className="px-3 text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {context.profile.display_name}
              </span>
            </p>
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to app
            </Link>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start px-3 text-muted-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl md:px-8">
            <div className="md:hidden">
              <Logo compact />
            </div>
            <p className="hidden text-sm font-medium text-muted-foreground md:block">
              Operations
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs font-medium text-muted-foreground hover:text-foreground sm:text-sm"
              >
                View app
              </Link>
              <form action={signOutAction} className="md:hidden">
                <Button type="submit" variant="ghost" size="icon-sm">
                  <LogOut className="size-4" />
                  <span className="sr-only">Sign out</span>
                </Button>
              </form>
            </div>
          </header>

          <div className="border-b border-border/70 px-2 py-2 md:hidden">
            <AdminNav mobile />
          </div>

          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
