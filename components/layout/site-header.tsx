import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { signOutAction } from "@/lib/auth/actions";
import type { AuthContext } from "@/lib/auth/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";

export function SiteHeader({ context }: { context?: AuthContext | null }) {
  const isAdmin = context?.profile.role === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="page-shell flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-0.5 md:flex">
          <NavLink href="/">Football</NavLink>
          <NavLink href="/live">Live</NavLink>
          {context && <NavLink href="/my-bets">My Bets</NavLink>}
          {context && <NavLink href="/wallet">Wallet</NavLink>}
          {isAdmin && (
            <NavLink href="/admin" className="gap-1.5">
              <ShieldCheck className="size-3.5" />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {context ? (
            <>
              <Link
                href="/account"
                className="hidden max-w-36 truncate text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {context.profile.display_name}
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                Log in
              </Link>
              <Link
                href="/auth/register"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "h-9 px-3.5",
                )}
              >
                Join beta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
