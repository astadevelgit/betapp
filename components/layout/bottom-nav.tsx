"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radio, Ticket, User, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/my-bets", label: "My Bets", icon: Ticket },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/account", label: "Account", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium text-muted-foreground transition-colors",
                isActive && "text-brand",
              )}
            >
              <Icon className="size-5" strokeWidth={isActive ? 2.5 : 1.9} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
