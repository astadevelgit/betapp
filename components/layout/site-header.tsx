import Link from "next/link";
import { Suspense } from "react";
import { LogOut, ShieldCheck } from "lucide-react";

import { signOutAction } from "@/lib/auth/actions";
import type { AuthContext } from "@/lib/auth/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";

export function SiteHeader({ context }: { context?: AuthContext | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="page-shell flex h-16 items-center justify-between gap-4">
        <Logo />

        <Suspense fallback={<SiteNavFallback context={context} />}>
          <SiteNav context={context} />
        </Suspense>

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

function SiteNav({ context }: { context?: AuthContext | null }) {
  const isAdmin = context?.profile.role === "admin";

  return (
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
  );
}

/**
 * Static nav shown while `usePathname()` resolves. Dynamic routes without
 * `generateStaticParams` cannot know their pathname during prerendering.
 */
function SiteNavFallback({ context }: { context?: AuthContext | null }) {
  const isAdmin = context?.profile.role === "admin";

  return (
    <nav className="hidden items-center gap-0.5 md:flex">
      <NavFallbackLink href="/">Football</NavFallbackLink>
      <NavFallbackLink href="/live">Live</NavFallbackLink>
      {context && <NavFallbackLink href="/my-bets">My Bets</NavFallbackLink>}
      {context && <NavFallbackLink href="/wallet">Wallet</NavFallbackLink>}
      {isAdmin && (
        <NavFallbackLink href="/admin" className="gap-1.5">
          <ShieldCheck className="size-3.5" />
          Admin
        </NavFallbackLink>
      )}
    </nav>
  );
}

function NavFallbackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
