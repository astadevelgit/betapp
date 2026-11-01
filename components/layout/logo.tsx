import Link from "next/link";
import { Goal } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-2.5", className)}
      aria-label="BetApp home"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-brand text-primary-foreground shadow-[0_0_28px_rgba(34,197,94,0.28)] transition-transform group-hover:-rotate-6">
        <Goal className="size-5" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">
            Bet<span className="text-brand">App</span>
          </span>
          <span className="rounded-full border border-brand/30 bg-brand/10 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-[0.16em] text-brand">
            BETA
          </span>
        </span>
      )}
    </Link>
  );
}
